import { db } from '../lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

// Maps a report "type" id (from GenerateReportModal) to its Firestore collection.
// These follow the same collection names Analytics.jsx already queries against —
// double check 'health' and 'announcements' if your schema has since changed,
// since the naming in the original Analytics.jsx looked swapped
// (the "announcements" stat count actually reads from 'editorial_health').
export const REPORT_COLLECTION_MAP = {
  sos: 'emergencies',
  users: 'users',
  verification: 'id_verifications',
  health: 'health_centers',
  announcements: 'editorial_health',
};

// Firestore Timestamp fields we'll look for on a doc, in priority order.
const DATE_FIELD_CANDIDATES = ['createdAt', 'timestamp', 'date', 'created_at'];

// Fields we never show an admin, regardless of report type — pure technical
// identifiers with no meaning to a non-developer reader.
const HIDDEN_FIELDS = ['uid', 'latitude', 'longitude'];

// Human-readable labels for fields we know about. Anything not listed here
// falls back to an auto Title-Cased version of its camelCase key.
const FIELD_LABELS = {
  name: 'Name',
  barangay: 'Barangay',
  address: 'Address',
  status: 'Status',
  createdAt: 'Date Reported',
  dispatchedAt: 'Date Dispatched',
  resolvedAt: 'Date Resolved',
  email: 'Email',
  phone: 'Phone Number',
  phoneNumber: 'Phone Number',
  title: 'Title',
  content: 'Message',
  body: 'Message',
  publishedAt: 'Date Published',
  submittedAt: 'Date Submitted',
  reviewedAt: 'Date Reviewed',
  idType: 'ID Type',
  contactNumber: 'Contact Number',
  facilityName: 'Facility Name',
};

// The columns worth showing an admin, per report type, in display order.
// Confirmed against real data for 'sos'; the others are best-guess field
// names — if a collection's real fields don't match, buildFriendlyRow()
// falls back to showing every non-hidden field so nothing goes missing.
const COLUMN_ORDER = {
  sos: ['name', 'barangay', 'address', 'status', 'createdAt', 'dispatchedAt', 'resolvedAt'],
  users: ['name', 'email', 'phone', 'phoneNumber', 'barangay', 'status', 'createdAt'],
  verification: ['name', 'barangay', 'idType', 'status', 'submittedAt', 'createdAt', 'reviewedAt'],
  health: ['name', 'facilityName', 'barangay', 'address', 'contactNumber', 'status'],
  announcements: ['title', 'barangay', 'content', 'body', 'status', 'createdAt', 'publishedAt'],
};

function toTitleCase(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

function friendlyLabel(key) {
  return FIELD_LABELS[key] || toTitleCase(key);
}

function extractDate(data) {
  for (const field of DATE_FIELD_CANDIDATES) {
    const raw = data[field];
    if (!raw) continue;
    const date = typeof raw.toDate === 'function' ? raw.toDate() : new Date(raw);
    if (!isNaN(date)) return date;
  }
  return null;
}

function serializeValue(key, value) {
  if (value && typeof value.toDate === 'function') return value.toDate().toLocaleString();
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  if (key === 'status' && typeof value === 'string' && value.length) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
  return value;
}

// Builds one admin-friendly row: known important fields first with plain
// labels, id/uid always excluded. Falls back to showing every remaining
// field if none of the expected ones were found on this doc.
function buildFriendlyRow(reportType, data) {
  const order = COLUMN_ORDER[reportType] || [];
  const row = {};
  let matched = 0;

  order.forEach((key) => {
    if (key in data && !HIDDEN_FIELDS.includes(key)) {
      row[friendlyLabel(key)] = serializeValue(key, data[key]);
      matched++;
    }
  });

  if (matched === 0) {
    Object.keys(data).forEach((key) => {
      if (HIDDEN_FIELDS.includes(key)) return;
      row[friendlyLabel(key)] = serializeValue(key, data[key]);
    });
  }

  return row;
}

/**
 * Fetches real records for a report type, scoped to a barangay if provided,
 * filtered to the [dateFrom, dateTo] range (inclusive) when the doc has a
 * recognizable date field, and reduced to admin-friendly columns only —
 * no document ID, no uid, plain-English headers.
 */
export async function fetchReportRows(reportType, dateFrom, dateTo, myBarangay) {
  const collectionName = REPORT_COLLECTION_MAP[reportType];
  if (!collectionName) throw new Error(`Unknown report type: ${reportType}`);

  const ref = collection(db, collectionName);
  const conditions = myBarangay ? [where('barangay', '==', myBarangay)] : [];
  const q = conditions.length ? query(ref, ...conditions) : ref;
  const snap = await getDocs(q);

  const from = dateFrom ? new Date(dateFrom) : null;
  const to = dateTo ? new Date(`${dateTo}T23:59:59`) : null;

  const rows = [];
  snap.forEach((doc) => {
    const data = doc.data();
    const date = extractDate(data);

    if (from && to && date && (date < from || date > to)) return;

    rows.push(buildFriendlyRow(reportType, data));
  });

  return rows;
}

export function toCSV(rows) {
  if (!rows.length) return '';

  const headerSet = new Set();
  rows.forEach((r) => Object.keys(r).forEach((k) => headerSet.add(k)));
  const headers = Array.from(headerSet);

  const escape = (val) => {
    const str = val === undefined || val === null ? '' : String(val);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const lines = [headers.join(',')];
  rows.forEach((row) => lines.push(headers.map((h) => escape(row[h])).join(',')));
  return lines.join('\n');
}

export function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Requires the 'xlsx' (SheetJS) package: npm install xlsx
export async function exportExcel(rows, filename) {
  const XLSX = await import('xlsx');
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
  XLSX.writeFile(workbook, filename);
}
