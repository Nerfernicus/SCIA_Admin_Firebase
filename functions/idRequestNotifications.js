// functions/idRequestNotifications.js
//
// Fires whenever an /id_requests document changes. If `status` changed, it:
//   1. writes an in-app notification to /notifications (senior reads it in the app)
//   2. sends an FCM push to users/{uid}.fcmToken (if the senior has a token)
//
// Wire it up in functions/index.js:
//   exports.onIdRequestStatusChange = require("./idRequestNotifications").onIdRequestStatusChange;
//   exports.onIdRequestDeleted = require("./idRequestNotifications").onIdRequestDeleted;
//
// Uses firebase-functions v2 + CommonJS. If your functions folder uses ESM
// ("type": "module"), swap the require() lines for import statements.

const { onDocumentUpdated, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { freePickupSlot, formatPickup } = require("./pickup");
const { SMS_API_KEY } = require("./sms");
const { textGuardians } = require("./guardianSms");

if (!getApps().length) initializeApp();

// Which statuses notify the senior, and what the message says.
// Only OSCA at City Hall releases physical IDs now, so there is no "delivered
// to barangay" step: the ID goes processing -> ready (claim at OSCA) -> done.
const MESSAGES = {
  processing: () => ({
    title: "Your ID request is being processed",
    body: "OSCA has started processing your Senior Citizen ID.",
  }),
  ready: (r) => ({
    title: "Your Senior Citizen ID is ready to claim",
    body: r.pickup && r.pickup.date
      ? `Please go to the OSCA Office at Valenzuela City Hall on ${formatPickup(r.pickup)}. Bring a valid ID.`
      : "Please contact the OSCA Office at Valenzuela City Hall to set your pickup time.",
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
  { document: "id_requests/{requestId}", secrets: [SMS_API_KEY] },
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (!before || !after || before.status === after.status) return;

    const requestId = event.params.requestId;
    const db = getFirestore();

    // A cancelled / rejected request gives its pickup seat back to someone else.
    if ((after.status === "cancelled" || after.status === "rejected") && after.pickup) {
      try {
        await freePickupSlot(after.pickup);
      } catch (err) {
        console.error("freePickupSlot failed", err);
      }
    }

    const build = MESSAGES[after.status];
    if (!build || !after.uid) return;

    const { title, body } = build(after);

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

    // Opted-in guardians get a text when the ID is ready to claim. A failed text
    // must never stop the push below, so it is caught here.
    if (after.status === "ready") {
      try {
        await textGuardians(after.uid, "idReady", (name) =>
          `SCIA: ${name}'s Senior Citizen ID is ready to claim at the OSCA Office, Valenzuela City Hall.${
            after.pickup && after.pickup.date ? ` Pickup: ${formatPickup(after.pickup)}.` : ""
          }`,
        );
      } catch (err) {
        console.error("guardian SMS (idReady) failed", err);
      }
    }

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

// A deleted request that still held a pickup seat gives it back.
exports.onIdRequestDeleted = onDocumentDeleted("id_requests/{requestId}", async (event) => {
  const before = event.data && event.data.data();
  if (!before || !before.pickup) return;
  if (["done", "cancelled", "rejected"].includes(before.status)) return; // already freed or in the past
  try {
    await freePickupSlot(before.pickup);
  } catch (err) {
    console.error("freePickupSlot (delete) failed", err);
  }
});
