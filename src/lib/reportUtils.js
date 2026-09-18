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

function extractDate(data) {
  for (const field of DATE_FIELD_CANDIDATES) {
    const raw = data[field];
    if (!raw) continue;
    const date = typeof raw.toDate === 'function' ? raw.toDate() : new Date(raw);
    if (!isNaN(date)) return date;
  }
  return null;
}

function serializeValue(value) {
  if (value && typeof value.toDate === 'function') return value.toDate().toLocaleString();
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return value;
}

/**
 * Fetches real records for a report type, scoped to a barangay if provided,
 * and filtered to the [dateFrom, dateTo] range (inclusive) when the doc has
 * a recognizable date field. Docs without a recognizable date field are
 * included by default rather than silently dropped.
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

    const row = { id: doc.id };
    Object.entries(data).forEach(([key, value]) => {
      row[key] = serializeValue(value);
    });
    rows.push(row);
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