import React from 'react';
import {
    Search, Bell, Settings, UserPlus, Users,
    ShieldAlert, Ban, SlidersHorizontal, ChevronDown,
    AlignLeft, RotateCcw, CheckCircle2, ChevronLeft,
    ChevronRight, ArrowRight
} from 'lucide-react';

// Dummy data for the user table
const userData = [
    {
        id: 1,
        name: 'Sarah Jenkins',
        email: 'sarah.j@editorialhealth.com',
        role: 'MEDICAL LEAD',
        status: 'ACTIVE',
        lastActivity: '2 mins ago',
        avatarUrl: 'https://i.pravatar.cc/150?u=sarah',
    },
    {
        id: 2,
        name: 'Marcus Thorne',
        email: 'm.thorne@editorialhealth.com',
        role: 'CLINICIAN',
        status: 'PENDING',
        lastActivity: 'Yesterday, 4:15 PM',
        avatarUrl: 'https://i.pravatar.cc/150?u=marcus',
    },
    {
        id: 3,
        name: 'Elena Rodriguez',
        email: 'e.rod@editorialhealth.com',
        role: 'EDITOR',
        status: 'SUSPENDED',
        lastActivity: 'Oct 12, 2023',
        avatarUrl: 'https://i.pravatar.cc/150?u=elena',
    },
    {
        id: 4,
        name: 'David Chen',
        email: 'd.chen@editorialhealth.com',
        role: 'STAFF',
        status: 'ACTIVE',
        lastActivity: '3 hours ago',
        avatarUrl: 'https://i.pravatar.cc/150?u=david',
    }
];

export default function UserManagement() {
    return (
        <div className="flex-1 bg-[#f8f9fa] min-h-screen p-8 font-sans">

            {/* Top Navigation Bar */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-6">
                    <span className="text-[#0f52ba] font-semibold text-lg">Editorial Health Admin</span>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search system logs or users..."
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

            {/* Header Section */}
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">User Management</h1>
                    <p className="text-gray-500">Manage permissions, status, and account security for 12,480 active users.</p>
                </div>
                <button className="bg-[#0f52ba] hover:bg-blue-700 text-white px-5 py-2.5 rounded-full font-medium flex items-center gap-2 transition-colors shadow-sm">
                    <UserPlus size={18} />
                    Create New User
                </button>
            </div>

            {/* KPI Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {/* Card 1 */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="bg-blue-50 p-4 rounded-xl text-[#0f52ba]">
                        <Users size={24} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Total Users</p>
                        <h2 className="text-3xl font-bold text-gray-900">12,482</h2>
                    </div>
                </div>

                {/* Card 2 */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="bg-yellow-50 p-4 rounded-xl text-yellow-600">
                        <ShieldAlert size={24} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Pending Verification</p>
                        <h2 className="text-3xl font-bold text-gray-900">142</h2>
                    </div>
                </div>

                {/* Card 3 */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="bg-red-50 p-4 rounded-xl text-red-600">
                        <Ban size={24} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Suspended</p>
                        <h2 className="text-3xl font-bold text-gray-900">18</h2>
                    </div>
                </div>
            </div>

            {/* Main Table Container */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-8 overflow-hidden">

                {/* Table Toolbar */}
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-white">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                            type="text"
                            placeholder="Filter by name, email or ID..."
                            className="bg-gray-50 border border-gray-100 rounded-lg py-2 pl-9 pr-4 w-80 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                    </div>
                    <div className="flex items-center gap-4">
                        <button className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-gray-200 transition-colors">
                            <SlidersHorizontal size={16} /> Filters
                        </button>
                        <div className="text-sm text-gray-500 flex items-center gap-2">
                            Sort by: <span className="font-semibold text-[#0f52ba] flex items-center gap-1 cursor-pointer">Last Login <ChevronDown size={14} /></span>
                        </div>
                    </div>
                </div>

                {/* Data Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-white border-b border-gray-100">
                                <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider">User</th>
                                <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider">Role</th>
                                <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                                <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider">Last Activity</th>
                                <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {userData.map((user) => (
                                <tr key={user.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                                    <td className="py-4 px-6">
                                        <div className="flex items-center gap-3">
                                            <img src={user.avatarUrl} alt={user.name} className="w-10 h-10 rounded-full border border-gray-200" />
                                            <div>
                                                <p className="font-bold text-gray-900 text-sm">{user.name}</p>
                                                <p className="text-gray-500 text-xs">{user.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-4 px-6">
                                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider ${user.role === 'MEDICAL LEAD' || user.role === 'EDITOR'
                                                ? 'bg-blue-50 text-blue-600'
                                                : 'bg-gray-100 text-gray-600'
                                            }`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td className="py-4 px-6">
                                        <div className="flex items-center gap-2">
                                            <span className={`w-2 h-2 rounded-full ${user.status === 'ACTIVE' ? 'bg-green-500' :
                                                    user.status === 'PENDING' ? 'bg-yellow-400' : 'bg-red-500'
                                                }`}></span>
                                            <span className={`text-xs font-bold ${user.status === 'ACTIVE' ? 'text-green-600' :
                                                    user.status === 'PENDING' ? 'text-yellow-600' : 'text-red-600'
                                                }`}>
                                                {user.status}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="py-4 px-6 text-sm text-gray-600">
                                        {user.lastActivity}
                                    </td>
                                    <td className="py-4 px-6">
                                        <div className="flex items-center justify-end gap-3 text-gray-400">
                                            <button className="hover:text-gray-700 transition-colors"><AlignLeft size={18} /></button>
                                            <button className="hover:text-gray-700 transition-colors"><RotateCcw size={18} /></button>
                                            {user.status === 'SUSPENDED' ? (
                                                <button className="hover:text-green-600 transition-colors text-green-500"><CheckCircle2 size={18} /></button>
                                            ) : (
                                                <button className="hover:text-red-600 transition-colors"><Ban size={18} /></button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-white">
                    <p className="text-sm text-gray-500 font-medium">Showing 1 to 10 of 12,482 users</p>
                    <div className="flex items-center gap-1.5">
                        <button className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors"><ChevronLeft size={16} /></button>
                        <button className="w-8 h-8 rounded-lg bg-[#0f52ba] text-white font-medium text-sm flex items-center justify-center">1</button>
                        <button className="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-600 font-medium text-sm flex items-center justify-center transition-colors">2</button>
                        <button className="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-600 font-medium text-sm flex items-center justify-center transition-colors">3</button>
                        <span className="w-8 h-8 flex items-center justify-center text-gray-400 text-sm">...</span>
                        <button className="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-600 font-medium text-sm flex items-center justify-center transition-colors">45</button>
                        <button className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors"><ChevronRight size={16} /></button>
                    </div>
                </div>
            </div>

            {/* Bottom Widgets Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Batch Operations */}
                <div className="bg-[#f4f6fc] rounded-2xl p-6 border border-blue-50">
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Batch Operations</h3>
                    <p className="text-sm text-gray-500 mb-6">Perform actions on multiple selected accounts at once. Use checkboxes in the table to select users.</p>
                    <div className="flex flex-wrap gap-3">
                        <button className="bg-white border border-[#0f52ba] text-[#0f52ba] px-4 py-2 rounded-full text-sm font-semibold hover:bg-blue-50 transition-colors shadow-sm">
                            Download Audit CSV
                        </button>
                        <button className="bg-white border border-red-500 text-red-600 px-4 py-2 rounded-full text-sm font-semibold hover:bg-red-50 transition-colors shadow-sm">
                            Mass Deactivate
                        </button>
                        <button className="bg-white border border-yellow-600 text-yellow-700 px-4 py-2 rounded-full text-sm font-semibold hover:bg-yellow-50 transition-colors shadow-sm">
                            Role Update
                        </button>
                    </div>
                </div>

                {/* Security Overview */}
                <div className="bg-[#fff9ed] rounded-2xl p-6 border border-yellow-100">
                    <h3 className="text-lg font-bold text-gray-900 mb-6">Security Overview</h3>

                    <div className="mb-6">
                        <div className="flex justify-between text-sm font-medium mb-2">
                            <span className="text-gray-700">MFA Adoption</span>
                            <span className="text-gray-900 font-bold">94.2%</span>
                        </div>
                        <div className="w-full bg-yellow-200/50 rounded-full h-2">
                            <div className="bg-yellow-500 h-2 rounded-full" style={{ width: '94.2%' }}></div>
                        </div>
                    </div>

                    <p className="text-sm text-gray-600 font-medium mb-3">
                        680 users haven't updated their passwords in 90+ days.
                    </p>
                    <button className="text-yellow-700 font-semibold text-sm flex items-center gap-1 hover:text-yellow-800 transition-colors">
                        Send Security Reminders <ArrowRight size={16} />
                    </button>
                </div>

            </div>
        </div>
    );
}