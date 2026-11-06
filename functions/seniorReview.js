// reviewSenior: the ONLY way OSCA approves, rejects or flags a senior's account.
//
// Why a Cloud Function: every decision must leave a record that nobody can edit or skip. The
// function (1) checks the caller is an authenticated OSCA (super_admin) account, (2) re-checks
// eligibility on the server, (3) writes the decision AND an admin_audit entry in ONE batch, so
// either both exist or neither does. firestore.rules stops the dashboard from writing these fields
// directly. The reviewer is always taken from the signed-in account, never from the request.
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { checkEligibility } = require("./eligibility");
const { resolveBarangay } = require("./barangays");
const { referenceCode } = require("./referenceCode");

const ACTIONS = ["approve", "reject", "flag", "unflag"];
const ELIGIBILITY_LABEL = {
  age: "the senior is under 60",
  address: "the address is not in Valenzuela",
  idPhoto: "ID photo on file",
  idFormat: "valid OSCA ID number",
  duplicate: "this OSCA ID is already used by another account",
};

exports.reviewSenior = onCall({ region: "asia-southeast1" }, async (request) => {
  const { auth, data } = request;
  if (!auth) throw new HttpsError("unauthenticated", "Sign in as an OSCA staff account first.");

  const db = admin.firestore();
  const FV = admin.firestore.FieldValue;

  const adminSnap = await db.collection("admins").doc(auth.uid).get();
  if (!adminSnap.exists || adminSnap.data().role !== "super_admin") {
    throw new HttpsError("permission-denied", "Only OSCA (super admin) can review senior accounts.");
  }
  const staff = adminSnap.data();
  const actorName = staff.name || (auth.token && auth.token.email) || auth.uid;

  const uid = String((data && data.uid) || "");
  const action = String((data && data.action) || "");
  const reason = String((data && data.reason) || "").trim().slice(0, 500);
  if (!uid) throw new HttpsError("invalid-argument", "Missing senior.");
  if (!ACTIONS.includes(action)) throw new HttpsError("invalid-argument", "Unknown action.");

  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "That account no longer exists.");
  const u = snap.data();
  const before = u.status || "PENDING";

  const update = {};
  let auditAction;
  let after = before;
  let failedChecks = [];

  if (action === "approve" || action === "reject") {
    if (before !== "PENDING" && before !== "REJECTED") {
      throw new HttpsError("failed-precondition", `This account is already ${before.toLowerCase()}.`);
    }
  }

  if (action === "approve") {
    const id = String(u.idNumber || "").trim();
    const photo = await db.collection("id_verifications").where("uid", "==", uid).limit(1).get();
    let duplicateCount = 0;
    if (id && !/^TEMP/i.test(id)) {
      const dup = await db.collection("users").where("idNumber", "==", id).limit(3).get();
      duplicateCount = dup.docs.filter((d) => d.id !== uid).length;
    }
    const elig = checkEligibility(u, { hasIdPhoto: !photo.empty, duplicateCount, resolveBarangay });
    failedChecks = elig.items.filter((i) => !i.ok).map((i) => i.key);
    if (elig.hardFail) {
      const why = elig.items.filter((i) => !i.ok && i.hard).map((i) => ELIGIBILITY_LABEL[i.key]).join(", ");
      throw new HttpsError("failed-precondition", `Cannot approve: ${why}.`);
    }
    if (elig.softFail && reason.length < 5) {
      throw new HttpsError("invalid-argument", "Please write why you are approving although some checks failed.");
    }
    after = "ACTIVE";
    Object.assign(update, {
      status: "ACTIVE", isVerified: true, verifiedAt: FV.serverTimestamp(),
      reviewDecision: "approved", reviewReason: reason || null, rejectionReason: FV.delete(),
    });
    auditAction = "senior_approved";
  } else if (action === "reject") {
    if (reason.length < 5) throw new HttpsError("invalid-argument", "Please write the reason for rejecting (at least 5 characters).");
    after = "REJECTED";
    Object.assign(update, {
      status: "REJECTED", isVerified: false,
      reviewDecision: "rejected", reviewReason: reason, rejectionReason: reason,
    });
    auditAction = "senior_rejected";
  } else if (action === "flag") {
    if (reason.length < 3) throw new HttpsError("invalid-argument", "Please write a short note about why this account is flagged.");
    Object.assign(update, {
      flagged: true, flagNote: reason, flaggedBy: auth.uid, flaggedByName: actorName, flaggedAt: FV.serverTimestamp(),
    });
    auditAction = "senior_flagged";
  } else {
    Object.assign(update, { flagged: false, flagNote: FV.delete() });
    auditAction = "senior_unflagged";
  }

  if (action === "approve" || action === "reject") {
    Object.assign(update, { reviewedBy: auth.uid, reviewerName: actorName, reviewedAt: FV.serverTimestamp() });
  }

  const batch = db.batch();
  batch.update(ref, update);
  batch.set(db.collection("admin_audit").doc(), {
    action: auditAction,
    actorUid: auth.uid,
    actorName,
    actorRole: "super_admin",
    targetUid: uid,
    targetRef: referenceCode(uid), // a code, not the senior's name
    reason: reason || null,
    before,
    after,
    failedChecks,
    at: FV.serverTimestamp(),
  });
  await batch.commit();

  return { ok: true, status: after, flagged: action === "flag" ? true : action === "unflag" ? false : !!u.flagged };
});
