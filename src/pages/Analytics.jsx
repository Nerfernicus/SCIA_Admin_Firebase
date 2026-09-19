import { useEffect, useState } from 'react';
import { BarChart3, Users, ShieldCheck, Megaphone, Map, Building2, Loader2, X } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, getCountFromServer, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

const PERIODS = [
  { id: 'daily', label: 'Daily', noun: 'day', sub: 'Last 14 days' },
  { id: 'weekly', label: 'Weekly', noun: 'week', sub: 'Last 8 weeks' },
  { id: 'monthly', label: 'Monthly', noun: 'month', sub: 'Last 6 months' },
  { id: 'yearly', label: 'Yearly', noun: 'year', sub: 'Last 5 years' },
];

function PeriodToggle({ value, onChange }) {
  return (
    <div className="inline-flex bg-gray-100 rounded-xl p-1">
      {PERIODS.map((p) => (
        <button
          key={p.id}
          onClick={() => onChange(p.id)}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            value === p.id ? 'bg-white text-[#0f52ba] shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

// Gradient tile in the app's existing per-metric colors. Clickable when
// onClick is passed — opens the DetailModal for that metric.
function GradientStatCard({ icon: Icon, label, value, sub, gradient, onClick }) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      className={`rounded-2xl p-5 text-white shadow-lg text-left w-full ${gradient} ${
        onClick ? 'cursor-pointer hover:brightness-110 hover:-translate-y-0.5 transition-all' : ''
      }`}
    >
      <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center mb-3">
        <Icon size={16} className="text-white" />
      </div>
      <p className="text-2xl font-bold">{value ?? 'N/A'}</p>
      <p className="text-xs text-white/85 mt-0.5">{label}</p>
      {sub && <p className="text-[11px] text-white/60 mt-1">{sub}</p>}
    </Wrapper>
  );
}

// Small SVG area/line chart used inside the hero card (like a sparkline).
function LineAreaChart({ points, color = '#ffffff', height = 100 }) {
  if (!points.length || points.every((p) => p.value === 0)) {
    return <p className="text-xs text-white/60">No data yet for this period</p>;
  }

  const width = 100;
  const max = Math.max(...points.map((p) => p.value), 1);
  const stepX = width / (points.length - 1 || 1);
  const coords = points.map((p, i) => ({
    x: i * stepX,
    y: height - (p.value / max) * (height - 8) - 4,
  }));

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${height} L 0 ${height} Z`;
  const gradientId = `hero-grad-${color.replace('#', '')}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {coords.map((c, i) => (
        <circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 2.5 : 0} fill={color} />
      ))}
    </svg>
  );
}

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
                <span className="font-semibold text-gray-900">{Math.round((s.value / total) * 100)}%</span>
                <span className="text-gray-400">({s.value})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

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
              <div className="w-full rounded-t-md" style={{ height: `${Math.max((p.value / max) * 100, p.value > 0 ? 6 : 0)}%`, background: color }} />
            </div>
            <span className="text-[10px] text-gray-400">{p.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Compact trend chart used inside DetailModal (no card wrapper, since it's
// already inside one).
function MiniTrend({ points, color }) {
  const max = Math.max(...points.map((p) => p.value), 1);
  return (
    <div className="flex items-end gap-1.5 h-24">
      {points.map((p, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
          <span className="text-[9px] text-gray-400">{p.value}</span>
          <div className="w-full flex items-end h-16 bg-gray-50 rounded overflow-hidden">
            <div className="w-full rounded-t" style={{ height: `${Math.max((p.value / max) * 100, p.value > 0 ? 6 : 0)}%`, background: color }} />
          </div>
          <span className="text-[9px] text-gray-400">{p.label}</span>
        </div>
      ))}
    </div>
  );
}

// What each clickable stat tile drills into: its Firestore collection, and
// the icon/color to reuse for a consistent look with the tile itself.
const DETAIL_META = {
  announcements: { label: 'Announcements', collectionName: 'editorial_health', icon: Megaphone, iconBg: 'bg-[#eaf1fb]', iconColor: 'text-[#3d74c9]', color: '#5b8fdb' },
  sos: { label: 'SOS Events', collectionName: 'emergencies', icon: Map, iconBg: 'bg-red-50', iconColor: 'text-red-500', color: '#ef4444' },
  health: { label: 'Health Centers', collectionName: 'health_centers', icon: Building2, iconBg: 'bg-[#eaf1fb]', iconColor: 'text-[#0f52ba]', color: '#0b3d91' },
  users: { label: 'Active Users', collectionName: 'users', icon: Users, iconBg: 'bg-amber-50', iconColor: 'text-amber-500', color: '#f59e0b' },
};

// Detail popup for a clicked stat tile. Barangay admins only ever see their
// own barangay's records (the collection query itself is scoped), so no
// per-barangay breakdown is shown for them — OSCA (super admin) sees every
// barangay and gets a citywide breakdown bar for comparison.
function DetailModal({ type, onClose, isSuperAdmin, myBarangay, period, periodMeta }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const meta = type ? DETAIL_META[type] : null;

  useEffect(() => {
    if (!type) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const ref = collection(db, meta.collectionName);
        const conditions = myBarangay ? [where('barangay', '==', myBarangay)] : [];
        const q = conditions.length ? query(ref, ...conditions) : ref;
        const snap = await getDocs(q);

        const statusCounts = {};
        const barangayCounts = {};
        snap.forEach((doc) => {
          const d = doc.data();
          if (d.status) {
            const s = String(d.status).toLowerCase();
            statusCounts[s] = (statusCounts[s] || 0) + 1;
          }
          if (isSuperAdmin && d.barangay) {
            barangayCounts[d.barangay] = (barangayCounts[d.barangay] || 0) + 1;
          }
        });

        const trendPoints = await fetchTrend(meta.collectionName, period, myBarangay);

        if (!cancelled) setData({ total: snap.size, statusCounts, barangayCounts, trendPoints });
      } catch (err) {
        console.error(err);
        if (!cancelled) setData({ total: 0, statusCounts: {}, barangayCounts: {}, trendPoints: [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [type, myBarangay, period, isSuperAdmin, meta]);

  if (!type) return null;

  const Icon = meta.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${meta.iconBg}`}>
              <Icon size={18} className={meta.iconColor} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{meta.label}</h2>
              <p className="text-xs text-gray-400">{myBarangay ? `Brgy. ${myBarangay}` : 'Citywide'}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-[#0f52ba]" />
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <p className="text-3xl font-bold text-gray-900">{data.total}</p>
              <p className="text-xs text-gray-400">Total records</p>
            </div>

            {Object.keys(data.statusCounts).length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">By Status</h3>
                <div className="space-y-2.5">
                  {Object.entries(data.statusCounts).map(([status, count]) => (
                    <div key={status}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="capitalize text-gray-600 font-medium">{status}</span>
                        <span className="font-semibold text-gray-900">{count}</span>
                      </div>
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${(count / data.total) * 100}%`, background: meta.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isSuperAdmin && Object.keys(data.barangayCounts).length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">By Barangay</h3>
                <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                  {Object.entries(data.barangayCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([brgy, count]) => (
                      <div key={brgy}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-gray-600 font-medium">{brgy}</span>
                          <span className="font-semibold text-gray-900">{count}</span>
                        </div>
                        <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-[#0f52ba]" style={{ width: `${(count / data.total) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
                Trend &middot; {periodMeta.sub}
              </h3>
              <MiniTrend points={data.trendPoints} color={meta.color} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function countDocs(collectionName, ...conditions) {
  const ref = collection(db, collectionName);
  const q = conditions.length ? query(ref, ...conditions) : ref;
  return getCountFromServer(q).then((snap) => snap.data().count);
}

// Builds the bucket windows for a period type: 14 days, 8 weeks, 6 months,
// or 5 years, each with a start/end Date range and a display label.
function getPeriodBuckets(periodType) {
  const now = new Date();
  const buckets = [];

  if (periodType === 'daily') {
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      buckets.push({
        label: d.toLocaleDateString('default', { month: 'short', day: 'numeric' }),
        value: 0,
        start: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
        end: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59),
      });
    }
  } else if (periodType === 'weekly') {
    for (let i = 7; i >= 0; i--) {
      const end = new Date(now);
      end.setDate(now.getDate() - i * 7);
      const start = new Date(end);
      start.setDate(end.getDate() - 6);
      buckets.push({
        label: `${start.getMonth() + 1}/${start.getDate()}`,
        value: 0,
        start: new Date(start.getFullYear(), start.getMonth(), start.getDate()),
        end: new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59),
      });
    }
  } else if (periodType === 'yearly') {
    for (let i = 4; i >= 0; i--) {
      const y = now.getFullYear() - i;
      buckets.push({ label: `${y}`, value: 0, start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59) });
    }
  } else {
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        label: d.toLocaleString('default', { month: 'short' }),
        value: 0,
        start: new Date(d.getFullYear(), d.getMonth(), 1),
        end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59),
      });
    }
  }

  return buckets;
}

// Fetches every doc in a collection and buckets counts into the given
// period's windows by whichever timestamp field it finds first. Adjust the
// field list below if your documents use a different timestamp field name.
async function fetchTrend(collectionName, periodType, barangayFilter) {
  const ref = collection(db, collectionName);
  const conditions = barangayFilter ? [where('barangay', '==', barangayFilter)] : [];
  const q = conditions.length ? query(ref, ...conditions) : ref;
  const snap = await getDocs(q);
  const buckets = getPeriodBuckets(periodType);

  snap.forEach((doc) => {
    const data = doc.data();
    const raw = data.createdAt || data.timestamp || data.date || data.created_at;
    if (!raw) return;
    const date = typeof raw.toDate === 'function' ? raw.toDate() : new Date(raw);
    if (isNaN(date)) return;
    const bucket = buckets.find((b) => date >= b.start && date <= b.end);
    if (bucket) bucket.value += 1;
  });

  return buckets.map(({ label, value }) => ({ label, value }));
}

export default function Analytics() {
  const { isSuperAdmin, adminData } = useAuth();
  const myBarangay = adminData?.barangay || null;

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const [period, setPeriod] = useState('monthly');
  const [trend, setTrend] = useState(null);
  const [trendLoading, setTrendLoading] = useState(true);

  const [activeDetail, setActiveDetail] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let firstLoad = true;

    async function loadStats() {
      if (firstLoad) setLoading(true);
      try {
        const queries = [
          countDocs('editorial_health', ...(myBarangay ? [where('barangay', '==', myBarangay)] : [])),
          countDocs('emergencies', ...(myBarangay ? [where('barangay', '==', myBarangay)] : [])),
          countDocs('health_centers'),
        ];

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
        if (!cancelled) {
          setStats({ announcements, sosEvents, healthCenters, totalUsers, activeUsers, pendingIDs, approvedIDs });
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled && firstLoad) {
          setLoading(false);
          firstLoad = false;
        }
      }
    }

    loadStats();
    // Re-poll the lightweight count queries every 60s so the numbers on this
    // page stay live without a manual refresh or a full-page reload flicker.
    const interval = setInterval(loadStats, 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isSuperAdmin, myBarangay]);

  useEffect(() => {
    async function loadTrend() {
      setTrendLoading(true);
      try {
        const [sosTrend, announcementsTrend] = await Promise.all([
          fetchTrend('emergencies', period, myBarangay),
          fetchTrend('editorial_health', period, myBarangay),
        ]);
        setTrend({ sosTrend, announcementsTrend });
      } catch (err) {
        console.error(err);
      } finally {
        setTrendLoading(false);
      }
    }
    loadTrend();
  }, [period, myBarangay]);

  const activitySub = myBarangay ? 'In your barangay' : 'Citywide';
  const activeUserPercent = stats?.totalUsers ? Math.round((stats.activeUsers / stats.totalUsers) * 100) : null;
  const idsProcessedTotal = (stats?.approvedIDs ?? 0) + (stats?.pendingIDs ?? 0);
  const approvedIDPercent = idsProcessedTotal ? Math.round((stats.approvedIDs / idsProcessedTotal) * 100) : null;

  const periodMeta = PERIODS.find((p) => p.id === period);

  const heroTrend = (trend?.sosTrend ?? []).map((p, i) => ({
    label: p.label,
    value: p.value + (trend?.announcementsTrend?.[i]?.value ?? 0),
  }));
  const heroTotal = heroTrend.length ? heroTrend[heroTrend.length - 1].value : 0;
  const heroPrev = heroTrend.length > 1 ? heroTrend[heroTrend.length - 2].value : null;
  const heroDelta = heroPrev ? Math.round(((heroTotal - heroPrev) / heroPrev) * 100) : null;

  const pageSub = isSuperAdmin
    ? 'Full system overview across all departments'
    : myBarangay
    ? `Activity overview for Brgy. ${myBarangay}`
    : 'Activity overview across all barangays';

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 size={24} className="text-[#0f52ba]" /> Analytics & Reports
          </h1>
          <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
            {pageSub}
            <span className="inline-flex items-center gap-1 text-gray-400">
              <span className="text-gray-300">&middot;</span>
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0f52ba] opacity-50" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#0f52ba]" />
              </span>
              live
            </span>
          </p>
        </div>
        <PeriodToggle value={period} onChange={setPeriod} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={28} className="animate-spin text-blue-500" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <div className="lg:col-span-2 rounded-2xl p-6 text-white shadow-lg bg-gradient-to-br from-[#0f52ba] to-[#1a6fd4]">
              <div className="flex items-start justify-between mb-1">
                <div>
                  <p className="text-xs uppercase tracking-wide text-white/70">Total Activity</p>
                  <p className="text-3xl font-bold mt-1">{heroTotal}</p>
                </div>
                {heroDelta !== null && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/20">
                    {heroDelta >= 0 ? '▲' : '▼'} {Math.abs(heroDelta)}% vs last {periodMeta.noun}
                  </span>
                )}
              </div>
              <p className="text-xs text-white/60 mb-4">SOS reports + announcements &middot; {periodMeta.sub}</p>
              {trendLoading ? (
                <div className="h-[100px] flex items-center justify-center">
                  <Loader2 size={20} className="animate-spin text-white/70" />
                </div>
              ) : (
                <LineAreaChart points={heroTrend} color="#ffffff" height={100} />
              )}
            </div>

            {isSuperAdmin && idsProcessedTotal > 0 ? (
              <DonutChart
                title="ID Verification Status"
                segments={[
                  { label: 'Approved', value: stats.approvedIDs, color: '#0f52ba' },
                  { label: 'Pending', value: stats.pendingIDs, color: '#f59e0b' },
                ]}
              />
            ) : (
              <DonutChart
                title="Activity Mix"
                segments={[
                  { label: 'SOS Events', value: stats?.sosEvents ?? 0, color: '#ef4444' },
                  { label: 'Announcements', value: stats?.announcements ?? 0, color: '#5b8fdb' },
                  { label: 'Health Centers', value: stats?.healthCenters ?? 0, color: '#0b3d91' },
                ]}
              />
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <GradientStatCard
              icon={Megaphone}
              label="Announcements"
              value={stats?.announcements}
              sub={activitySub}
              gradient="bg-gradient-to-br from-[#3d74c9] to-[#5b8fdb]"
              onClick={() => setActiveDetail('announcements')}
            />
            <GradientStatCard
              icon={Map}
              label="SOS Events"
              value={stats?.sosEvents}
              sub={activitySub}
              gradient="bg-gradient-to-br from-red-500 to-red-600"
              onClick={() => setActiveDetail('sos')}
            />
            <GradientStatCard
              icon={Building2}
              label="Health Centers"
              value={stats?.healthCenters}
              sub="Listed facilities"
              gradient="bg-gradient-to-br from-[#0a2f6b] to-[#0f52ba]"
              onClick={() => setActiveDetail('health')}
            />
            {isSuperAdmin ? (
              <GradientStatCard
                icon={Users}
                label="Active Users"
                value={stats?.activeUsers}
                sub={activeUserPercent !== null ? `${activeUserPercent}% of total` : undefined}
                gradient="bg-gradient-to-br from-amber-400 to-amber-500"
                onClick={() => setActiveDetail('users')}
              />
            ) : (
              <GradientStatCard
                icon={ShieldCheck}
                label="Barangay"
                value={myBarangay ?? 'All'}
                sub="Your assigned area"
                gradient="bg-gradient-to-br from-amber-400 to-amber-500"
              />
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {isSuperAdmin && (
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
                { label: 'Announcements', value: stats?.announcements ?? 0, color: '#5b8fdb' },
                { label: 'SOS Events', value: stats?.sosEvents ?? 0, color: '#ef4444' },
                { label: 'Health Centers', value: stats?.healthCenters ?? 0, color: '#0b3d91' },
              ]}
            />
          </div>

          <div className="mb-6">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
              Trends &middot; {periodMeta.sub}
            </h2>
            {trendLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={22} className="animate-spin text-blue-500" />
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <TrendChart title="SOS Events" points={trend?.sosTrend ?? []} color="#ef4444" />
                <TrendChart title="Announcements" points={trend?.announcementsTrend ?? []} color="#5b8fdb" />
              </div>
            )}
          </div>
        </>
      )}

      <DetailModal
        type={activeDetail}
        onClose={() => setActiveDetail(null)}
        isSuperAdmin={isSuperAdmin}
        myBarangay={myBarangay}
        period={period}
        periodMeta={periodMeta}
      />
    </div>
  );
}
