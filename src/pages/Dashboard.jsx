import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { db } from "../lib/firebase";
import {
  collection, query, orderBy, limit,
  doc, updateDoc, deleteDoc, onSnapshot
} from "firebase/firestore";
import { X, Megaphone, ChevronRight, Pencil, Trash2, Save, Loader2 } from "lucide-react";


const COLLECTION_ID = "editorial_health";

const verificationQueue = [
  { name: "Marcus Thorne",   role: "Physician", id: "#4492" },
  { name: "Elena Rodriguez", role: "Nurse",     id: "#8201" },
  { name: "Samir Al-Fayed",  role: "EMT",       id: "#3115" },
];

// ── Announcement Banner ───────────────────────────────────────────────────────
function AnnouncementBanner({ announcements }) {
  const [current, setCurrent] = useState(0);
  const [dismissed, setDismiss] = useState(false);

  useEffect(() => {
    if (announcements.length <= 1) return;
    const timer = setInterval(() => setCurrent(prev => (prev + 1) % announcements.length), 6000);
    return () => clearInterval(timer);
  }, [announcements.length]);

  if (dismissed || announcements.length === 0) return null;
  const a = announcements[current];
  const createdAt = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
  const diff = Math.round((Date.now() - createdAt) / 60000);
  const timeAgo = diff < 60 ? `${diff}m ago` : diff < 1440 ? `${Math.round(diff/60)}h ago` : `${Math.round(diff/1440)}d ago`;

  return (
    <div className="relative bg-gradient-to-r from-[#0f52ba] to-blue-500 rounded-2xl px-5 py-4 shadow-md shadow-blue-500/20 flex items-start gap-4 overflow-hidden">
      <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/5 rounded-full pointer-events-none" />
      <div className="absolute -right-2 -bottom-6 w-20 h-20 bg-white/5 rounded-full pointer-events-none" />
      <div className="bg-white/20 rounded-xl p-2.5 flex-shrink-0 mt-0.5">
        <Megaphone size={18} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="bg-white/25 text-white text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full">{a.Audience}</span>
          <span className="text-blue-200 text-[10px] font-medium">{timeAgo}</span>
        </div>
        <p className="text-white font-bold text-sm leading-snug truncate">{a.Title}</p>
        <p className="text-blue-100 text-xs mt-0.5 line-clamp-1">{a.Body}</p>
      </div>
      {announcements.length > 1 && (
        <div className="flex flex-col gap-1 justify-center flex-shrink-0">
          {announcements.map((_, i) => (
            <button key={i} onClick={() => setCurrent(i)}
              className={`w-1.5 rounded-full transition-all ${i === current ? 'h-4 bg-white' : 'h-1.5 bg-white/40'}`} />
          ))}
        </div>
      )}
      <button onClick={() => setDismiss(true)} className="flex-shrink-0 text-white/60 hover:text-white transition-colors mt-0.5">
        <X size={16} />
      </button>
    </div>
  );
}

// ── Edit Modal ────────────────────────────────────────────────────────────────
function EditModal({ announcement, onClose, onSaved }) {
  const [title, setTitle]       = useState(announcement.Title);
  const [body, setBody]         = useState(announcement.Body);
  const [audience, setAudience] = useState(announcement.Audience);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const handleSave = async () => {
    if (!title.trim() || !body.trim()) { setError('Title and body are required.'); return; }
    setSaving(true);
    try {
      const docRef = doc(db, COLLECTION_ID, announcement.id);
      const updates = { Title: title.trim(), Body: body.trim(), Audience: audience };
      await updateDoc(docRef, updates);
      onSaved({ ...announcement, ...updates });
      onClose();
    } catch (err) {
      console.error(err);
      setError('Failed to update. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg p-6 z-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">Edit Announcement</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <X size={20} />
          </button>
        </div>

        {error && <p className="text-xs text-red-500 font-semibold mb-3">{error}</p>}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full bg-gray-50 rounded-xl py-3 px-4 text-sm text-gray-800 border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Body</label>
            <textarea rows={5} value={body} onChange={e => setBody(e.target.value)}
              className="w-full bg-gray-50 rounded-xl py-3 px-4 text-sm text-gray-800 border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none resize-none" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Audience</label>
            <select value={audience} onChange={e => setAudience(e.target.value)}
              className="w-full bg-gray-50 rounded-xl py-3 px-4 text-sm font-semibold text-gray-800 border border-gray-100 focus:ring-2 focus:ring-blue-100 outline-none">
              <option>All Users</option>
              <option>Patients</option>
              <option>Medical Staff</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-3 rounded-xl bg-[#0f52ba] hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────
function DeleteModal({ announcement, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, COLLECTION_ID, announcement.id));
      onDeleted(announcement.id);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 z-10 text-center">
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Trash2 size={24} className="text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Delete Announcement?</h2>
        <p className="text-sm text-gray-500 mb-6">
          "<span className="font-semibold text-gray-700">{announcement.Title}</span>" will be permanently removed.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors">
            {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [editTarget, setEditTarget]       = useState(null);
  const [deleteTarget, setDeleteTarget]   = useState(null);

  useEffect(() => {
    // 🔥 Real-time listener — no composite index needed (filter by Status client-side)
    const q = query(
      collection(db, COLLECTION_ID),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(d => !d.Status || d.Status === 'PUBLISHED')
        .slice(0, 5);
      setAnnouncements(docs);
      setLoading(false);
    }, (err) => {
      console.error('Failed to load announcements:', err);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleSaved = (updated) => {
    setAnnouncements(prev => prev.map(a => a.id === updated.id ? updated : a));
  };

  const handleDeleted = (id) => {
    setAnnouncements(prev => prev.filter(a => a.id !== id));
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans text-gray-900">

      {editTarget   && <EditModal   announcement={editTarget}   onClose={() => setEditTarget(null)}   onSaved={handleSaved} />}
      {deleteTarget && <DeleteModal announcement={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={handleDeleted} />}

      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between border-b border-gray-200 pb-4 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">System Overview</h1>
            <p className="text-sm text-gray-500 mt-1">Real-time health platform metrics and urgent actions.</p>
          </div>
          <div className="flex items-center gap-2 bg-green-100 text-green-700 px-3 py-1.5 rounded-full text-xs font-bold tracking-wide self-start sm:self-auto">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            SYSTEM LIVE
          </div>
        </div>

        {/* Banner */}
        {loading ? (
          <div className="h-20 bg-blue-50 rounded-2xl animate-pulse border border-blue-100" />
        ) : (
          <AnnouncementBanner announcements={announcements} />
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-red-500 rounded-xl p-5 shadow-sm text-white flex flex-col justify-between">
            <div className="flex justify-between items-center mb-4">
              <span className="text-red-200">✱</span>
              <span className="bg-red-700 text-white px-2 py-0.5 rounded text-xs font-bold">IMMEDIATE</span>
            </div>
            <div className="text-red-100 text-sm font-medium">Active SOS Alerts</div>
            <div className="text-4xl font-bold mt-1">04</div>
          </div>
          <div className="bg-yellow-100 rounded-xl p-5 shadow-sm flex flex-col justify-between border border-yellow-200">
            <div className="flex justify-between items-center mb-4">
              <span>🛡</span>
              <span className="bg-yellow-300 text-yellow-900 px-2 py-0.5 rounded text-xs font-bold">QUEUE</span>
            </div>
            <div className="text-yellow-800 text-sm font-medium">Pending Verifications</div>
            <div className="text-4xl font-bold text-gray-900 mt-1">128</div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 flex flex-col justify-between">
            <div className="flex justify-between items-center mb-4">
              <span>👥</span>
              <span className="text-green-600 text-xs font-bold bg-green-50 px-2 py-0.5 rounded">+12% Today</span>
            </div>
            <div className="text-gray-500 text-sm font-medium">Live Users</div>
            <div className="text-4xl font-bold text-gray-900 mt-1">2,841</div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 flex flex-col justify-between">
            <div className="flex justify-between items-center mb-4">
              <span>📊</span>
              <span className="text-green-600 text-xs font-bold bg-green-50 px-2 py-0.5 rounded">99.9% Up</span>
            </div>
            <div className="text-gray-500 text-sm font-medium">System Load</div>
            <div className="text-4xl font-bold text-gray-900 mt-1">14<span className="text-lg text-gray-500 ml-1">%</span></div>
          </div>
        </div>

        {/* Bottom */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Announcements Feed */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-bold text-gray-900">Recent Announcements</h2>
              <button onClick={() => navigate('/announcements')} className="text-blue-600 hover:text-blue-800 text-sm font-semibold transition-colors flex items-center gap-1">
                View All <ChevronRight size={14} />
              </button>
            </div>

            {loading && (
              <div className="space-y-4">
                {[1,2,3].map(i => <div key={i} className="bg-white p-4 rounded-xl border border-gray-200 h-24 animate-pulse" />)}
              </div>
            )}

            {!loading && announcements.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
                No published announcements yet.
              </div>
            )}

            {!loading && announcements.length > 0 && (
              <div className="space-y-4">
                {announcements.map((a) => {
                  const createdAt = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
                  const diff = Math.round((Date.now() - createdAt) / 60000);
                  const timeAgo = diff < 60 ? `${diff}M AGO` : diff < 1440 ? `${Math.round(diff/60)}H AGO` : diff < 2880 ? 'YESTERDAY' : `${Math.round(diff/1440)}D AGO`;
                  const imgSrc = `https://picsum.photos/seed/${a.id}/60/60`;

                  return (
                    <div key={a.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col sm:flex-row gap-4 hover:shadow-md transition-shadow group">
                      <img src={imgSrc} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0 bg-gray-100" />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 mb-1">
                          <h3 className="font-semibold text-gray-900 text-base leading-tight">{a.Title}</h3>
                          <span className="text-xs text-gray-400 font-bold tracking-wide whitespace-nowrap">{timeAgo}</span>
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-2">{a.Body}</p>
                        <div className="flex items-center justify-between mt-3">
                          <div className="flex gap-2">
                            <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{a.Audience}</span>
                            <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                              {a.Expiration === 'Never' ? 'No expiry' : `Expires: ${a.Expiration}`}
                            </span>
                          </div>
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setEditTarget(a)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-bold transition-colors">
                              <Pencil size={12} /> Edit
                            </button>
                            <button onClick={() => setDeleteTarget(a)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 text-xs font-bold transition-colors">
                              <Trash2 size={12} /> Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Urgent Operations */}
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Urgent Operations</h2>
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 space-y-4">
              <div className="bg-blue-50 h-32 rounded-lg flex items-center justify-center text-4xl border border-blue-100">🌍</div>
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-[10px] text-gray-400 font-bold tracking-wider uppercase mb-0.5">Active SOS Region</div>
                  <div className="text-sm font-bold text-gray-900">📍 New York, Sector 7</div>
                </div>
                <span className="bg-red-100 text-red-700 px-2.5 py-1 rounded-md text-xs font-bold">3 Red Flags</span>
              </div>
              <button onClick={() => navigate("/sos")} className="w-full py-2.5 border-2 border-red-500 text-red-600 font-bold text-sm rounded-lg hover:bg-red-50 transition-colors">
                Go to Live SOS Map
              </button>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 space-y-4">
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-gray-900">Verification Queue</span>
                <span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded text-xs font-bold">8+ NEW</span>
              </div>
              <div className="space-y-3">
                {verificationQueue.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 p-2 -mx-2 hover:bg-gray-50 rounded-lg transition-colors">
                    <div className="w-10 h-10 rounded-full bg-gray-100 overflow-hidden flex-shrink-0 border border-gray-200">
                      <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${u.name}`} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900 text-sm truncate">{u.name}</div>
                      <div className="text-xs text-gray-500 truncate">{u.role} • ID: {u.id}</div>
                    </div>
                    <button className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-1.5 rounded-md transition-colors">REVIEW</button>
                  </div>
                ))}
              </div>
              <button className="w-full text-center block text-blue-600 hover:text-blue-800 text-sm font-semibold pt-2 mt-2 border-t border-gray-100 transition-colors">
                View Full User Directory
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );  
}