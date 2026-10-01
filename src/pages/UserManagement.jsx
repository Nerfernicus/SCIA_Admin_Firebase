import React, { useEffect, useState, useRef } from "react";
import {
  Search,
  Users,
  ShieldAlert,
  Ban,
  SlidersHorizontal,
  RotateCcw,
  CheckCircle2,
  ArrowRight,
  Trash2,
  Download,
  X,
  ChevronDown,
  ThumbsUp,
  ThumbsDown,
  KeyRound,
  Clock,
  Copy,
  Loader2,
} from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../lib/firebase";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";


// ── Status badge helpers ───────────────────────────────────────────────────
const statusDot = (status) => {
  if (status === "ACTIVE") return "bg-green-500";
  if (status === "PENDING") return "bg-yellow-400";
  if (status === "SUSPENDED") return "bg-red-500";
  return "bg-gray-400";
};
const statusText = (status) => {
  if (status === "ACTIVE") return "text-green-600";
  if (status === "PENDING") return "text-yellow-600";
  if (status === "SUSPENDED") return "text-red-600";
  return "text-gray-600";
};

// ── Inactivity (180-day rule) ──────────────────────────────────────────────
// An account can only be deactivated after MORE than 180 days with no activity.
// "Last activity" = newest of the phone's presence ping, the last app login and
// the account creation time. The server enforces the same rule.
const INACTIVITY_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;
const toMs = (t) =>
  t?.toMillis ? t.toMillis() : t?.toDate ? t.toDate().getTime() : t ? new Date(t).getTime() || 0 : 0;
const lastActivityMs = (u) =>
  Math.max(toMs(u.last_active_timestamp), toMs(u.lastLoginAt), toMs(u.lastActivityAt), toMs(u.createdAt));
const daysInactive = (u) => {
  const last = lastActivityMs(u);
  return last ? Math.floor((Date.now() - last) / DAY_MS) : 0;
};
const isInactiveEligible = (u) => u.status !== "SUSPENDED" && u.status !== "PENDING" && daysInactive(u) > INACTIVITY_DAYS;
const fmtDate = (ms) => (ms ? new Date(ms).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "No record");

const deactivateInactiveUser = httpsCallable(functions, "deactivateInactiveUser");
const resetUserPassword = httpsCallable(functions, "resetUserPassword");
const callError = (e) => e?.message?.replace(/^.*?:\s*/, "") || "Something went wrong. Please try again.";

// ── Deactivate (one account, after review) ─────────────────────────────────
function DeactivateModal({ user, busy, onClose, onConfirm }) {
  const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 z-10 text-center">
        <div className="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Ban size={24} className="text-orange-600" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Deactivate this account?</h2>
        <p className="text-sm font-bold text-gray-800 mb-3">"{fullName}"</p>
        <div className="bg-gray-50 rounded-xl px-4 py-3 mb-4 text-left space-y-1">
          <p className="text-xs text-gray-500">Last activity: <span className="font-semibold text-gray-800">{fmtDate(lastActivityMs(user))}</span></p>
          <p className="text-xs text-gray-500">Inactive for: <span className="font-semibold text-gray-800">{daysInactive(user)} days</span> (limit: more than {INACTIVITY_DAYS})</p>
        </div>
        <p className="text-xs text-orange-700 font-semibold bg-orange-50 rounded-xl px-4 py-2 mb-6">
          The senior will no longer be able to use the account. You can reactivate it later.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} disabled={busy} className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={busy} className="flex-1 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Ban size={15} />} Deactivate
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reset a senior's password (Super Admin) ────────────────────────────────
function ResetPasswordModal({ user, onClose }) {
  const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // { tempPassword, idNumber }
  const [copied, setCopied] = useState(false);

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await resetUserPassword({ uid: user.id });
      setResult(res.data);
    } catch (e) {
      setError(callError(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    const text = `SCIA Login\nID Number: ${result.idNumber ?? user.idNumber ?? ""}\nTemporary Password: ${result.tempPassword}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 z-10 text-center">
        <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <KeyRound size={24} className="text-[#0f52ba]" />
        </div>
        {!result ? (
          <>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Reset password?</h2>
            <p className="text-sm font-bold text-gray-800 mb-3">"{fullName}"</p>
            <p className="text-xs text-gray-500 bg-gray-50 rounded-xl px-4 py-3 mb-4">
              A new temporary password will be created and the senior will be signed out of every device.
              Only do this after confirming who they are.
            </p>
            {error && <p role="alert" className="text-xs font-medium text-red-600 mb-3">{error}</p>}
            <div className="flex gap-3">
              <button onClick={onClose} disabled={busy} className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors">Cancel</button>
              <button onClick={run} disabled={busy} className="flex-1 py-3 rounded-xl bg-[#0f52ba] hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Reset
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-bold text-gray-900 mb-1">Password reset</h2>
            <p className="text-xs text-gray-500 mb-4">Give these to the senior now. The password is shown only once.</p>
            <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 text-left mb-4 space-y-3">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">ID Number</p>
                <p className="text-lg font-mono font-bold text-gray-900">{result.idNumber ?? user.idNumber}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Temporary Password</p>
                <p className="text-lg font-mono font-bold text-gray-900">{result.tempPassword}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={copy} className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-2 transition-colors">
                <Copy size={15} /> {copied ? "Copied!" : "Copy"}
              </button>
              <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-[#0f52ba] hover:bg-blue-700 text-white text-sm font-bold transition-colors">Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Disapprove Confirm Modal ───────────────────────────────────────────────
function DisapproveModal({ user, onClose, onConfirm }) {
  const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 z-10 text-center">
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <ThumbsDown size={24} className="text-red-500" />
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-1">
          Disapprove User?
        </h2>
        <p className="text-sm text-gray-500 mb-1">
          You are about to disapprove
        </p>
        <p className="text-sm font-bold text-gray-800 mb-4">"{fullName}"</p>
        <p className="text-xs text-red-500 font-semibold bg-red-50 rounded-xl px-4 py-2 mb-6">
          This will permanently remove the user from the system.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border-2 border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <ThumbsDown size={15} /> Disapprove
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [filterOpen, setFilterOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [toastType, setToastType] = useState("success");
  const [disapproveTarget, setDisapproveTarget] = useState(null);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const tableRef = useRef(null);
  const filterRef = useRef(null);

  // ── Real-time listener ────────────────────────────────────────────────
  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
      setUsers(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target))
        setFilterOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Toast ──────────────────────────────────────────────────────────────
  const showToast = (msg, type = "success") => {
    setToastMsg(msg);
    setToastType(type);
    setTimeout(() => setToastMsg(""), 3000);
  };

  // ── Approve: PENDING → ACTIVE + set isVerified = true ─────────────────
  const handleApprove = async (userId, userName) => {
    await updateDoc(doc(db, "users", userId), {
      status: "ACTIVE",
      isVerified: true,
    });
    showToast(`${userName} approved and verified.`, "success");
  };

  // ── Disapprove: delete from Firestore ─────────────────────────────────
  const handleDisapproveConfirm = async () => {
    if (!disapproveTarget) return;
    const name =
      `${disapproveTarget.firstName ?? ""} ${disapproveTarget.lastName ?? ""}`.trim();
    await deleteDoc(doc(db, "users", disapproveTarget.id));
    setDisapproveTarget(null);
    showToast(`${name} disapproved and removed.`, "error");
  };

  // ── Other status actions ───────────────────────────────────────────────
  const handleReactivate = async (userId) => {
    await updateDoc(doc(db, "users", userId), {
      status: "ACTIVE",
      reactivatedAt: new Date(),
    });
    showToast("User reactivated.");
  };

  // Deactivation is one account at a time and only for accounts inactive for
  // more than 180 days. The server re-checks the rule.
  const handleDeactivateConfirm = async () => {
    if (!deactivateTarget) return;
    if (!isInactiveEligible(deactivateTarget)) {
      showToast(`Only accounts inactive for more than ${INACTIVITY_DAYS} days can be deactivated.`, "error");
      setDeactivateTarget(null);
      return;
    }
    setBusy(true);
    try {
      await deactivateInactiveUser({ uid: deactivateTarget.id });
      const name = `${deactivateTarget.firstName ?? ""} ${deactivateTarget.lastName ?? ""}`.trim();
      setDeactivateTarget(null);
      showToast(`${name} deactivated.`);
    } catch (e) {
      showToast(callError(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const deleteUser = async (userId) => {
    if (!window.confirm("Delete this user permanently?")) return;
    await deleteDoc(doc(db, "users", userId));
    showToast("User deleted.");
  };

  // ── Download CSV ───────────────────────────────────────────────────────
  const handleDownloadCSV = () => {
    const rows = filtered.map((u) => ({
      Name: `${u.firstName ?? ""} ${u.midName ? u.midName[0] + "." : ""} ${u.lastName ?? ""}`.trim(),
      ID_Number: u.idNumber ?? "",
      Contact: u.conNumber ?? "",
      Address: u.address ?? "",
      Status: u.status ?? "PENDING",
      Registered: u.createdAt?.toDate
        ? u.createdAt.toDate().toLocaleDateString()
        : "",
    }));
    if (rows.length === 0) {
      showToast("No users to export.");
      return;
    }
    const headers = Object.keys(rows[0]).join(",");
    const csvRows = rows.map((r) =>
      Object.values(r)
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [headers, ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `users_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("CSV downloaded!");
  };

  // ── Review Pending ─────────────────────────────────────────────────────
  const handleReviewPending = () => {
    setStatusFilter("PENDING");
    setSearch("");
    setTimeout(
      () =>
        tableRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      100,
    );
  };

  const handleReviewInactive = () => {
    setStatusFilter("INACTIVE");
    setSearch("");
    setTimeout(() => tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };

  // ── Filter ─────────────────────────────────────────────────────────────
  const filtered = users.filter((u) => {
    const fullName = `${u.firstName ?? ""} ${u.lastName ?? ""}`.toLowerCase();
    const s = search.toLowerCase();
    const matchesSearch =
      fullName.includes(s) ||
      (u.idNumber ?? "").includes(s) ||
      (u.address ?? "").toLowerCase().includes(s);
    const matchesStatus =
      statusFilter === "ALL" ||
      (statusFilter === "INACTIVE"
        ? isInactiveEligible(u)
        : (u.status ?? "PENDING") === statusFilter);
    return matchesSearch && matchesStatus;
  });
  // Longest-inactive first when reviewing inactive accounts.
  if (statusFilter === "INACTIVE") filtered.sort((a, b) => daysInactive(b) - daysInactive(a));

  // ── KPI counts ─────────────────────────────────────────────────────────
  const totalUsers = users.length;
  const pendingCount = users.filter(
    (u) => (u.status ?? "PENDING") === "PENDING",
  ).length;
  const suspendedCount = users.filter((u) => u.status === "SUSPENDED").length;
  const inactiveCount = users.filter(isInactiveEligible).length;

  const filterLabels = {
    ALL: "All Users",
    ACTIVE: "Active",
    PENDING: "Pending",
    SUSPENDED: "Suspended",
    INACTIVE: `Inactive ${INACTIVITY_DAYS}+ days`,
  };

  return (
    <div className="flex-1 bg-[#f8f9fa] min-h-screen p-8 font-sans relative">
      {/* Disapprove Confirm Modal */}
      {disapproveTarget && (
        <DisapproveModal
          user={disapproveTarget}
          onClose={() => setDisapproveTarget(null)}
          onConfirm={handleDisapproveConfirm}
        />
      )}

      {deactivateTarget && (
        <DeactivateModal
          user={deactivateTarget}
          busy={busy}
          onClose={() => setDeactivateTarget(null)}
          onConfirm={handleDeactivateConfirm}
        />
      )}
      {resetTarget && (
        <ResetPasswordModal user={resetTarget} onClose={() => setResetTarget(null)} />
      )}

      {/* Toast Notification */}
      {toastMsg && (
        <div
          className={`fixed top-6 right-6 z-[10001] text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-fade-in ${
            toastType === "error" ? "bg-red-600" : "bg-gray-900"
          }`}
        >
          {toastType === "error" ? (
            <ThumbsDown size={16} className="text-white" />
          ) : (
            <CheckCircle2 size={16} className="text-green-400" />
          )}
          {toastMsg}
          <button onClick={() => setToastMsg("")}>
            <X size={14} className="text-white/60 hover:text-white" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">User Management</h1>
            <p className="text-gray-500">Manage senior citizen accounts registered via the mobile app.</p>
          </div>
          <div className="relative mt-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Search users…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl py-2.5 pl-9 pr-8 w-64 focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none text-sm"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
        <button
          onClick={() => setStatusFilter("ALL")}
          className={`bg-white rounded-2xl p-6 shadow-sm border flex items-center gap-4 text-left transition-all ${statusFilter === "ALL" ? "border-[#0f52ba] ring-2 ring-[#0f52ba]/20" : "border-gray-100 hover:border-blue-200"}`}
        >
          <div className="bg-blue-50 p-4 rounded-xl text-[#0f52ba]">
            <Users size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              Total Users
            </p>
            <h2 className="text-3xl font-bold text-gray-900">{totalUsers}</h2>
          </div>
        </button>
        <button
          onClick={() => setStatusFilter("PENDING")}
          className={`bg-white rounded-2xl p-6 shadow-sm border flex items-center gap-4 text-left transition-all ${statusFilter === "PENDING" ? "border-yellow-400 ring-2 ring-yellow-200" : "border-gray-100 hover:border-yellow-200"}`}
        >
          <div className="bg-yellow-50 p-4 rounded-xl text-yellow-600">
            <ShieldAlert size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              Pending Verification
            </p>
            <h2 className="text-3xl font-bold text-gray-900">{pendingCount}</h2>
          </div>
        </button>
        <button
          onClick={() => setStatusFilter("SUSPENDED")}
          className={`bg-white rounded-2xl p-6 shadow-sm border flex items-center gap-4 text-left transition-all ${statusFilter === "SUSPENDED" ? "border-red-400 ring-2 ring-red-200" : "border-gray-100 hover:border-red-200"}`}
        >
          <div className="bg-red-50 p-4 rounded-xl text-red-600">
            <Ban size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              Suspended
            </p>
            <h2 className="text-3xl font-bold text-gray-900">
              {suspendedCount}
            </h2>
          </div>
        </button>
        <button
          onClick={() => setStatusFilter("INACTIVE")}
          className={`bg-white rounded-2xl p-6 shadow-sm border flex items-center gap-4 text-left transition-all ${statusFilter === "INACTIVE" ? "border-orange-400 ring-2 ring-orange-200" : "border-gray-100 hover:border-orange-200"}`}
        >
          <div className="bg-orange-50 p-4 rounded-xl text-orange-600">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
              Inactive {INACTIVITY_DAYS}+ Days
            </p>
            <h2 className="text-3xl font-bold text-gray-900">{inactiveCount}</h2>
          </div>
        </button>
      </div>

      {/* Table */}
      <div
        ref={tableRef}
        className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-8 overflow-hidden"
      >
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-white">
          <div className="flex items-center gap-3">
            <p className="text-sm text-gray-500 font-medium">
              {loading
                ? "Loading..."
                : `${filtered.length} user${filtered.length !== 1 ? "s" : ""}`}
            </p>
            {statusFilter !== "ALL" && (
              <span className="flex items-center gap-1.5 bg-blue-50 text-[#0f52ba] text-xs font-semibold px-3 py-1 rounded-full">
                {filterLabels[statusFilter]}
                <button onClick={() => setStatusFilter("ALL")}>
                  <X size={12} />
                </button>
              </span>
            )}
          </div>
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setFilterOpen((prev) => !prev)}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-gray-200 transition-colors"
            >
              <SlidersHorizontal size={16} /> Filters
              <ChevronDown
                size={14}
                className={`transition-transform ${filterOpen ? "rotate-180" : ""}`}
              />
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-full mt-2 bg-white border border-gray-100 rounded-2xl shadow-xl z-50 py-2 w-48">
                {Object.entries(filterLabels).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => {
                      setStatusFilter(val);
                      setFilterOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-2 ${statusFilter === val ? "text-[#0f52ba]" : "text-gray-700"}`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${statusFilter === val ? "bg-[#0f52ba]" : "bg-transparent"}`}
                    ></span>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white border-b border-gray-100">
                <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  User
                </th>
                <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  ID Number
                </th>
                <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Contact
                </th>
                <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Registered
                </th>
                <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Last Active
                </th>
                <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-10 text-center text-gray-400 text-sm"
                  >
                    Loading users...
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-10 text-center text-gray-400 text-sm"
                  >
                    {statusFilter !== "ALL"
                      ? `No ${filterLabels[statusFilter].toLowerCase()} users found.`
                      : "No users yet. Senior citizens who sign up via the app will appear here."}
                  </td>
                </tr>
              )}
              {filtered.map((user) => {
                const createdAt = user.createdAt?.toDate
                  ? user.createdAt.toDate()
                  : new Date(user.createdAt ?? Date.now());
                const timeAgo = Math.round((Date.now() - createdAt) / 60000);
                const joined =
                  timeAgo < 60
                    ? `${timeAgo}m ago`
                    : timeAgo < 1440
                      ? `${Math.round(timeAgo / 60)}h ago`
                      : `${Math.round(timeAgo / 1440)}d ago`;
                const inactiveDays = daysInactive(user);
                const eligible = isInactiveEligible(user);
                const isPending = user.status === "PENDING" || !user.status;
                const fullName =
                  `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();

                return (
                  <tr
                    key={user.id}
                    className="border-b border-gray-50 transition-colors hover:bg-gray-50/50"
                  >
                    <td className="py-4 px-6">
                      <p className="font-bold text-gray-900 text-sm">
                        {user.firstName}{" "}
                        {user.midName ? user.midName[0] + "." : ""}{" "}
                        {user.lastName}
                      </p>
                      <p className="text-gray-500 text-xs">{user.address}</p>
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-700 font-mono">
                      {user.idNumber}
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-600">
                      {user.conNumber}
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${statusDot(user.status ?? "PENDING")}`}
                        ></span>
                        <span
                          className={`text-xs font-bold ${statusText(user.status ?? "PENDING")}`}
                        >
                          {user.status ?? "PENDING"}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-sm text-gray-500">
                      {joined}
                    </td>
                    <td className="py-4 px-6 text-sm">
                      <p className="text-gray-600">{fmtDate(lastActivityMs(user))}</p>
                      <p className={`text-xs font-semibold ${inactiveDays > INACTIVITY_DAYS ? "text-orange-600" : "text-gray-400"}`}>
                        {inactiveDays === 0 ? "Today" : `${inactiveDays} day${inactiveDays === 1 ? "" : "s"} inactive`}
                      </p>
                    </td>

                    {/* ── Actions ── */}
                    <td className="py-4 px-6">
                      <div className="flex items-center justify-end gap-2">
                        {/* PENDING: Approve + Disapprove */}
                        {isPending && (
                          <>
                            <button
                              title="Approve"
                              onClick={() => handleApprove(user.id, fullName)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 text-xs font-bold transition-colors border border-green-200"
                            >
                              <ThumbsUp size={13} /> Approve
                            </button>
                            <button
                              title="Disapprove and remove"
                              onClick={() => setDisapproveTarget(user)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold transition-colors border border-red-200"
                            >
                              <ThumbsDown size={13} /> Disapprove
                            </button>
                          </>
                        )}

                        {/* ACTIVE: Deactivate (one at a time, only after 180+ inactive days) */}
                        {user.status === "ACTIVE" && (
                          <button
                            title={eligible ? "Review and deactivate this inactive account" : `Only available after more than ${INACTIVITY_DAYS} days of inactivity (${Math.max(0, INACTIVITY_DAYS + 1 - inactiveDays)} to go)`}
                            disabled={!eligible}
                            onClick={() => setDeactivateTarget(user)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
                              eligible
                                ? "bg-orange-50 hover:bg-orange-100 text-orange-600 border-orange-200"
                                : "bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed"
                            }`}
                          >
                            <Ban size={13} /> Deactivate
                          </button>
                        )}

                        {/* SUSPENDED: Reactivate */}
                        {user.status === "SUSPENDED" && (
                          <button
                            title="Reactivate user"
                            onClick={() => handleReactivate(user.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-bold transition-colors border border-blue-200"
                          >
                            <RotateCcw size={13} /> Reactivate
                          </button>
                        )}

                        {/* Super Admin: reset password */}
                        <button
                          title="Reset password"
                          onClick={() => setResetTarget(user)}
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-[#0f52ba] transition-colors"
                        >
                          <KeyRound size={16} />
                        </button>

                        {/* Delete — always visible */}
                        <button
                          title="Delete user"
                          onClick={() => deleteUser(user.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-[#f4f6fc] rounded-2xl p-6 border border-blue-50">
          <h3 className="text-lg font-bold text-gray-900 mb-2">Export</h3>
          <p className="text-sm text-gray-500 mb-6">
            Download the users currently shown in the table.
          </p>
          <button
            onClick={handleDownloadCSV}
            className="bg-white border border-[#0f52ba] text-[#0f52ba] px-4 py-2 rounded-full text-sm font-semibold hover:bg-blue-50 transition-colors shadow-sm flex items-center gap-2"
          >
            <Download size={15} /> Download CSV
          </button>
        </div>

        <div className="bg-[#fff4ec] rounded-2xl p-6 border border-orange-100">
          <h3 className="text-lg font-bold text-gray-900 mb-2">Inactive Account Review</h3>
          <p className="text-sm text-gray-600 font-medium mb-1">
            {inactiveCount} account{inactiveCount !== 1 ? "s" : ""} inactive for more than {INACTIVITY_DAYS} days.
          </p>
          <p className="text-xs text-gray-500 mb-3">
            Review each one and deactivate individually. Bulk deactivation is not available.
          </p>
          <button
            onClick={handleReviewInactive}
            className="text-orange-700 font-semibold text-sm flex items-center gap-1 hover:text-orange-800 transition-colors"
          >
            Review Inactive <ArrowRight size={16} />
          </button>
        </div>

        <div className="bg-[#fff9ed] rounded-2xl p-6 border border-yellow-100">
          <h3 className="text-lg font-bold text-gray-900 mb-2">
            Pending Review
          </h3>
          <p className="text-sm text-gray-600 font-medium mb-3">
            {pendingCount} user{pendingCount !== 1 ? "s" : ""} waiting for ID
            verification.
          </p>
          <button
            onClick={handleReviewPending}
            className="text-yellow-700 font-semibold text-sm flex items-center gap-1 hover:text-yellow-800 transition-colors"
          >
            Review Pending <ArrowRight size={16} />
          </button>
        </div>
      </div>

      <style>{`
                @keyframes fade-in {
                    from { opacity: 0; transform: translateY(-8px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in { animation: fade-in 0.2s ease-out; }
            `}</style>
    </div>
  );
}
