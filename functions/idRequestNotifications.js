// functions/idRequestNotifications.js
//
// Fires whenever an /id_requests document changes. If `status` changed, it:
//   1. writes an in-app notification to /notifications (senior reads it in the app)
//   2. sends an FCM push to users/{uid}.fcmToken (if the senior has a token)
//
// Wire it up in functions/index.js:
//   exports.onIdRequestStatusChange = require("./idRequestNotifications").onIdRequestStatusChange;
//
// Uses firebase-functions v2 + CommonJS. If your functions folder uses ESM
// ("type": "module"), swap the require() lines for import statements.

const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

if (!getApps().length) initializeApp();

// Which statuses notify the senior, and what the message says.
// `received` is intentionally not here (it's a barangay-side confirmation).
// If you'd rather tell the senior "ready for pick-up" only AFTER the barangay
// confirms, move the `delivered` message to `received`.
const MESSAGES = {
  processing: () => ({
    title: "Your ID request is being processed",
    body: "OSCA has started processing your Senior Citizen ID.",
  }),
  delivered: (r) => ({
    title: "Your Senior Citizen ID is ready for pick-up",
    body: `Your physical ID has been delivered to ${r.barangay || "your barangay"}. You may claim it there.`,
  }),
  done: () => ({
    title: "ID claimed",
    body: "Your Senior Citizen ID has been marked as claimed. Thank you!",
  }),
  cancelled: (r) => ({
    title: "Your ID request was cancelled",
    body: r.cancelReason
      ? `Reason: ${r.cancelReason}`
      : "Please contact OSCA for details or submit a new request.",
  }),
};

exports.onIdRequestStatusChange = onDocumentUpdated(
  "id_requests/{requestId}",
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (!before || !after || before.status === after.status) return;

    const build = MESSAGES[after.status];
    if (!build || !after.uid) return;

    const { title, body } = build(after);
    const requestId = event.params.requestId;
    const db = getFirestore();

    // Deterministic doc ID => if the function is retried, it overwrites
    // instead of creating a duplicate notification.
    await db.doc(`notifications/${requestId}_${after.status}`).set({
      uid: after.uid,
      type: "id_request_status",
      requestId,
      status: after.status,
      title,
      body,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    // Push notification (optional — only if the app saved an fcmToken)
    const userSnap = await db.doc(`users/${after.uid}`).get();
    const token = userSnap.get("fcmToken");
    if (!token) return;

    try {
      await getMessaging().send({
        token,
        notification: { title, body },
        data: { type: "id_request_status", requestId, status: after.status },
      });
    } catch (err) {
      // Token no longer valid (app uninstalled / token rotated) -> clean it up
      if (
        err.code === "messaging/registration-token-not-registered" ||
        err.code === "messaging/invalid-registration-token"
      ) {
        await userSnap.ref.update({ fcmToken: FieldValue.delete() });
      } else {
        console.error("FCM send failed", err);
      }
    }
  }
);
