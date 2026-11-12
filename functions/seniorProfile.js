// functions/seniorProfile.js
//
// getSeniorProfile: the data behind the "View Senior Profile" modal. It returns the senior's
// personal / family details and a STATUS for each document (verified / submitted / missing).
// It NEVER returns an image or file: document photos are only opened in the deliberate
// verification step (Senior Records > Verify / Review documents), not in the profile view.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const REGION = { region: "asia-southeast1" };
const db = () => admin.firestore();

const PRIMARY_LABELS = {
  philsys: "National ID (PhilSys)", sss: "SSS ID / UMID", gsis: "GSIS ID / UMID",
  drivers_license: "Driver's License", voters_id: "Voter's ID", passport: "Passport",
};

function parseDob(v) {
  const s = String(v || "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);            // the app stores toLocaleDateString()
  if (m) return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
function ageOf(d) {
  if (!d) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age -= 1;
  return age;
}

exports.getSeniorProfile = onCall(REGION, async ({ auth, data }) => {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in as an OSCA staff account first.");
  const staffSnap = await db().collection("admins").doc(auth.uid).get();
  const staff = staffSnap.exists ? staffSnap.data() : null;
  if (!staff || !["super_admin", "sub_admin"].includes(staff.role) || staff.locked === true) {
    throw new HttpsError("permission-denied", "You are not allowed to do this.");
  }
  const uid = String((data && data.uid) || "");
  const applicationId = String((data && data.applicationId) || "");
  if (!uid && !applicationId) throw new HttpsError("invalid-argument", "Missing senior.");

  let person, kinds = [], verifiedDocs = [], migrated = false, legacyApproved = false;
  let source, accountStatus, recordNo = null;

  if (applicationId) {
    const s = await db().collection("senior_applications").doc(applicationId).get();
    if (!s.exists) throw new HttpsError("not-found", "This application no longer exists.");
    person = s.data();
    source = "application";
    accountStatus = String(person.status || "pending").toUpperCase();
    recordNo = person.recordNo || null;
    kinds = (person.documentKinds || []).map((k) => (k === "document" ? "birth_certificate" : k));
    verifiedDocs = (person.verification && person.verification.documents) || [];
  } else {
    const u = await db().collection("users").doc(uid).get();
    if (!u.exists) throw new HttpsError("not-found", "That account no longer exists.");
    person = u.data();
    source = "account";
    accountStatus = String(person.status || "PENDING").toUpperCase();
    const [rec, docs, legacy] = await Promise.all([
      db().collection("senior_records").doc(uid).get(),
      db().collection("senior_documents").where("uid", "==", uid).select("kind").get(),   // kind only, never the image
      db().collection("id_verifications").where("uid", "==", uid).where("status", "==", "approved").select("status").limit(1).get(),
    ]);
    if (rec.exists) {
      recordNo = rec.data().recordNo;
      verifiedDocs = (rec.data().verification && rec.data().verification.documents) || [];
      migrated = !!(rec.data().verification && rec.data().verification.migrated);
    }
    kinds = docs.docs.map((d) => d.data().kind);
    legacyApproved = !legacy.empty;
  }

  // A barangay sub-admin only sees seniors of their own barangay.
  if (staff.role === "sub_admin" && staff.barangay &&
      String(person.barangay || "").toLowerCase() !== String(staff.barangay).toLowerCase()) {
    throw new HttpsError("permission-denied", "This senior is registered in another barangay.");
  }

  const verifiedPrimary = verifiedDocs.filter((d) => PRIMARY_LABELS[d.type]).map((d) => PRIMARY_LABELS[d.type]);
  let primaryId;
  if (verifiedPrimary.length) primaryId = { status: "verified", type: [...new Set(verifiedPrimary)].join(", ") };
  else if (kinds.includes("id")) primaryId = { status: "submitted", type: null };
  else if (migrated || legacyApproved) primaryId = { status: "verified", type: "Verified earlier by OSCA" };
  else primaryId = { status: "missing", type: null };

  const birth = verifiedDocs.some((d) => d.type === "birth_certificate") ? "verified"
    : kinds.includes("birth_certificate") ? "submitted" : "missing";
  const brgyCert = kinds.includes("barangay_certificate") ? "submitted" : "missing";

  const dob = parseDob(person.dob);
  const guardians = Array.isArray(person.guardians) ? person.guardians : [];
  return {
    source, accountStatus, recordNo,
    isVerified: person.isVerified === true,
    personal: {
      fullName: [person.firstName, person.midName, person.lastName].filter(Boolean).join(" "),
      dob: person.dob || "", age: ageOf(dob),
      sex: person.gender || "",
      address: person.address || "", barangay: person.barangay || "", district: person.district || "",
    },
    contacts: guardians.map((g) => ({ name: g.name || "", relationship: g.relationship || "", phone: g.phone || "" })),
    primaryId,
    documents: [
      { key: "birth_certificate", label: "Birth Certificate", status: birth },
      { key: "barangay_certificate", label: "Barangay Certificate of Residency", status: brgyCert },
    ],
  };
});
