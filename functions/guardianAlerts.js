// functions/guardianAlerts.js
//
// Texts a senior's opted-in guardians when an appointment is confirmed.
// (The "ID is ready" text is sent from idRequestNotifications.js, next to the
// in-app notification for the same status change.)
//
// Wire it up in functions/functions.js:
//   exports.onAppointmentConfirmedGuardians = require("./guardianAlerts").onAppointmentConfirmedGuardians;

const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp, getApps } = require("firebase-admin/app");
const { SMS_API_KEY } = require("./sms");
const { textGuardians } = require("./guardianSms");

if (!getApps().length) initializeApp();

exports.onAppointmentConfirmedGuardians = onDocumentUpdated(
  { document: "appointments/{appointmentId}", region: "asia-southeast1", secrets: [SMS_API_KEY] },
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (!before || !after) return;
    // Only the moment it becomes confirmed, so a retried or edited document never texts twice.
    if (before.status === after.status || after.status !== "confirmed") return;
    if (!after.uid) return;

    const when = [after.date, after.time].filter(Boolean).join(" ");
    await textGuardians(after.uid, "appointmentConfirmed", (name) =>
      `SCIA: ${name}'s health appointment${after.type ? ` (${after.type})` : ""} is confirmed${when ? ` for ${when}` : ""}${after.center ? ` at ${after.center}` : ""}.`,
    );
  },
);
