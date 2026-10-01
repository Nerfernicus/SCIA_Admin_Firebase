// functions/accountControls.js
//
// Account-control callables:
//   setAdminLock             super admin locks / unlocks a Barangay admin
//   resetUserPassword        super admin resets a senior's password
//   deactivateInactiveUser   super admin deactivates one senior inactive > 180 days
//   requestPasswordResetOtp  senior asks for an SMS one-time code (Forgot Password)
//   resetPasswordWithOtp     senior submits the code + a new password
//
// Everything privileged runs here with the Admin SDK; the client never gets to
// write these fields itself (see firestore.rules).

const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { sendSms, normalizePhNumber, SMS_API_KEY } = require("./sms");

const db = admin.firestore();
const auth = admin.auth();
const REGION = { region: "asia-southeast1" };

const OTP_TTL_MS = 10 * 60 * 1000;        // a code is valid for 10 minutes
const OTP_RESEND_MS = 60 * 1000;          // at most one SMS per minute
const OTP_MAX_PER_HOUR = 5;               // and five per hour
const OTP_MAX_ATTEMPTS = 5;               // wrong guesses before the code is burned
const MIN_PASSWORD_LENGTH = 6;            // Firebase Auth's own minimum

// ── helpers ─────────────────────────────────────────────────────────────────
async function requireSuperAdmin(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
  const snap = await db.collection("admins").doc(request.auth.uid).get();
  const data = snap.exists ? snap.data() : null;
  if (!data || String(data.role).trim() !== "super_admin" || data.locked === true) {
    throw new HttpsError("permission-denied", "Only the OSCA Super Admin can do this.");
  }
  return { uid: request.auth.uid, data };
}

// Readable temporary password from a crypto source (no ambiguous 0/O/1/l/I).
function generateTempPassword() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[crypto.randomInt(alphabet.length)];
  return out;
}

function hashOtp(uid, otp, salt) {
  return crypto.createHash("sha256").update(`${uid}:${otp}:${salt}`).digest("hex");
}

function safeEqualHex(a, b) {
  const ba = Buffer.from(String(a), "hex");
  const bb = Buffer.from(String(b), "hex");
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// The sign-up code writes user_lookup entries under: the ID number (lowercase),
// the phone number as typed, and the full / first+last name. Accept either an
// ID number or a phone number here.
async function findUidByIdentifier(identifier) {
  const raw = String(identifier || "").trim();
  if (!raw) return null;
  const keys = new Set([raw.toLowerCase(), raw]);
  const ph = normalizePhNumber(raw);
  if (ph) { keys.add(`0${ph.slice(2)}`); keys.add(`+${ph}`); keys.add(ph); }
  for (const key of keys) {
    if (key.includes("/")) continue; // Firestore doc ids cannot contain "/"
    const snap = await db.collection("user_lookup").doc(key).get();
    if (snap.exists && snap.data().uid) return snap.data().uid;
  }
  return null;
}

function validatePassword(pw) {
  const s = String(pw || "");
  if (s.length < MIN_PASSWORD_LENGTH) {
    throw new HttpsError("invalid-argument", `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (s.length > 64) throw new HttpsError("invalid-argument", "Password is too long.");
  return s;
}

async function audit(action, actorUid, targetUid, extra = {}) {
  try {
    await db.collection("admin_audit").add({
      action, actorUid, targetUid, ...extra,
      at: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    logger.warn("audit write failed:", e.message);
  }
}

// ── Super admin: lock / unlock a Barangay admin ─────────────────────────────
exports.setAdminLock = onCall(REGION, async (request) => {
  const caller = await requireSuperAdmin(request);
  const { uid, locked } = request.data || {};
  if (typeof uid !== "string" || !uid || typeof locked !== "boolean") {
    throw new HttpsError("invalid-argument", "uid and locked (true/false) are required.");
  }
  if (uid === caller.uid) throw new HttpsError("failed-precondition", "You cannot lock your own account.");

  const ref = db.collection("admins").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "That admin account does not exist.");
  if (String(snap.data().role).trim() !== "sub_admin") {
    throw new HttpsError("failed-precondition", "Only Barangay admin accounts can be locked or unlocked.");
  }

  // Disabling the Auth user stops new sign-ins; revoking tokens ends open sessions.
  await auth.updateUser(uid, { disabled: locked });
  if (locked) await auth.revokeRefreshTokens(uid);

  await ref.update(locked
    ? { locked: true, lockedAt: admin.firestore.FieldValue.serverTimestamp(), lockedBy: caller.uid }
    : { locked: false, lockedAt: admin.firestore.FieldValue.delete(), lockedBy: admin.firestore.FieldValue.delete(),
        unlockedAt: admin.firestore.FieldValue.serverTimestamp(), unlockedBy: caller.uid });

  await audit(locked ? "admin_locked" : "admin_unlocked", caller.uid, uid, { barangay: snap.data().barangay || null });
  return { ok: true, uid, locked };
});

// ── Super admin: deactivate ONE senior account that has been inactive ───────
// The 180-day rule is enforced here (not just in the UI). "Last activity" is
// the most recent of: the phone's presence ping, the last app login, and the
// account creation time, so an account is never judged on a missing field.
const INACTIVITY_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

function lastActivityMs(u) {
  const ms = (t) => (t && typeof t.toMillis === "function" ? t.toMillis() : 0);
  return Math.max(ms(u.last_active_timestamp), ms(u.lastLoginAt), ms(u.lastActivityAt), ms(u.createdAt));
}

exports.deactivateInactiveUser = onCall(REGION, async (request) => {
  const caller = await requireSuperAdmin(request);
  const { uid } = request.data || {};
  if (typeof uid !== "string" || !uid) throw new HttpsError("invalid-argument", "uid is required.");

  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "That user does not exist.");
  const u = snap.data();
  if (u.status === "SUSPENDED") throw new HttpsError("failed-precondition", "This account is already deactivated.");

  const last = lastActivityMs(u);
  const daysInactive = last ? Math.floor((Date.now() - last) / DAY_MS) : 0;
  if (!last || daysInactive <= INACTIVITY_DAYS) {
    throw new HttpsError(
      "failed-precondition",
      `Only accounts inactive for more than ${INACTIVITY_DAYS} days can be deactivated. This one has been inactive for ${daysInactive} day(s).`
    );
  }

  await ref.update({
    status: "SUSPENDED",
    deactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
    deactivatedBy: caller.uid,
    deactivationReason: `inactive_${INACTIVITY_DAYS}_days`,
  });
  await audit("user_deactivated", caller.uid, uid, { daysInactive });
  return { ok: true, daysInactive };
});

// ── Super admin: reset a senior's password ──────────────────────────────────
exports.resetUserPassword = onCall(REGION, async (request) => {
  const caller = await requireSuperAdmin(request);
  const { uid } = request.data || {};
  if (typeof uid !== "string" || !uid) throw new HttpsError("invalid-argument", "uid is required.");

  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new HttpsError("not-found", "That user does not exist.");

  const tempPassword = generateTempPassword();
  try {
    await auth.updateUser(uid, { password: tempPassword });
  } catch (err) {
    logger.error("resetUserPassword:", err.message);
    throw new HttpsError("internal", "Could not reset the password. Please try again.");
  }
  await auth.revokeRefreshTokens(uid);
  await userRef.update({
    loginAttempts: 0,
    loginLockedUntil: admin.firestore.FieldValue.delete(),
    passwordResetAt: admin.firestore.FieldValue.serverTimestamp(),
    passwordResetBy: caller.uid,
  });
  await audit("user_password_reset", caller.uid, uid);

  // Shown once to the admin so they can hand it to the senior.
  return { ok: true, tempPassword, idNumber: userSnap.data().idNumber || null };
});

// ── Senior: Forgot Password step 1 - send an OTP by SMS ─────────────────────
exports.requestPasswordResetOtp = onCall({ ...REGION, secrets: [SMS_API_KEY] }, async (request) => {
  const identifier = String((request.data || {}).identifier || "").trim();
  if (!identifier || identifier.length > 60) {
    throw new HttpsError("invalid-argument", "Enter your ID number or registered mobile number.");
  }

  // Same answer whether or not the account exists, so this cannot be used to
  // find out who is registered.
  const generic = { ok: true, message: "If that account exists, a 6-digit code was sent to its registered mobile number." };

  const uid = await findUidByIdentifier(identifier);
  if (!uid) return generic;
  const userSnap = await db.collection("users").doc(uid).get();
  const phone = userSnap.exists ? normalizePhNumber(userSnap.data().conNumber) : null;
  if (!phone) return generic;

  const ref = db.collection("password_resets").doc(uid);
  const prev = (await ref.get()).data() || {};
  const now = Date.now();
  if (prev.lastSentAt && now - prev.lastSentAt < OTP_RESEND_MS) {
    throw new HttpsError("resource-exhausted", "Please wait a minute before asking for another code.");
  }
  const windowStart = prev.windowStart && now - prev.windowStart < 3600000 ? prev.windowStart : now;
  const sentInWindow = windowStart === prev.windowStart ? (prev.sentInWindow || 0) : 0;
  if (sentInWindow >= OTP_MAX_PER_HOUR) {
    throw new HttpsError("resource-exhausted", "Too many code requests. Please try again later or ask OSCA to reset your password.");
  }

  const otp = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const salt = crypto.randomBytes(8).toString("hex");
  await ref.set({
    otpHash: hashOtp(uid, otp, salt), salt,
    expiresAt: now + OTP_TTL_MS, attempts: 0,
    lastSentAt: now, windowStart, sentInWindow: sentInWindow + 1,
  });

  const result = await sendSms([phone], `SCIA: Your password reset code is ${otp}. It expires in 10 minutes. Do not share this code with anyone.`);
  if (result.failed.length) {
    logger.error("OTP SMS failed:", JSON.stringify(result.failed));
    throw new HttpsError("unavailable", "We could not send the code right now. Please try again or contact OSCA.");
  }
  return generic;
});

// ── Senior: Forgot Password step 2 - verify the OTP, set a new password ─────
exports.resetPasswordWithOtp = onCall(REGION, async (request) => {
  const { identifier, otp, newPassword } = request.data || {};
  const code = String(otp || "").trim();
  if (!/^\d{6}$/.test(code)) throw new HttpsError("invalid-argument", "Enter the 6-digit code.");
  const password = validatePassword(newPassword);

  const badCode = new HttpsError("permission-denied", "That code is not valid or has expired. Request a new one.");
  const uid = await findUidByIdentifier(identifier);
  if (!uid) throw badCode;

  const ref = db.collection("password_resets").doc(uid);
  const snap = await ref.get();
  const rec = snap.exists ? snap.data() : null;
  if (!rec || !rec.otpHash || Date.now() > rec.expiresAt) throw badCode;

  if ((rec.attempts || 0) >= OTP_MAX_ATTEMPTS) {
    await ref.update({ otpHash: admin.firestore.FieldValue.delete() });
    throw new HttpsError("resource-exhausted", "Too many wrong codes. Request a new code.");
  }
  if (!safeEqualHex(hashOtp(uid, code, rec.salt), rec.otpHash)) {
    await ref.update({ attempts: admin.firestore.FieldValue.increment(1) });
    throw badCode;
  }

  await auth.updateUser(uid, { password });
  await auth.revokeRefreshTokens(uid);
  await ref.update({ otpHash: admin.firestore.FieldValue.delete(), attempts: 0 });
  await db.collection("users").doc(uid).update({
    loginAttempts: 0,
    loginLockedUntil: admin.firestore.FieldValue.delete(),
    passwordResetAt: admin.firestore.FieldValue.serverTimestamp(),
    passwordResetBy: "self_otp",
  }).catch(() => {});
  return { ok: true };
});
