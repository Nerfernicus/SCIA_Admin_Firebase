// Physical-ID-request lifecycle, shared by the OSCA page and the mobile app.
//
// Only the OSCA office at City Hall releases physical IDs (no more barangay
// delivery), so the senior comes to City Hall once, at a time they booked:
//
//   pending → processing → ready (claim at OSCA, City Hall) → done
//        └───────┴──────────┴──→ cancelled
//
// 'approved' is kept for older requests. 'delivered' / 'received' / 'released'
// are the old barangay steps; requests still sitting there are treated as
// 'ready' (see normalizeStatus) so nothing is stranded.

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
  READY: "ready", //           printed; the senior claims it at OSCA, City Hall
  DONE: "done", //             senior claimed it at City Hall (final)
  CANCELLED: "cancelled",
};

export const STATUS_LABEL = {
  pending: "Pending",
  processing: "Processing",
  ready: "Ready to claim at OSCA",
  done: "Claimed",
  cancelled: "Cancelled",
};

/** Old barangay-delivery statuses count as "ready to claim at OSCA". */
export const normalizeStatus = (status) =>
  ["delivered", "received", "released"].includes(status) ? ID_STATUS.READY : status || ID_STATUS.PENDING;

// What OSCA can move a request to from each status ('approved' kept for legacy requests)
export const OSCA_NEXT = {
  pending: ["processing", "cancelled"],
  approved: ["processing", "cancelled"],
  processing: ["ready", "cancelled"],
  ready: ["done", "cancelled"],
  done: [],
  cancelled: [],
};

// Which timestamp field each status stamps.
const STAMP_FIELD = {
  processing: "processedAt",
  ready: "readyAt",
  done: "claimedAt",
  cancelled: "cancelledAt",
};

/**
 * Build the Firestore update payload for a status transition, without
 * writing it. Used directly by callers that need to fold this into a larger
 * batch/transaction (e.g. IDManagement's "mark delivered" batch, which also
 * creates a released_ids record in the same atomic write).
 *
 * @param newStatus  one of ID_STATUS
 * @param actor      { uid, role } of the signed-in admin ("super_admin" | "sub_admin")
 * @param extra      extra fields, e.g. { cancelReason } or { controlNumber, dateIssued }.
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
 * @param actor      { uid, role } of the signed-in OSCA admin
 * @param extra      extra fields, e.g. { cancelReason }.
 */
export async function setIdRequestStatus(db, requestId, newStatus, actor, extra = {}) {
  const payload = buildStatusPayload(newStatus, actor, extra);
  await updateDoc(doc(db, "id_requests", requestId), payload);
}

/**
 * MOBILE APP: senior follows up on their own request.
 * Rules allow this once per 24h, and only while the request is still in
 * progress (pending / processing / ready).
 */
export async function sendFollowUp(db, requestId, note = "") {
  await updateDoc(doc(db, "id_requests", requestId), {
    followUpCount: increment(1),
    lastFollowUpAt: serverTimestamp(),
    lastFollowUpNote: note.trim().slice(0, 200),
  });
}
