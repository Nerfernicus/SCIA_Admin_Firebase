import React, { useEffect, useState, useRef } from "react";
import {
  Search,
  Bell,
  Settings,
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
} from "lucide-react";
import { db } from "../lib/firebase";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { Link } from "react-router-dom";

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
  const [selected, setSelected] = useState(new Set());
  const [toastMsg, setToastMsg] = useState("");
  const [toastType, setToastType] = useState("success");
  const [disapproveTarget, setDisapproveTarget] = useState(null);
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

  // ── Approve: PENDING → ACTIVE ──────────────────────────────────────────
  const handleApprove = async (userId, userName) => {
    await updateDoc(doc(db, "users", userId), { status: "ACTIVE" });
    showToast(`✓ ${userName} approved successfully.`, "success");
  };

  // ── Disapprove: delete from Firestore ─────────────────────────────────
  const handleDisapproveConfirm = async () => {
    if (!disapproveTarget) return;
    const name =
      `${disapproveTarget.firstName ?? ""} ${disapproveTarget.lastName ?? ""}`.trim();
    await deleteDoc(doc(db, "users", disapproveTarget.id));
    setSelected((prev) => {
      const n = new Set(prev);
      n.delete(disapproveTarget.id);
      return n;
    });
    setDisapproveTarget(null);
    showToast(`✗ ${name} disapproved and removed.`, "error");
  };

  // ── Other status actions ───────────────────────────────────────────────
  const setStatus = async (userId, newStatus) => {
    await updateDoc(doc(db, "users", userId), { status: newStatus });
    showToast(`User ${newStatus.toLowerCase()} successfully.`);
  };

  const deleteUser = async (userId) => {
    if (!window.confirm("Delete this user permanently?")) return;
    await deleteDoc(doc(db, "users", userId));
    setSelected((prev) => {
      const n = new Set(prev);
      n.delete(userId);
      return n;
    });
    showToast("User deleted.");
  };

  // ── Selection helpers ──────────────────────────────────────────────────
  const toggleSelect = (id) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((u) => u.id)));
  };

  // ── Batch: Mass Deactivate ─────────────────────────────────────────────
  const handleMassDeactivate = async () => {
    if (selected.size === 0) {
      showToast("Select at least one user first.");
      return;
    }
    if (!window.confirm(`Suspend ${selected.size} selected user(s)?`)) return;
    await Promise.all(
      [...selected].map((id) =>
        updateDoc(doc(db, "users", id), { status: "SUSPENDED" }),
      ),
    );
    setSelected(new Set());
    showToast(`${selected.size} user(s) suspended.`);
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

  // ── Filter ─────────────────────────────────────────────────────────────
  const filtered = users.filter((u) => {
    const fullName = `${u.firstName ?? ""} ${u.lastName ?? ""}`.toLowerCase();
    const s = search.toLowerCase();
    const matchesSearch =
      fullName.includes(s) ||
      (u.idNumber ?? "").includes(s) ||
      (u.address ?? "").toLowerCase().includes(s);
    const matchesStatus =
      statusFilter === "ALL" || (u.status ?? "PENDING") === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // ── KPI counts ─────────────────────────────────────────────────────────
  const totalUsers = users.length;
  const pendingCount = users.filter(
    (u) => (u.status ?? "PENDING") === "PENDING",
  ).length;
  const suspendedCount = users.filter((u) => u.status === "SUSPENDED").length;

  const filterLabels = {
    ALL: "All Users",
    ACTIVE: "Active",
    PENDING: "Pending",
    SUSPENDED: "Suspended",
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

      {/* Toast Notification */}
      {toastMsg && (
        <div
          className={`fixed top-6 right-6 z-9999 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-fade-in ${
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

      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-6">
          <span className="text-[#0f52ba] font-semibold text-lg">
            SCIA Admin
          </span>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-gray-100/50 border-none rounded-full py-2 pl-10 pr-4 w-72 focus:ring-2 focus:ring-blue-100 outline-none text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 text-gray-500">
         
          <button className="hover:text-gray-800">
            <Bell size={20} />
          </button>
          <button className="hover:text-gray-800 transition-colors">
            <Settings size={20} />
          </button>
          <div className="w-8 h-8 rounded-full border border-gray-200 bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
            A
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          User Management
        </h1>
        <p className="text-gray-500">
          Manage senior citizen accounts registered via the mobile app.
        </p>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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
            {selected.size > 0 && (
              <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                {selected.size} selected
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
                <th className="py-4 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={
                      filtered.length > 0 && selected.size === filtered.length
                    }
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded accent-[#0f52ba] cursor-pointer"
                  />
                </th>
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
                const isSelected = selected.has(user.id);
                const isPending = user.status === "PENDING" || !user.status;
                const fullName =
                  `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();

                return (
                  <tr
                    key={user.id}
                    className={`border-b border-gray-50 transition-colors ${isSelected ? "bg-blue-50/50" : "hover:bg-gray-50/50"}`}
                  >
                    <td className="py-4 px-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(user.id)}
                        className="w-4 h-4 rounded accent-[#0f52ba] cursor-pointer"
                      />
                    </td>
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

                        {/* ACTIVE: Suspend */}
                        {user.status === "ACTIVE" && (
                          <button
                            title="Suspend user"
                            onClick={() => setStatus(user.id, "SUSPENDED")}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-600 text-xs font-bold transition-colors border border-orange-200"
                          >
                            <Ban size={13} /> Suspend
                          </button>
                        )}

                        {/* SUSPENDED: Reactivate */}
                        {user.status === "SUSPENDED" && (
                          <button
                            title="Reactivate user"
                            onClick={() => setStatus(user.id, "ACTIVE")}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 text-xs font-bold transition-colors border border-blue-200"
                          >
                            <RotateCcw size={13} /> Reactivate
                          </button>
                        )}

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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#f4f6fc] rounded-2xl p-6 border border-blue-50">
          <h3 className="text-lg font-bold text-gray-900 mb-2">
            Batch Operations
          </h3>
          <p className="text-sm text-gray-500 mb-6">
            {selected.size > 0
              ? `${selected.size} user(s) selected.`
              : "Select users from the table above using checkboxes."}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleDownloadCSV}
              className="bg-white border border-[#0f52ba] text-[#0f52ba] px-4 py-2 rounded-full text-sm font-semibold hover:bg-blue-50 transition-colors shadow-sm flex items-center gap-2"
            >
              <Download size={15} /> Download CSV
            </button>
            <button
              onClick={handleMassDeactivate}
              className={`border px-4 py-2 rounded-full text-sm font-semibold transition-colors shadow-sm flex items-center gap-2 ${
                selected.size > 0
                  ? "bg-white border-red-500 text-red-600 hover:bg-red-50"
                  : "bg-white border-gray-300 text-gray-400 cursor-not-allowed"
              }`}
            >
              <Ban size={15} /> Mass Deactivate{" "}
              {selected.size > 0 ? `(${selected.size})` : ""}
            </button>
          </div>
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