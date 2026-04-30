import React, { useState } from 'react';
import { X, FileText, Download, Loader2, CheckCircle2 } from 'lucide-react';

const REPORT_TYPES = [
  { id: 'sos', label: 'SOS Incidents', description: 'All emergency SOS events and responses' },
  { id: 'users', label: 'User Activity', description: 'Registered users and activity logs' },
  { id: 'verification', label: 'ID Verifications', description: 'Verification requests and statuses' },
  { id: 'health', label: 'Health Centers', description: 'Health center usage and visits' },
  { id: 'announcements', label: 'Announcements', description: 'Published announcements and reach' },
];

const FORMATS = ['PDF', 'CSV', 'Excel'];

const GenerateReportModal = ({ isOpen, onClose }) => {
  const [selectedType, setSelectedType] = useState('sos');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [format, setFormat] = useState('PDF');
  const [status, setStatus] = useState('idle'); // idle | loading | done

  if (!isOpen) return null;

  const handleGenerate = () => {
    if (!dateFrom || !dateTo) {
      alert('Please select a date range.');
      return;
    }

    setStatus('loading');

    // Simulate report generation (replace with real API call)
    setTimeout(() => {
      setStatus('done');

      // Simulate a file download by creating a blob
      const reportContent = `Health Platform Report\nType: ${selectedType}\nFrom: ${dateFrom}\nTo: ${dateTo}\nFormat: ${format}\n\nGenerated on: ${new Date().toLocaleString()}`;
      const blob = new Blob([reportContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report_${selectedType}_${dateFrom}_${dateTo}.${format.toLowerCase()}`;
      a.click();
      URL.revokeObjectURL(url);

      // Reset after 2 seconds
      setTimeout(() => {
        setStatus('idle');
        onClose();
      }, 2000);
    }, 2000);
  };

  const handleClose = () => {
    if (status === 'loading') return; // Prevent closing while generating
    setStatus('idle');
    onClose();
  };

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={handleClose}
    >
      {/* Modal Panel */}
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 relative animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-[#0f52ba]/10 p-2 rounded-xl">
              <FileText size={20} className="text-[#0f52ba]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Generate Report</h2>
              <p className="text-xs text-gray-500">Export platform data as a report</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={status === 'loading'}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40"
          >
            <X size={20} />
          </button>
        </div>

        {/* Report Type */}
        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Report Type</label>
          <div className="space-y-2">
            {REPORT_TYPES.map((type) => (
              <button
                key={type.id}
                onClick={() => setSelectedType(type.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all text-sm ${
                  selectedType === type.id
                    ? 'border-[#0f52ba] bg-[#0f52ba]/5 text-[#0f52ba]'
                    : 'border-gray-100 text-gray-600 hover:border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${selectedType === type.id ? 'bg-[#0f52ba]' : 'bg-gray-300'}`} />
                <div>
                  <p className="font-medium">{type.label}</p>
                  <p className={`text-xs ${selectedType === type.id ? 'text-[#0f52ba]/70' : 'text-gray-400'}`}>{type.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Date Range */}
        <div className="mb-5">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Date Range</label>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-400 mb-1 block">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0f52ba]/30 focus:border-[#0f52ba]"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-400 mb-1 block">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0f52ba]/30 focus:border-[#0f52ba]"
              />
            </div>
          </div>
        </div>

        {/* Format */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-700 mb-2">Export Format</label>
          <div className="flex gap-2">
            {FORMATS.map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                  format === f
                    ? 'bg-[#0f52ba] text-white border-[#0f52ba] shadow-sm'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={handleGenerate}
          disabled={status !== 'idle'}
          className={`w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
            status === 'done'
              ? 'bg-green-500 text-white'
              : 'bg-[#0f52ba] hover:bg-blue-700 text-white disabled:opacity-60'
          }`}
        >
          {status === 'idle' && (
            <>
              <Download size={16} />
              Generate & Download
            </>
          )}
          {status === 'loading' && (
            <>
              <Loader2 size={16} className="animate-spin" />
              Generating Report...
            </>
          )}
          {status === 'done' && (
            <>
              <CheckCircle2 size={16} />
              Report Downloaded!
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default GenerateReportModal;