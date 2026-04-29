import React, { useState, useEffect } from 'react';
import {
  Bell, Settings, Plus, AlignLeft,
  Clock, ChevronDown,
  Save, Send, CheckCircle2, Edit3, AlertCircle, BarChart2,
  X, Loader2, MapPin, Calendar, FileText
} from 'lucide-react';
import { db } from "../lib/firebase";
import {
  collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp
} from "firebase/firestore";

const COLLECTION_ID = "editorial_health";

export default function Announcements() {
  const [publishTime, setPublishTime] = useState('Immediately');
  const [expiration, setExpiration]   = useState('Never');
  const [title, setTitle]             = useState('');
  const [what, setWhat]               = useState('');
  const [when, setWhen]               = useState('');
  const [where, setWhere]             = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving]           = useState(false);
  const [toast, setToast]             = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);

  useEffect(() => {
    const fetchRecent = async () => {
      try {
        const q = query(collection(db, COLLECTION_ID), orderBy('createdAt', 'desc'), limit(5));
        const snapshot = await getDocs(q);
        setRecentActivity(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error(err);
      }
    };
    fetchRecent();
  }, []);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const resetForm = () => {
    setTitle(''); setWhat(''); setWhen(''); setWhere(''); setDescription('');
    setPublishTime('Immediately'); setExpiration('Never');
  };

  const saveDocument = async (status) => {
    if (!title.trim())       { showToast('Please enter a title.', 'error'); return; }
    if (!what.trim())        { showToast('Please enter what the event is.', 'error'); return; }
    if (!when.trim())        { showToast('Please enter when the event is.', 'error'); return; }
    if (!where.trim())       { showToast('Please enter where the event is.', 'error'); return; }
    if (!description.trim()) { showToast('Please enter an event description.', 'error'); return; }

    setSaving(true);
    try {
      const docRef = await addDoc(collection(db, COLLECTION_ID), {
        Title:        title.trim(),
        What:         what.trim(),
        When:         when.trim(),
        Where:        where.trim(),
        Description:  description.trim(),
        Status:       status,
        Publish_Time: publishTime,
        Expiration:   expiration,
        Audience:     'Senior Citizens',
        createdAt:    serverTimestamp(),
      });

      const newDoc = {
        id:           docRef.id,
        Title:        title.trim(),
        What:         what.trim(),
        When:         when.trim(),
        Where:        where.trim(),
        Description:  description.trim(),
        Status:       status,
        Audience:     'Senior Citizens',
        createdAt:    new Date(),
      };
      setRecentActivity(prev => [newDoc, ...prev].slice(0, 5));
      resetForm();
      showToast(status === 'PUBLISHED' ? 'Announcement published!' : 'Draft saved!');
    } catch (err) {
      console.error('Save failed:', err);
      showToast('Failed to save. Check console.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const statusMeta = (doc) => {
    const createdAt = doc.createdAt?.toDate ? doc.createdAt.toDate() : new Date(doc.createdAt);
    const diff = Math.round((Date.now() - createdAt) / 60000);
    const timeAgo = diff < 60 ? `${diff}m ago` : diff < 1440 ? `${Math.round(diff/60)}h ago` : `${Math.round(diff/1440)}d ago`;
    return `${timeAgo} • Senior Citizens`;
  };

  const statusStyle = (status) => {
    if (status === 'PUBLISHED') return { icon: CheckCircle2, iconColor: 'text-blue-600',  iconBg: 'bg-blue-50',   badgeClass: 'bg-blue-50 text-blue-600' };
    if (status === 'DRAFT')     return { icon: Edit3,        iconColor: 'text-yellow-600', iconBg: 'bg-yellow-50', badgeClass: 'bg-yellow-50 text-yellow-700' };
    return                             { icon: AlertCircle,  iconColor: 'text-red-500',    iconBg: 'bg-red-50',    badgeClass: 'bg-red-50 text-red-500' };
  };

  return (
    <div className="flex-1 bg-[#f8f9fa] min-h-screen p-8 font-sans">

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl text-sm font-semibold shadow-lg ${toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-gray-900 text-white'}`}>
          {toast.msg}
        </div>
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between mb-8">
        <span className="text-[#0f52ba] font-semibold text-lg">SCIA Admin</span>
        <div className="flex items-center gap-4 text-gray-500">
          <button className="hover:text-gray-800 transition-colors"><Bell size={20} /></button>
          <button className="hover:text-gray-800 transition-colors"><Settings size={20} /></button>
          <img src="https://i.pravatar.cc/150?u=admin" alt="Admin" className="w-8 h-8 rounded-full border border-gray-200" />
        </div>
      </div>

      {/* Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Announcements</h1>
          <p className="text-gray-500">Broadcast event updates to senior citizens.</p>
        </div>
        <button onClick={resetForm} className="bg-[#0f52ba] hover:bg-blue-700 text-white px-5 py-2.5 rounded-full font-medium flex items-center gap-2 transition-colors shadow-sm">
          <Plus size={18} /> New Announcement
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Left: Form */}
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-6 text-gray-800 font-bold text-lg">
              <AlignLeft size={20} className="text-[#0f52ba]" /> Event Details
            </div>

            {/* Title */}
            <div className="mb-5">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Announcement Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Free Medical Check-up Day"
                className="w-full bg-gray-50 rounded-xl py-3 px-4 text-sm text-gray-800 border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none"
              />
            </div>

            {/* What */}
            <div className="mb-5">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FileText size={13} /> What
              </label>
              <input
                type="text"
                value={what}
                onChange={(e) => setWhat(e.target.value)}
                placeholder="e.g. Free blood pressure & blood sugar screening"
                className="w-full bg-gray-50 rounded-xl py-3 px-4 text-sm text-gray-800 border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none"
              />
            </div>

            {/* When */}
            <div className="mb-5">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Calendar size={13} /> When
              </label>
              <input
                type="text"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                placeholder="e.g. May 15, 2025 — 8:00 AM to 12:00 PM"
                className="w-full bg-gray-50 rounded-xl py-3 px-4 text-sm text-gray-800 border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none"
              />
            </div>

            {/* Where */}
            <div className="mb-5">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <MapPin size={13} /> Where
              </label>
              <input
                type="text"
                value={where}
                onChange={(e) => setWhere(e.target.value)}
                placeholder="e.g. Barangay Hall, San Antonio"
                className="w-full bg-gray-50 rounded-xl py-3 px-4 text-sm text-gray-800 border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none"
              />
            </div>

            {/* Event Description */}
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Event Description</label>
              <textarea
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Provide additional details about the event..."
                className="w-full bg-gray-50 rounded-xl py-3 px-4 text-sm text-gray-800 border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none resize-none"
              />
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-gray-900 text-lg">Recent Activity</h3>
              <button className="text-sm font-semibold text-[#0f52ba] hover:underline">View Archive</button>
            </div>
            <div className="space-y-4">
              {recentActivity.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">No announcements yet. Publish one above!</p>
              )}
              {recentActivity.map((doc) => {
                const { icon: Icon, iconColor, iconBg, badgeClass } = statusStyle(doc.Status);
                return (
                  <div key={doc.id} className="flex items-center justify-between p-4 rounded-2xl border border-gray-50 bg-gray-50/50 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`p-2.5 rounded-full ${iconBg} ${iconColor}`}><Icon size={18} /></div>
                      <div>
                        <h4 className="font-bold text-gray-900 text-sm mb-0.5">{doc.Title}</h4>
                        <p className="text-xs text-gray-500">{statusMeta(doc)}</p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider ${badgeClass}`}>{doc.Status}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Scheduling + Actions */}
        <div className="space-y-6">

          {/* Audience Badge */}
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-3">Audience</h3>
            <div className="flex items-center gap-3 p-3.5 rounded-xl bg-blue-50 border-2 border-[#0f52ba]">
              <div className="w-8 h-8 rounded-full bg-[#0f52ba] flex items-center justify-center text-white text-sm">👴</div>
              <span className="text-sm font-bold text-[#0f52ba]">Senior Citizens Only</span>
            </div>
            <p className="text-xs text-gray-400 mt-3">All announcements are visible only to registered senior citizens.</p>
          </div>

          {/* Scheduling */}
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-4">Scheduling</h3>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Publish Time</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-700" size={16} />
                  <select value={publishTime} onChange={(e) => setPublishTime(e.target.value)}
                    className="w-full bg-gray-100/80 border-none rounded-xl py-2.5 pl-10 pr-10 text-sm font-semibold text-gray-800 appearance-none focus:ring-2 focus:ring-blue-100 outline-none cursor-pointer">
                    <option>Immediately</option>
                    <option>Schedule for later</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Expiration</label>
                <div className="relative">
                  <AlertCircle className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-700" size={16} />
                  <select value={expiration} onChange={(e) => setExpiration(e.target.value)}
                    className="w-full bg-gray-100/80 border-none rounded-xl py-2.5 pl-10 pr-10 text-sm font-semibold text-gray-800 appearance-none focus:ring-2 focus:ring-blue-100 outline-none cursor-pointer">
                    <option>Never</option>
                    <option>1 Week</option>
                    <option>1 Month</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <button onClick={() => saveDocument('DRAFT')} disabled={saving}
                className="w-full bg-[#ffc107] hover:bg-yellow-500 disabled:opacity-50 text-yellow-900 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors">
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Save as Draft
              </button>
              <button onClick={() => saveDocument('PUBLISHED')} disabled={saving}
                className="w-full bg-[#0f52ba] hover:bg-blue-700 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-md shadow-blue-500/20">
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                Publish Announcement
              </button>
            </div>
          </div>

          {/* Stats card */}
          <div className="bg-[#0f52ba] rounded-3xl p-6 text-white shadow-lg shadow-blue-500/20 relative overflow-hidden">
            <div className="absolute right-6 top-6 bg-white/10 p-3 rounded-2xl">
              <BarChart2 size={32} className="text-white/80" />
            </div>
            <div className="mt-12">
              <h2 className="text-4xl font-bold mb-1">24.8k</h2>
              <p className="text-xs font-bold text-blue-200 uppercase tracking-wider mb-4">Reach Last Month</p>
              <div className="flex gap-1.5">
                <div className="h-1.5 w-1/3 bg-white rounded-full"></div>
                <div className="h-1.5 w-1/4 bg-white/30 rounded-full"></div>
                <div className="h-1.5 w-1/4 bg-white/30 rounded-full"></div>
                <div className="h-1.5 flex-1 bg-white/30 rounded-full"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}