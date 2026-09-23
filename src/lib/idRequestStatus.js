// src/lib/idRequestStatus.js
//
// One place for the physical-ID-request lifecycle so the OSCA page, the
// barangay page, and (copy of) the mobile app all agree on the same strings.
//
// pending → processing → delivered → received → done
//                └───────────┴──→ cancelled

import {
  doc,
  updateDoc,
  arrayUnion,
  increment,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

export const ID_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing", // OSCA is processing / printing
  DELIVERED: "delivered", //   OSCA delivered it to the barangay
  RECEIVED: "received", //     barangay confirmed it received the ID
  DONE: "done", //             senior claimed it (final)
  CANCELLED: "cancelled",
};

export const STATUS_LABEL = {
  pending: "Pending",
  processing: "Processing",
  delivered: "Delivered to Barangay",
  received: "Received by Barangay",
  done: "Claimed",
  cancelled: "Cancelled",
};

// What OSCA (super_admin) can move a request to, from each status.
// `approved` is only here in case your existing requests already use it —
// delete that line if you don't.
export const OSCA_NEXT = {
  pending: ["processing", "cancelled"],
  approved: ["processing", "cancelled"],
  processing: ["delivered", "cancelled"],
  delivered: ["cancelled"],
  received: [],
  done: [],
  cancelled: [],
};

// What the barangay (sub_admin) can do. Must match firestore.rules.
export const BARANGAY_NEXT = {
  delivered: ["received"],
  received: ["done"],
};

// Which timestamp field each status stamps.
const STAMP_FIELD = {
  processing: "processedAt",
  delivered: "deliveredAt",
  received: "receivedAt",
  done: "claimedAt",
  cancelled: "cancelledAt",
};

/**
 * Build the Firestore update payload for a status transition, without
 * writing it. Used directly by callers that need to fold this into a larger
 * batch/transaction (e.g. IDManagement's "mark delivered" batch, which also
 * creates a released_ids doc in the same atomic write).
 *
 * @param newStatus  one of ID_STATUS
 * @param actor      { uid, role } of the signed-in admin ("super_admin" | "sub_admin")
 * @param extra      extra fields, e.g. { cancelReason } for OSCA, or
 *                   { barangay, releasedAt } for a delivery.
 */
export function buildStatusPayload(newStatus, actor, extra = {}) {
  const payload = {
    status: newStatus,
    updatedAt: serverTimestamp(),
    // serverTimestamp() is not allowed inside arrays, so history uses Timestamp.now()
    statusHistory: arrayUnion({
      status: newStatus,
      at: Timestamp.now(),
      by: actor.uid,
      role: actor.role,
    }),
    ...extra,
  };

  const stamp = STAMP_FIELD[newStatus];
  if (stamp) payload[stamp] = serverTimestamp();

  // Who did it (matches the fields the barangay rule allows)
  if (newStatus === ID_STATUS.RECEIVED) payload.receivedBy = actor.uid;
  if (newStatus === ID_STATUS.DONE) payload.claimedBy = actor.uid;

  return payload;
}

/**
 * Move an id_request to a new status (standalone write — use this for any
 * single-document transition; use buildStatusPayload() instead when the
 * update needs to be part of a batch/transaction alongside other writes).
 *
 * @param db         Firestore instance
 * @param requestId  id_requests doc id
 * @param newStatus  one of ID_STATUS
 * @param actor      { uid, role } of the signed-in admin ("super_admin" | "sub_admin")
 * @param extra      extra fields, e.g. { cancelReason } for OSCA.
 *                   Barangay writes are limited by the rules to the tracking
 *                   fields, so don't pass anything else from the barangay page.
 */
export async function setIdRequestStatus(db, requestId, newStatus, actor, extra = {}) {
  const payload = buildStatusPayload(newStatus, actor, extra);
  await updateDoc(doc(db, "id_requests", requestId), payload);
}

/**
 * MOBILE APP: senior follows up on their own request.
 * Rules allow this once per 24h, and only while the request is still in
 * progress (pending / processing / delivered).
 */
export async function sendFollowUp(db, requestId, note = "") {
  await updateDoc(doc(db, "id_requests", requestId), {
    followUpCount: increment(1),
    lastFollowUpAt: serverTimestamp(),
    lastFollowUpNote: note.trim().slice(0, 200),
  });
}

// ── Example queries ───────────────────────────────────────────────────────
//
// BARANGAY page (only what's on its way to / sitting in that barangay):
//   query(
//     collection(db, "id_requests"),
//     where("barangay", "==", myBarangay),
//     where("status", "in", ["delivered", "received"]),
//     orderBy("deliveredAt", "desc")
//   )
//
// OSCA page: query the whole collection, show STATUS_LABEL[status] as a badge,
// show claimedAt when status === "done", and show a follow-up badge when
// followUpCount > 0 (sort by lastFollowUpAt to surface people who are waiting).
//
// SENIOR app notifications:
//   query(
//     collection(db, "notifications"),
//     where("uid", "==", auth.currentUser.uid),
//     orderBy("createdAt", "desc")
//   )
