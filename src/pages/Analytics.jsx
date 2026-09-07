import { useEffect, useState } from 'react';
import { BarChart3, Users, TrendingUp, ShieldCheck, Megaphone, Map, Building2, Loader2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

function StatCard({ icon: Icon, label, value, sub, color, bg }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-6">
      <div className={`w-11 h-11 ${bg} rounded-2xl flex items-center justify-center mb-4`}>
        <Icon size={20} className={color} />
      </div>
      <p className="text-3xl font-bold text-gray-900">{value ?? 'N/A'}</p>
      <p className="text-sm font-medium text-gray-700 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function countDocs(collectionName, ...conditions) {
  const ref = collection(db, collectionName);
  const q = conditions.length ? query(ref, ...conditions) : ref;
  return getCountFromServer(q).then((snap) => snap.data().count);
}

export default function Analytics() {
  const { isSuperAdmin } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const [totalUsers, activeUsers, pendingIDs, approvedIDs, announcements, sosEvents, healthCenters] =
          await Promise.all([
            countDocs('users'),
            countDocs('users', where('status', '==', 'ACTIVE')),
            countDocs('id_verifications', where('status', '==', 'pending')),
            countDocs('id_verifications', where('status', '==', 'approved')),
            countDocs('announcements'),
            countDocs('sos_events'),
            countDocs('health_centers'),
          ]);
        setStats({ totalUsers, activeUsers, pendingIDs, approvedIDs, announcements, sosEvents, healthCenters });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  const sections = [
    {
      title: 'User Management',
      cards: [
        { icon: Users, label: 'Total Users', key: 'totalUsers', sub: 'All registered residents', color: 'text-[#0f52ba]', bg: 'bg-blue-50' },
        { icon: TrendingUp, label: 'Active Users', key: 'activeUsers', sub: 'Currently active accounts', color: 'text-green-600', bg: 'bg-green-50' },
      ],
    },
    {
      title: 'ID Verification & Release',
      cards: [
        { icon: ShieldCheck, label: 'Pending IDs', key: 'pendingIDs', sub: 'Awaiting review', color: 'text-yellow-600', bg: 'bg-yellow-50' },
        { icon: ShieldCheck, label: 'Approved IDs', key: 'approvedIDs', sub: 'Verified residents', color: 'text-green-600', bg: 'bg-green-50' },
      ],
    },
    {
      title: 'Barangay Admin Activity',
      cards: [
        { icon: Megaphone, label: 'Announcements', key: 'announcements', sub: 'Total posted', color: 'text-purple-600', bg: 'bg-purple-50' },
        ...(!isSuperAdmin
          ? [{ icon: Map, label: 'SOS Events', key: 'sosEvents', sub: 'Recorded incidents', color: 'text-red-600', bg: 'bg-red-50' }]
          : []),
        { icon: Building2, label: 'Health Centers', key: 'healthCenters', sub: 'Listed facilities', color: 'text-teal-600', bg: 'bg-teal-50' },
      ],
    },
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 size={24} className="text-[#0f52ba]" /> Analytics & Reports
        </h1>
        <p className="text-sm text-gray-500 mt-1">Full system overview across all departments</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="animate-spin text-blue-500" />
        </div>
      ) : (
        sections.map((section) => (
          <div key={section.title} className="mb-6">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">{section.title}</h2>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {section.cards.map((card) => (
                <StatCard key={card.key} {...card} value={stats?.[card.key]} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
