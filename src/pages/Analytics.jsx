import React, { useEffect, useState } from 'react';
import { BarChart3, Users, ShieldCheck, Megaphone, Map, Building2, TrendingUp, Loader2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, getCountFromServer, query, where } from 'firebase/firestore';

function StatCard({ icon: Icon, label, value, color, bg, sub }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-6">
      <div className={`w-11 h-11 ${bg} rounded-2xl flex items-center justify-center mb-4`}>
        <Icon size={20} className={color} />
      </div>
      <p className="text-3xl font-bold text-gray-900">{value ?? '—'}</p>
      <p className="text-sm font-medium text-gray-700 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

async function count(collectionName, conditions = []) {
  let q = collection(db, collectionName);
  if (conditions.length) q = query(q, ...conditions);
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

export default function Analytics() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [
          totalUsers,
          activeUsers,
          pendingIDs,
          approvedIDs,
          announcements,
          sosEvents,
          healthCenters,
        ] = await Promise.all([
          count('users'),
          count('users', [where('status', '==', 'ACTIVE')]),
          count('id_verifications', [where('status', '==', 'pending')]),
          count('id_verifications', [where('status', '==', 'approved')]),
          count('announcements'),
          count('sos_events'),
          count('health_centers'),
        ]);
        setStats({ totalUsers, activeUsers, pendingIDs, approvedIDs, announcements, sosEvents, healthCenters });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 size={24} className="text-[#0f52ba]" /> Analytics & Reports
        </h1>
        <p className="text-sm text-gray-500 mt-1">Full system overview — all departments</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><Loader2 size={28} className="animate-spin text-blue-500" /></div>
      ) : (
        <>
          <div className="mb-6">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">User Management</h2>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard icon={Users}       label="Total Users"    value={stats?.totalUsers}  color="text-[#0f52ba]" bg="bg-blue-50"   sub="All registered residents" />
              <StatCard icon={TrendingUp}  label="Active Users"   value={stats?.activeUsers} color="text-green-600" bg="bg-green-50"  sub="Currently active accounts" />
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">ID Verification & Release</h2>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard icon={ShieldCheck} label="Pending IDs"    value={stats?.pendingIDs}  color="text-yellow-600" bg="bg-yellow-50" sub="Awaiting review" />
              <StatCard icon={ShieldCheck} label="Approved IDs"   value={stats?.approvedIDs} color="text-green-600"  bg="bg-green-50"  sub="Verified residents" />
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Sub Admin Activity</h2>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard icon={Megaphone}   label="Announcements"  value={stats?.announcements} color="text-purple-600" bg="bg-purple-50" sub="Total posted" />
              <StatCard icon={Map}         label="SOS Events"     value={stats?.sosEvents}     color="text-red-600"    bg="bg-red-50"    sub="Recorded incidents" />
              <StatCard icon={Building2}   label="Health Centers" value={stats?.healthCenters} color="text-teal-600"   bg="bg-teal-50"   sub="Listed facilities" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}