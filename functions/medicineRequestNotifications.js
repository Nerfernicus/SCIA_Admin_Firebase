// Fires when a medicine request's status changes. Notifies the senior when the
// barangay office approves, rejects or releases it:
//   1. writes an in-app notification to /notifications (shown in the home bell)
//   2. sends an FCM push to users/{uid}.push_token (Android, if registered)

const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

if (!getApps().length) initializeApp();

const MESSAGES = {
  approved: (r) => ({
    title: "Your medicine request was approved",
    body: `${r.medicineName} (x${r.quantity}) is approved.${r.adminRemarks ? ` Note: ${r.adminRemarks}` : ""}${
      r.hasPrescription ? " Please bring your prescription." : ""
    }`,
  }),
  rejected: (r) => ({
    title: "Your medicine request was not approved",
    body: `${r.medicineName}${r.adminRemarks ? `: ${r.adminRemarks}` : "."}`,
  }),
  released: (r) => ({
    title: "Your medicine was released",
    body: `${r.medicineName} (x${r.quantity}) has been released to you.`,
  }),
};

exports.onMedicineRequestStatusChange = onDocumentUpdated(
  "medicine_requests/{requestId}",
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (!before || !after || before.status === after.status) return;

    const build = MESSAGES[after.status];
    if (!build || !after.uid) return; // pending / cancelled don't notify

    const requestId = event.params.requestId;
    const db = getFirestore();
    const { title, body } = build(after);

    // Deterministic ID => a retried run overwrites instead of duplicating.
    await db.doc(`notifications/${requestId}_${after.status}`).set({
      uid: after.uid,
      type: "medicine_request_status",
      requestId,
      status: after.status,
      title,
      body,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    const userSnap = await db.doc(`users/${after.uid}`).get();
    const token = userSnap.get("push_token") || userSnap.get("fcmToken");
    if (!token) return;

    try {
      await getMessaging().send({
        token,
        notification: { title, body },
        data: { type: "medicine_request_status", requestId, status: after.status },
      });
    } catch (err) {
      if (
        err.code === "messaging/registration-token-not-registered" ||
        err.code === "messaging/invalid-registration-token"
      ) {
        await userSnap.ref.update({ push_token: FieldValue.delete() }).catch(() => {});
      } else {
        console.error("FCM send failed", err);
      }
    }
  },
);
