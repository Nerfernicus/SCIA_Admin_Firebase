import React, { useState } from 'react';
import { X, FileText, Download, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchReportRows, toCSV, downloadBlob, exportExcel } from '../lib/reportUtils';

// OSCA admin sees all report types; barangay admin sees only what they can access
const SUPER_ADMIN_REPORTS = [
  { id: 'sos',           label: 'SOS Incidents',      description: 'All emergency SOS events and responses' },
  { id: 'users',         label: 'User Activity',       description: 'Registered users and activity logs' },
  { id: 'verification',  label: 'ID Verifications',    description: 'Verification requests and statuses' },
  { id: 'health',        label: 'Health Centers',      description: 'Health center usage and visits' },
  { id: 'announcements', label: 'Announcements',       description: 'Published announcements and reach' },
];

// Sub admin can only see their own accessible sections
const SUB_ADMIN_REPORTS = [
  { id: 'sos',           label: 'SOS Incidents',       description: 'Emergency SOS events and responses' },
  { id: 'health',        label: 'Health Centers',      description: 'Appointments and medication records' },
  { id: 'announcements', label: 'Announcements',       description: 'Published announcements and reach' },
];

// PDF removed: the previous implementation never produced a real PDF, just a
// text file wearing a .pdf extension, which is why it errored on open.
const FORMATS = ['CSV', 'Excel'];

const GenerateReportModal = ({ isOpen, onClose, isSuperAdmin }) => {
  const { adminData } = useAuth();
  const myBarangay = adminData?.barangay || null;

  const REPORT_TYPES = isSuperAdmin ? SUPER_ADMIN_REPORTS : SUB_ADMIN_REPORTS;

  const [selectedType, setSelectedType] = useState(REPORT_TYPES[0].id);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [format,   setFormat]   = useState('CSV');
  const [status,   setStatus]   = useState('idle'); // idle | loading | done
  const [error,    setError]    = useState('');

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!dateFrom || !dateTo) {
      alert('Please select a date range.');
      return;
    }

    setStatus('loading');
    setError('');

    try {
      // Sub-admins are scoped to their own barangay; the report modal only
      // ever offers them collections that carry a 'barangay' field, so this
      // filter is safe for every SUB_ADMIN_REPORTS entry.
      const rows = await fetchReportRows(
        selectedType,
        dateFrom,
        dateTo,
        isSuperAdmin ? null : myBarangay
      );

      if (!rows.length) {
        setStatus('idle');
        alert('No records found for that date range.');
        return;
      }

      const filenameBase = `report_${selectedType}_${dateFrom}_${dateTo}`;

      if (format === 'CSV') {
        downloadBlob(toCSV(rows), `${filenameBase}.csv`, 'text/csv;charset=utf-8;');
      } else {
        await exportExcel(rows, `${filenameBase}.xlsx`);
      }

      setStatus('done');
      setTimeout(() => { setStatus('idle'); onClose(); }, 1500);
    } catch (err) {
      console.error('Report generation failed:', err);
      setError('Something went wrong generating the report. Please try again.');
      setStatus('idle');
    }
  };

  const handleClose = () => {
    if (status === 'loading') return;
    setStatus('idle');
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={handleClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 relative" onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-[#0f52ba]/10 p-2 rounded-xl">
              <FileText size={20} className="text-[#0f52ba]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Generate Report</h2>
              <p className="text-xs text-gray-500">
                {isSuperAdmin ? 'OSCA Platform: All data' : 'Barangay Platform: Your data only'}
              </p>
            </div>
          </div>
          <button onClick={handleClose} disabled={status === 'loading'} className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40">
            <X size={20} />
          </button>
        </div>

        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Report Type</label>
          <div className="space-y-2">
            {REPORT_TYPES.map((type) => (
              <button key={type.id} onClick={() => setSelectedType(type.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all text-sm ${
                  selectedType === type.id
                    ? 'border-[#0f52ba] bg-[#0f52ba]/5 text-[#0f52ba]'
                    : 'border-gray-100 text-gray-600 hover:border-gray-200 hover:bg-gray-50'
                }`}>
                <div className={`w-2 h-2 rounded-full shrink-0 ${selectedType === type.id ? 'bg-[#0f52ba]' : 'bg-gray-300'}`} />
                <div>
                  <p className="font-medium">{type.label}</p>
                  <p className={`text-xs ${selectedType === type.id ? 'text-[#0f52ba]/70' : 'text-gray-400'}`}>{type.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Date Range</label>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-400 mb-1 block">From</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0f52ba]/30 focus:border-[#0f52ba]" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-400 mb-1 block">To</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0f52ba]/30 focus:border-[#0f52ba]" />
            </div>
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Export Format</label>
          <div className="flex gap-2">
            {FORMATS.map(f => (
              <button key={f} onClick={() => setFormat(f)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                  format === f ? 'bg-[#0f52ba] text-white border-[#0f52ba] shadow-sm' : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                }`}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-red-500 mb-4">{error}</p>}

        <button onClick={handleGenerate} disabled={status !== 'idle'}
          className={`w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
            status === 'done' ? 'bg-green-500 text-white' : 'bg-[#0f52ba] hover:bg-blue-700 text-white disabled:opacity-60'
          }`}>
          {status === 'idle'    && <><Download size={16} /> Generate & Download</>}
          {status === 'loading' && <><Loader2 size={16} className="animate-spin" /> Generating Report...</>}
          {status === 'done'    && <><CheckCircle2 size={16} /> Report Downloaded!</>}
        </button>
      </div>
    </div>
  );
};

export default GenerateReportModal;
