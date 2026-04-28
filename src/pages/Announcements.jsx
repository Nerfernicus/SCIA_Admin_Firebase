import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
    Bell, Settings, Plus, AlignLeft, Bold, Italic,
    List, Link as LinkIcon, ImageIcon,
    Users, User, BriefcaseMedical, Clock, ChevronDown,
    Save, Send, CheckCircle2, Edit3, AlertCircle, BarChart2,
    ImagePlus, X, Loader2
} from 'lucide-react';
import { storage, databases } from "../lib/appwrite";
import { ID, Query } from "appwrite";

const BUCKET_ID     = "69ec280d0025f5ed0b40";
const DATABASE_ID   = "69ec2be300324536d19f";
const COLLECTION_ID = "editorial_health";

function ImageUploader({ images, setImages }) {
    const fileInputRef = useRef(null);
    const [dragging, setDragging] = useState(false);

    const uploadFile = useCallback(async (file) => {
        const id = Math.random().toString(36).slice(2);
        const preview = URL.createObjectURL(file);
        setImages(prev => [...prev, { id, file, preview, status: 'uploading', progress: 0, fileId: null }]);
        try {
            const result = await storage.createFile(BUCKET_ID, ID.unique(), file, undefined,
                (evt) => {
                    const pct = Math.round((evt.loaded / evt.total) * 100);
                    setImages(prev => prev.map(img => img.id === id ? { ...img, progress: pct } : img));
                }
            );
            setImages(prev => prev.map(img => img.id === id ? { ...img, status: 'done', fileId: result.$id, progress: 100 } : img));
        } catch (err) {
            console.error('Upload failed:', err);
            setImages(prev => prev.map(img => img.id === id ? { ...img, status: 'error' } : img));
        }
    }, [setImages]);

    const processFiles = useCallback((files) => {
        const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        Array.from(files).forEach(file => {
            if (!validTypes.includes(file.type) || file.size > 10 * 1024 * 1024) return;
            uploadFile(file);
        });
    }, [uploadFile]);

    const removeImage = (id) => {
        setImages(prev => {
            const img = prev.find(i => i.id === id);
            if (img?.preview) URL.revokeObjectURL(img.preview);
            return prev.filter(i => i.id !== id);
        });
    };

    return (
        <div className="mt-6">
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Attached Photos</label>
            <div
                onClick={() => fileInputRef.current.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); processFiles(e.dataTransfer.files); }}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${dragging ? 'border-[#0f52ba] bg-blue-50' : 'border-gray-200 bg-gray-50 hover:border-[#0f52ba] hover:bg-blue-50/30'}`}
            >
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple className="hidden"
                    onChange={(e) => processFiles(e.target.files)} />
                <div className="flex flex-col items-center gap-2">
                    <div className="bg-blue-100 p-3 rounded-full"><ImagePlus size={22} className="text-[#0f52ba]" /></div>
                    <p className="text-sm font-semibold text-gray-700">Click to browse or drag & drop photos</p>
                    <p className="text-xs text-gray-400">JPG, PNG, GIF, WEBP — up to 10MB each</p>
                </div>
            </div>

            {images.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-3">
                    {images.map(img => (
                        <div key={img.id} className="relative rounded-xl overflow-hidden aspect-square bg-gray-100 group">
                            <img src={img.preview} alt="preview" className="w-full h-full object-cover" />
                            {img.status === 'uploading' && (
                                <>
                                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200">
                                        <div className="h-full bg-[#0f52ba] transition-all duration-300" style={{ width: `${img.progress}%` }} />
                                    </div>
                                    <div className="absolute bottom-1 left-0 right-0 text-center">
                                        <span className="text-[9px] font-bold text-white bg-black/50 px-2 py-0.5 rounded-full">{img.progress}%</span>
                                    </div>
                                </>
                            )}
                            {img.status === 'done' && <div className="absolute bottom-1 left-0 right-0 text-center"><span className="text-[9px] font-bold text-white bg-emerald-500/80 px-2 py-0.5 rounded-full">✓ Saved</span></div>}
                            {img.status === 'error' && <div className="absolute bottom-1 left-0 right-0 text-center"><span className="text-[9px] font-bold text-white bg-red-500/80 px-2 py-0.5 rounded-full">✗ Failed</span></div>}
                            <button onClick={(e) => { e.stopPropagation(); removeImage(img.id); }}
                                className="absolute top-1.5 right-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <X size={12} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
            {images.length > 0 && (
                <p className="text-xs text-gray-400 mt-2">{images.filter(i => i.status === 'done').length}/{images.length} photo{images.length !== 1 ? 's' : ''} uploaded</p>
            )}
        </div>
    );
}

export default function Announcements() {
    const [selectedAudience, setSelectedAudience] = useState('All Users');
    const [publishTime, setPublishTime]           = useState('Immediately');
    const [expiration, setExpiration]             = useState('Never');
    const [images, setImages]                     = useState([]);
    const [title, setTitle]                       = useState('');
    const [body, setBody]                         = useState('');
    const [saving, setSaving]                     = useState(false);
    const [toast, setToast]                       = useState(null);
    const [recentActivity, setRecentActivity]     = useState([]);

    const pendingUploads = images.filter(i => i.status === 'uploading').length;

    useEffect(() => {
        databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
            Query.orderDesc('$createdAt'), Query.limit(5),
        ]).then(res => setRecentActivity(res.documents)).catch(console.error);
    }, []);

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    const resetForm = () => {
        setTitle(''); setBody(''); setImages([]);
        setSelectedAudience('All Users'); setPublishTime('Immediately'); setExpiration('Never');
    };

    const saveDocument = async (status) => {
        if (!title.trim()) { showToast('Please enter a title.', 'error'); return; }
        if (!body.trim())  { showToast('Please enter a body message.', 'error'); return; }
        if (pendingUploads > 0) { showToast(`Wait — ${pendingUploads} photo(s) still uploading.`, 'error'); return; }

        setSaving(true);
        try {
            const ImageIds = images.filter(i => i.status === 'done').map(i => i.fileId).join(',');
            const doc = await databases.createDocument(DATABASE_ID, COLLECTION_ID, ID.unique(), {
                Title:        title.trim(),
                Body:         body.trim(),
                Audience:     selectedAudience,
                Status:       status,
                Publish_Time: publishTime,
                Expiration:   expiration,
                ImageIds,
            });
            setRecentActivity(prev => [doc, ...prev].slice(0, 5));
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
        const diff = Math.round((Date.now() - new Date(doc.$createdAt)) / 60000);
        const timeAgo = diff < 60 ? `${diff}m ago` : diff < 1440 ? `${Math.round(diff/60)}h ago` : `${Math.round(diff/1440)}d ago`;
        return `${timeAgo} • Audience: ${doc.Audience}`;
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

            <div className="flex items-center justify-between mb-8">
                <span className="text-[#0f52ba] font-semibold text-lg">Editorial Health Admin</span>
                <div className="flex items-center gap-4 text-gray-500">
                    <button className="hover:text-gray-800 transition-colors"><Bell size={20} /></button>
                    <button className="hover:text-gray-800 transition-colors"><Settings size={20} /></button>
                    <img src="https://i.pravatar.cc/150?u=admin" alt="Admin" className="w-8 h-8 rounded-full border border-gray-200" />
                </div>
            </div>

            <div className="flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">Announcements</h1>
                    <p className="text-gray-500">Broadcast updates and alerts across the platform ecosystem.</p>
                </div>
                <button onClick={resetForm} className="bg-[#0f52ba] hover:bg-blue-700 text-white px-5 py-2.5 rounded-full font-medium flex items-center gap-2 transition-colors shadow-sm">
                    <Plus size={18} /> New Broadcast
                </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 space-y-6">

                    <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-2 mb-6 text-gray-800 font-bold text-lg">
                            <AlignLeft size={20} className="text-[#0f52ba]" /> Content Editor
                        </div>

                        <div className="mb-6">
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Announcement Title</label>
                            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                                placeholder="Enter headline..."
                                className="w-full bg-gray-50 border-none rounded-xl py-3 px-4 text-sm text-gray-800 focus:ring-2 focus:ring-blue-100 outline-none" />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Body Message</label>
                            <div className="border border-gray-100 rounded-xl overflow-hidden bg-gray-50">
                                <div className="flex items-center gap-4 p-3 border-b border-gray-200 bg-gray-100/50">
                                    <button className="text-gray-600 hover:text-gray-900"><Bold size={16} /></button>
                                    <button className="text-gray-600 hover:text-gray-900"><Italic size={16} /></button>
                                    <button className="text-gray-600 hover:text-gray-900"><List size={16} /></button>
                                    <button className="text-gray-600 hover:text-gray-900"><LinkIcon size={16} /></button>
                                    <button className="text-gray-600 hover:text-gray-900"><ImageIcon size={16} /></button>
                                </div>
                                <textarea rows="8" value={body} onChange={(e) => setBody(e.target.value)}
                                    placeholder="Type your announcement details here..."
                                    className="w-full bg-transparent border-none p-4 text-sm text-gray-800 focus:ring-0 outline-none resize-none" />
                            </div>
                        </div>

                        <ImageUploader images={images} setImages={setImages} />
                    </div>

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
                                    <div key={doc.$id} className="flex items-center justify-between p-4 rounded-2xl border border-gray-50 bg-gray-50/50 hover:bg-gray-50 transition-colors">
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

                <div className="space-y-6">
                    <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                        <h3 className="font-bold text-gray-900 mb-4">Target Audience</h3>
                        <div className="space-y-3">
                            {[
                                { label: 'All Users',     icon: <Users size={18} /> },
                                { label: 'Patients',      icon: <User size={18} /> },
                                { label: 'Medical Staff', icon: <BriefcaseMedical size={18} /> },
                            ].map(({ label, icon }) => (
                                <button key={label} onClick={() => setSelectedAudience(label)}
                                    className={`w-full flex items-center justify-between p-3.5 rounded-xl border-2 transition-all ${selectedAudience === label ? 'border-[#0f52ba] bg-blue-50/30' : 'border-transparent bg-gray-50 hover:bg-gray-100'}`}>
                                    <div className={`flex items-center gap-3 text-sm font-semibold ${selectedAudience === label ? 'text-[#0f52ba]' : 'text-gray-700'}`}>
                                        {icon} {label}
                                    </div>
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selectedAudience === label ? 'border-[#0f52ba]' : 'border-gray-300'}`}>
                                        {selectedAudience === label && <div className="w-2 h-2 rounded-full bg-[#0f52ba]" />}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

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
                            <button onClick={() => saveDocument('PUBLISHED')} disabled={saving || pendingUploads > 0}
                                className="w-full bg-[#0f52ba] hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-md shadow-blue-500/20">
                                {saving ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                                {pendingUploads > 0 ? `Uploading ${pendingUploads} photo…` : 'Publish Announcement'}
                            </button>
                        </div>
                    </div>

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