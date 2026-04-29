import React, { useEffect, useState } from 'react';
import {
    Search, Bell, Settings, UserPlus, Users,
    ShieldAlert, Ban, SlidersHorizontal, ChevronDown,
    AlignLeft, RotateCcw, CheckCircle2, ChevronLeft,
    ChevronRight, ArrowRight
} from 'lucide-react';
import { db } from '../lib/firebase';
import {
    collection, onSnapshot, orderBy, query, doc, updateDoc, deleteDoc
} from 'firebase/firestore';

// ── Status badge helpers ───────────────────────────────────────────────────
const statusDot = (status) => {
    if (status === 'ACTIVE')    return 'bg-green-500';
    if (status === 'PENDING')   return 'bg-yellow-400';
    if (status === 'SUSPENDED') return 'bg-red-500';
    return 'bg-gray-400';
};
const statusText = (status) => {
    if (status === 'ACTIVE')    return 'text-green-600';
    if (status === 'PENDING')   return 'text-yellow-600';
    if (status === 'SUSPENDED') return 'text-red-600';
    return 'text-gray-600';
};

export default function UserManagement() {
    const [users, setUsers]         = useState([]);
    const [search, setSearch]       = useState('');
    const [loading, setLoading]     = useState(true);

    // ── Real-time listener for the "users" collection ────────────────────
    // Users are written here when seniors sign up via the mobile app.
    useEffect(() => {
        const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
        const unsub = onSnapshot(q, (snapshot) => {
            setUsers(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });
        return () => unsub();
    }, []);

    // ── Actions ────────────────────────────────────────────────────────────
    const setStatus = async (userId, newStatus) => {
        await updateDoc(doc(db, 'users', userId), { status: newStatus });
    };
    const deleteUser = async (userId) => {
        if (!window.confirm('Delete this user permanently?')) return;
        await deleteDoc(doc(db, 'users', userId));
    };

    // ── Filter ─────────────────────────────────────────────────────────────
    const filtered = users.filter((u) => {
        const fullName = `${u.firstName ?? ''} ${u.lastName ?? ''}`.toLowerCase();
        const s = search.toLowerCase();
        return fullName.includes(s) || (u.idNumber ?? '').includes(s) || (u.address ?? '').toLowerCase().includes(s);
    });

    // ── KPI counts ─────────────────────────────────────────────────────────
    const totalUsers     = users.length;
    const pendingCount   = users.filter((u) => u.status === 'PENDING').length;
    const suspendedCount = users.filter((u) => u.status === 'SUSPENDED').length;

    return (
        <div className="flex-1 bg-[#f8f9fa] min-h-screen p-8 font-sans">

            {/* Top Navigation Bar */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-6">
                    <span className="text-[#0f52ba] font-semibold text-lg">SCIA Admin</span>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text" placeholder="Search users..."
                            value={search} onChange={(e) => setSearch(e.target.value)}
                            className="bg-gray-100/50 border-none rounded-full py-2 pl-10 pr-4 w-72 focus:ring-2 focus:ring-blue-100 outline-none text-sm"
                        />
                    </div>
                </div>
                <div className="flex items-center gap-4 text-gray-500">
                    <button className="hover:text-gray-800"><Bell size={20} /></button>
                    <button className="hover:text-gray-800"><Settings size={20} /></button>
                    <img src="https://i.pravatar.cc/150?u=admin" alt="Admin" className="w-8 h-8 rounded-full border border-gray-200" />
                </div>
            </div>

            {/* Header */}
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">User Management</h1>
                    <p className="text-gray-500">Manage senior citizen accounts registered via the mobile app.</p>
                </div>
            </div>

            {/* KPI Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="bg-blue-50 p-4 rounded-xl text-[#0f52ba]"><Users size={24} /></div>
                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Total Users</p>
                        <h2 className="text-3xl font-bold text-gray-900">{totalUsers}</h2>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="bg-yellow-50 p-4 rounded-xl text-yellow-600"><ShieldAlert size={24} /></div>
                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Pending Verification</p>
                        <h2 className="text-3xl font-bold text-gray-900">{pendingCount}</h2>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="bg-red-50 p-4 rounded-xl text-red-600"><Ban size={24} /></div>
                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Suspended</p>
                        <h2 className="text-3xl font-bold text-gray-900">{suspendedCount}</h2>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-8 overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-white">
                    <p className="text-sm text-gray-500 font-medium">
                        {loading ? 'Loading...' : `${filtered.length} users`}
                    </p>
                    <div className="flex items-center gap-4">
                        <button className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-gray-200 transition-colors">
                            <SlidersHorizontal size={16} /> Filters
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-white border-b border-gray-100">
                                <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider">User</th>
                                <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider">ID Number</th>
                                <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider">Contact</th>
                                <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                                <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider">Registered</th>
                                <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr><td colSpan={6} className="py-10 text-center text-gray-400 text-sm">Loading users...</td></tr>
                            )}
                            {!loading && filtered.length === 0 && (
                                <tr><td colSpan={6} className="py-10 text-center text-gray-400 text-sm">No users yet. Senior citizens who sign up via the app will appear here.</td></tr>
                            )}
                            {filtered.map((user) => {
                                const createdAt = user.createdAt?.toDate ? user.createdAt.toDate() : new Date(user.createdAt ?? Date.now());
                                const timeAgo = Math.round((Date.now() - createdAt) / 60000);
                                const joined = timeAgo < 60 ? `${timeAgo}m ago` : timeAgo < 1440 ? `${Math.round(timeAgo/60)}h ago` : `${Math.round(timeAgo/1440)}d ago`;

                                return (
                                    <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                                        <td className="py-4 px-6">
                                            <div>
                                                <p className="font-bold text-gray-900 text-sm">{user.firstName} {user.midName ? user.midName[0] + '.' : ''} {user.lastName}</p>
                                                <p className="text-gray-500 text-xs">{user.address}</p>
                                            </div>
                                        </td>
                                        <td className="py-4 px-6 text-sm text-gray-700 font-mono">{user.idNumber}</td>
                                        <td className="py-4 px-6 text-sm text-gray-600">{user.conNumber}</td>
                                        <td className="py-4 px-6">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${statusDot(user.status)}`}></span>
                                                <span className={`text-xs font-bold ${statusText(user.status)}`}>{user.status ?? 'PENDING'}</span>
                                            </div>
                                        </td>
                                        <td className="py-4 px-6 text-sm text-gray-500">{joined}</td>
                                        <td className="py-4 px-6">
                                            <div className="flex items-center justify-end gap-3 text-gray-400">
                                                {/* Approve (PENDING → ACTIVE) */}
                                                {(user.status === 'PENDING' || !user.status) && (
                                                    <button
                                                        title="Approve"
                                                        onClick={() => setStatus(user.id, 'ACTIVE')}
                                                        className="hover:text-green-600 transition-colors text-green-500"
                                                    ><CheckCircle2 size={18} /></button>
                                                )}
                                                {/* Suspend */}
                                                {user.status !== 'SUSPENDED' && (
                                                    <button
                                                        title="Suspend"
                                                        onClick={() => setStatus(user.id, 'SUSPENDED')}
                                                        className="hover:text-red-600 transition-colors"
                                                    ><Ban size={18} /></button>
                                                )}
                                                {/* Reactivate */}
                                                {user.status === 'SUSPENDED' && (
                                                    <button
                                                        title="Reactivate"
                                                        onClick={() => setStatus(user.id, 'ACTIVE')}
                                                        className="hover:text-blue-600 transition-colors"
                                                    ><RotateCcw size={18} /></button>
                                                )}
                                                {/* Delete */}
                                                <button
                                                    title="Delete"
                                                    onClick={() => deleteUser(user.id)}
                                                    className="hover:text-gray-700 transition-colors"
                                                ><AlignLeft size={18} /></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Bottom Widgets */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-[#f4f6fc] rounded-2xl p-6 border border-blue-50">
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Batch Operations</h3>
                    <p className="text-sm text-gray-500 mb-6">Perform actions on multiple selected accounts at once.</p>
                    <div className="flex flex-wrap gap-3">
                        <button className="bg-white border border-[#0f52ba] text-[#0f52ba] px-4 py-2 rounded-full text-sm font-semibold hover:bg-blue-50 transition-colors shadow-sm">
                            Download CSV
                        </button>
                        <button className="bg-white border border-red-500 text-red-600 px-4 py-2 rounded-full text-sm font-semibold hover:bg-red-50 transition-colors shadow-sm">
                            Mass Deactivate
                        </button>
                    </div>
                </div>
                <div className="bg-[#fff9ed] rounded-2xl p-6 border border-yellow-100">
                    <h3 className="text-lg font-bold text-gray3-900 mb-2">Pending Review</h3>
                    <p className="text-sm text-gray-600 font-medium mb-3">
                        {pendingCount} user{pendingCount !== 1 ? 's' : ''} waiting for ID verification.
                    </p>
                    <button className="text-yellow-700 font-semibold text-sm flex items-center gap-1 hover:text-yellow-800 transition-colors">
                        Review Pending <ArrowRight size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
