import { useEffect, useState } from 'react';
import { BarChart3, Users, TrendingUp, ShieldCheck, Megaphone, Map, Building2, Loader2 } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, getCountFromServer, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

function StatCard({ icon: Icon, label, value, sub, color, bg, percent }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-6">
      <div className={`w-11 h-11 ${bg} rounded-2xl flex items-center justify-center mb-4`}>
        <Icon size={20} className={color} />
      </div>
      <p className="text-3xl font-bold text-gray-900">{value ?? 'N/A'}</p>
      <p className="text-sm font-medium text-gray-700 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      {percent != null && (
        <div className="mt-3">
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${bg.replace('bg-', 'bg-').replace('-50', '-400')}`} style={{ width: `${percent}%` }} />
          </div>
          <p className="text-[11px] text-gray-400 mt-1">{percent}% of total</p>
        </div>
      )}
    </div>
  );
}

// Donut chart built with plain SVG stroke-dasharray segments — no chart
// library dependency needed.
function DonutChart({ title, segments, size = 132, thickness = 16 }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offsetAcc = 0;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>
      {total === 0 ? (
        <p className="text-sm text-gray-400">No data yet</p>
      ) : (
        <div className="flex items-center gap-5">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
            <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
              <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={thickness} />
              {segments.map((s, i) => {
                const dash = (s.value / total) * circumference;
                const circle = (
                  <circle
                    key={i}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={thickness}
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={-offsetAcc}
                  />
                );
                offsetAcc += dash;
                return circle;
              })}
            </g>
          </svg>
          <div className="space-y-2">
            {segments.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                <span className="text-gray-600">{s.label}</span>
                <span className="font-semibold text-gray-900">
                  {Math.round((s.value / total) * 100)}%
                </span>
                <span className="text-gray-400">({s.value})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Horizontal bar comparison across categories.
function CategoryBarChart({ title, bars }) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>
      <div className="space-y-4">
        {bars.map((b, i) => (
          <div key={i}>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-gray-600 font-medium">{b.label}</span>
              <span className="text-gray-900 font-semibold">{b.value}</span>
            </div>
            <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${(b.value / max) * 100}%`, background: b.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Simple vertical bar trend chart, e.g. counts per month.
function TrendChart({ title, points, color = '#0f52ba' }) {
  const max = Math.max(...points.map((p) => p.value), 1);
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>
      <div className="flex items-end gap-2 h-32">
        {points.map((p, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
            <span className="text-[10px] text-gray-400">{p.value}</span>
            <div className="w-full flex items-end h-24 bg-gray-50 rounded-md overflow-hidden">
              <div
                className="w-full rounded-t-md"
                style={{ height: `${Math.max((p.value / max) * 100, p.value > 0 ? 6 : 0)}%`, background: color }}
              />
            </div>
            <span className="text-[10px] text-gray-400">{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function countDocs(collectionName, ...conditions) {
  const ref = collection(db, collectionName);
  const q = conditions.length ? query(ref, ...conditions) : ref;
  return getCountFromServer(q).then((snap) => snap.data().count);
}

// Pulls every doc's timestamp (checking a few likely field names) and buckets
// counts by month for a trailing N-month trend. Adjust the field list below
// if your documents use a different timestamp field name.
async function fetchMonthlyTrend(collectionName, months, barangayFilter) {
  const ref = collection(db, collectionName);
  const conditions = barangayFilter ? [where('barangay', '==', barangayFilter)] : [];
  const q = conditions.length ? query(ref, ...conditions) : ref;
  const snap = await getDocs(q);

  const now = new Date();
  const buckets = {};
  const order = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    buckets[key] = { label: d.toLocaleString('default', { month: 'short' }), value: 0 };
    order.push(key);
  }

  snap.forEach((doc) => {
    const data = doc.data();
    const raw = data.createdAt || data.timestamp || data.date || data.created_at;
    if (!raw) return;
    const date = typeof raw.toDate === 'function' ? raw.toDate() : new Date(raw);
    if (isNaN(date)) return;
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    if (buckets[key]) buckets[key].value += 1;
  });

  return order.map((k) => buckets[k]);
}

export default function Analytics() {
  const { isSuperAdmin, adminData } = useAuth();
  const myBarangay = adminData?.barangay || null; // set only for the two barangay-scoped sub-admins
  const [stats, setStats] = useState(null);
  const [trend, setTrend] = useState(null);
  const [loading, setLoading] = useState(true);
  const [trendLoading, setTrendLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const queries = [
          countDocs('editorial_health', ...(myBarangay ? [where('barangay', '==', myBarangay)] : [])),
          countDocs('emergencies', ...(myBarangay ? [where('barangay', '==', myBarangay)] : [])),
          countDocs('health_centers'),
        ];

        // id_verifications and the full /users list are super_admin-only per
        // the Firestore rules — a sub-admin has no page for these either
        // (see Sidebar.jsx), so skip the calls rather than eat a denied read.
        if (isSuperAdmin) {
          queries.push(
            countDocs('users'),
            countDocs('users', where('status', '==', 'ACTIVE')),
            countDocs('id_verifications', where('status', '==', 'pending')),
            countDocs('id_verifications', where('status', '==', 'approved')),
          );
        }

        const results = await Promise.all(queries);
        const [announcements, sosEvents, healthCenters, totalUsers, activeUsers, pendingIDs, approvedIDs] = results;
        setStats({ announcements, sosEvents, healthCenters, totalUsers, activeUsers, pendingIDs, approvedIDs });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, [isSuperAdmin, myBarangay]);

  useEffect(() => {
    async function loadTrend() {
      try {
        const [sosMonthly, announcementsMonthly] = await Promise.all([
          fetchMonthlyTrend('emergencies', 6, myBarangay),
          fetchMonthlyTrend('editorial_health', 6, myBarangay),
        ]);
        setTrend({ sosMonthly, announcementsMonthly });
      } catch (err) {
        console.error(err);
      } finally {
        setTrendLoading(false);
      }
    }
    loadTrend();
  }, [myBarangay]);

  const activitySub = myBarangay ? 'In your barangay' : 'Citywide';

  const activeUserPercent = stats?.totalUsers ? Math.round((stats.activeUsers / stats.totalUsers) * 100) : null;
  const idsProcessedTotal = (stats?.approvedIDs ?? 0) + (stats?.pendingIDs ?? 0);
  const approvedIDPercent = idsProcessedTotal ? Math.round((stats.approvedIDs / idsProcessedTotal) * 100) : null;

  const sections = [
    ...(isSuperAdmin ? [{
      title: 'User Management',
      cards: [
        { icon: Users, label: 'Total Users', key: 'totalUsers', sub: 'All registered residents', color: 'text-[#0f52ba]', bg: 'bg-blue-50' },
        { icon: TrendingUp, label: 'Active Users', key: 'activeUsers', sub: 'Currently active accounts', color: 'text-green-600', bg: 'bg-green-50', percent: activeUserPercent },
      ],
    }] : []),
    ...(isSuperAdmin ? [{
      title: 'ID Verification & Release',
      cards: [
        { icon: ShieldCheck, label: 'Pending IDs', key: 'pendingIDs', sub: 'Awaiting review', color: 'text-yellow-600', bg: 'bg-yellow-50' },
        { icon: ShieldCheck, label: 'Approved IDs', key: 'approvedIDs', sub: 'Verified residents', color: 'text-green-600', bg: 'bg-green-50', percent: approvedIDPercent },
      ],
    }] : []),
    {
      title: 'Activity',
      cards: [
        { icon: Megaphone, label: 'Announcements', key: 'announcements', sub: activitySub, color: 'text-purple-600', bg: 'bg-purple-50' },
        { icon: Map, label: 'SOS Events', key: 'sosEvents', sub: activitySub, color: 'text-red-600', bg: 'bg-red-50' },
        { icon: Building2, label: 'Health Centers', key: 'healthCenters', sub: 'Listed facilities', color: 'text-teal-600', bg: 'bg-teal-50' },
      ],
    },
  ];

  const pageSub = isSuperAdmin
    ? 'Full system overview across all departments'
    : myBarangay
    ? `Activity overview for Brgy. ${myBarangay}`
    : 'Activity overview across all barangays';

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 size={24} className="text-[#0f52ba]" /> Analytics & Reports
        </h1>
        <p className="text-sm text-gray-500 mt-1">{pageSub}</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="animate-spin text-blue-500" />
        </div>
      ) : (
        <>
          {sections.map((section) => (
            <div key={section.title} className="mb-6">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">{section.title}</h2>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {section.cards.map((card) => (
                  <StatCard key={card.key} {...card} value={stats?.[card.key]} />
                ))}
              </div>
            </div>
          ))}

          <div className="mb-6">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Breakdowns</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {isSuperAdmin && idsProcessedTotal > 0 && (
                <DonutChart
                  title="ID Verification Status"
                  segments={[
                    { label: 'Approved', value: stats.approvedIDs, color: '#22c55e' },
                    { label: 'Pending', value: stats.pendingIDs, color: '#eab308' },
                  ]}
                />
              )}
              {isSuperAdmin && stats?.totalUsers > 0 && (
                <DonutChart
                  title="User Status"
                  segments={[
                    { label: 'Active', value: stats.activeUsers, color: '#0f52ba' },
                    { label: 'Inactive', value: Math.max(stats.totalUsers - stats.activeUsers, 0), color: '#e5e7eb' },
                  ]}
                />
              )}
              <CategoryBarChart
                title="Activity by Category"
                bars={[
                  { label: 'Announcements', value: stats?.announcements ?? 0, color: '#a855f7' },
                  { label: 'SOS Events', value: stats?.sosEvents ?? 0, color: '#ef4444' },
                  { label: 'Health Centers', value: stats?.healthCenters ?? 0, color: '#14b8a6' },
                ]}
              />
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Trends (Last 6 Months)</h2>
            {trendLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={22} className="animate-spin text-blue-500" />
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <TrendChart title="SOS Events" points={trend?.sosMonthly ?? []} color="#ef4444" />
                <TrendChart title="Announcements" points={trend?.announcementsMonthly ?? []} color="#a855f7" />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
