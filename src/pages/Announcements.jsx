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
  const [what, setWhat]               = useState('');
  const [when, setWhen]               = useState('');
  const [where, setWhere]             = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving]           = useState(false);
  const [toast, setToast]             = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [audience, setAudience] = useState("ALL");
  const [barangay, setBarangay] = useState("");

  const fetchRecentEvents = async () => {
    try {
      const res = await fetch("http://YOUR_IP:3000/api/events");
      const data = await res.json();

      setRecentActivity(data.slice(0, 5)); // latest 5
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchRecentEvents();
  }, []);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Clear form fields
  const resetForm = () => {
    setTitle(''); setWhat(''); setWhen(''); setWhere(''); setDescription('');
    setPublishTime('Immediately'); setExpiration('Never');
  };

  // Compute expiration date based on selected option
  const computeExpirationDate = (option) => {
    const now = new Date();

    switch (option) {
      case "1 Week":
        return new Date(now.setDate(now.getDate() + 7));
      case "2 Weeks":
        return new Date(now.setDate(now.getDate() + 14));
      case "3 Weeks":
        return new Date(now.setDate(now.getDate() + 21));
      case "1 Month":
        return new Date(now.setMonth(now.getMonth() + 1));
      case "2 Months":
        return new Date(now.setMonth(now.getMonth() + 2));
      case "3 Months":
        return new Date(now.setMonth(now.getMonth() + 3));
      default:
        return null; // Never
    }
  };

  // Save document to Firestore
  const saveDocument = async () => {
    if (!what || !when || !where || !description) {
      showToast("Please fill all fields", "error");
      return;
    }

    if (audience === "BARANGAY" && !barangay) {
      showToast("Please select a barangay", "error");
      return;
    }

    setSaving(true);

    try {
      const res = await fetch("http://10.142.254.160:3000/api/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: what,
          description,
          location: where,
          date: when,
          expiration,
          audience,
          barangay,
        })
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      showToast("Announcement published!");
      resetForm();

    } catch (err) {
      console.error(err);
      showToast("Failed to publish", "error");
    } finally {
      setSaving(false);
    }
  };

  // Generate status metadata for recent activity items
  const statusMeta = (doc) => {
    const createdAt = doc.createdAt?.toDate ? doc.createdAt.toDate() : new Date(doc.createdAt);
    const diff = Math.round((Date.now() - createdAt) / 60000);
    const timeAgo = diff < 60 ? `${diff}m ago` : diff < 1440 ? `${Math.round(diff/60)}h ago` : `${Math.round(diff/1440)}d ago`;
    return `${timeAgo} • Senior Citizens`;
  };

  // Get icon and styles based on status
  const statusStyle = (status) => {
    if (status === 'PUBLISHED') return { icon: CheckCircle2, iconColor: 'text-blue-600',  iconBg: 'bg-blue-50',   badgeClass: 'bg-blue-50 text-blue-600' };
    if (status === 'DRAFT')     return { icon: Edit3,        iconColor: 'text-yellow-600', iconBg: 'bg-yellow-50', badgeClass: 'bg-yellow-50 text-yellow-700' };
    return                             { icon: AlertCircle,  iconColor: 'text-red-500',    iconBg: 'bg-red-50',    badgeClass: 'bg-red-50 text-red-500' };
  };

  // Handle "New Announcement" button click
  const handleNewAnnouncement = () => {
    const hasData = title || what || when || where || description;

    if (hasData) {
      const confirmReset = window.confirm(
        "This will clear the current announcement. Continue?"
      );

      if (!confirmReset) return;
    }

    resetForm();
  };

  const district1Barangays = [
    "Arkong Bato","Balangkas","Bignay","Bisig","Canumay East","Canumay West",
    "Coloong","Dalandanan","Isla","Lawang Bato","Lingunan","Mabolo",
    "Malanday","Malinta","Palasan","Pariancillo Villa","Pasolo","Poblacion",
    "Pulo","Punturin","Rincon","Tagalag","Veinte Reales","Wawang Pulo"
  ];

  const district2Barangays = [
    "Bagbaguin","General T. de Leon","Karuhatan","Mapulang Lupa",
    "Marulas","Maysan","Parada","Paso de Blas","Ugong"
  ];

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
        <button onClick={handleNewAnnouncement} className="bg-[#0f52ba] hover:bg-blue-700 text-white px-5 py-2.5 rounded-full font-medium flex items-center gap-2 transition-colors shadow-sm">
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

              <select
                value={audience}
                onChange={(e) => {
                  setAudience(e.target.value);
                  setBarangay(""); // reset when changing audience
                }}
                className="w-full bg-gray-100 rounded-xl py-2 px-3"
              >
                <option value="ALL">All</option>
                <option value="DISTRICT_1">Valenzuela District 1</option>
                <option value="DISTRICT_2">Valenzuela District 2</option>
                <option value="BARANGAY">Specific Barangay</option>
              </select>

              {audience === "BARANGAY" && (
                <select
                  value={barangay}
                  onChange={(e) => setBarangay(e.target.value)}
                  className="w-full bg-gray-100 rounded-xl py-2 px-3 mt-2"
                >
                  <option value="">Select Barangay</option>

                  <optgroup label="District 1">
                    {district1Barangays.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </optgroup>

                  <optgroup label="District 2">
                    {district2Barangays.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </optgroup>
                </select>
              )}
              
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Expiration</label>
                <div className="relative">
                  <AlertCircle className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-700" size={16} />
                  <select value={expiration} onChange={(e) => setExpiration(e.target.value)}
                    className="w-full bg-gray-100/80 border-none rounded-xl py-2.5 pl-10 pr-10 text-sm font-semibold text-gray-800 appearance-none focus:ring-2 focus:ring-blue-100 outline-none cursor-pointer">
                    <option>Never</option>
                    <option>1 Week</option>
                    <option>2 Weeks</option>
                    <option>3 Weeks</option>
                    <option>1 Month</option>
                    <option>2 Months</option>
                    <option>3 Months</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                </div>
              </div>

            </div>

            <div className="space-y-3">
              <button onClick={saveDocument} disabled={saving}
                className="w-full bg-[#0f52ba] hover:bg-blue-700 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-md shadow-blue-500/20">
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                Publish Announcement
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}