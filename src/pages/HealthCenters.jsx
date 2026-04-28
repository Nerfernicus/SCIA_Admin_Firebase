import React from 'react';
import {
    Search, Bell, Settings, Plus, Building2,
    BriefcaseMedical, Package, ChevronDown, LayoutGrid,
    List, MapPin, MoreHorizontal, ChevronLeft, ChevronRight
} from 'lucide-react';

// Dummy data for the cards
const healthCenters = [
    {
        id: 1,
        name: 'Barangay San Antonio Health Center',
        location: 'Sector 4, Central District',
        status: 'OPEN',
        headOfficial: 'Dr. Elena Reyes',
        staffCount: '12+',
        staffColor: 'bg-blue-500',
        imgUrl: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80',
        avatarUrl: 'https://i.pravatar.cc/150?u=elena'
    },
    {
        id: 2,
        name: 'Barangay Sta. Lucia Wellness Hub',
        location: 'North Valley Corridor',
        status: 'CLOSED',
        headOfficial: 'Admin Manuel Santos',
        staffCount: '8+',
        staffColor: 'bg-yellow-400',
        imgUrl: 'https://images.unsplash.com/photo-1538108149393-cebb47acddb2?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80',
        avatarUrl: 'https://i.pravatar.cc/150?u=manuel'
    },
    {
        id: 3,
        name: 'San Isidro Community Clinic',
        location: 'South Riverside Area',
        status: 'OPEN',
        headOfficial: 'Dr. Victor Lim',
        staffCount: '15+',
        staffColor: 'bg-teal-500',
        imgUrl: 'https://images.unsplash.com/photo-1587351021759-3e566d6af7bf?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80',
        avatarUrl: 'https://i.pravatar.cc/150?u=victor'
    },
    {
        id: 4,
        name: 'Barangay Maligaya Health Post',
        location: 'East Ridge Development',
        status: 'OPEN',
        headOfficial: 'Nurse Maria Clara',
        staffCount: '5+',
        staffColor: 'bg-gray-400',
        imgUrl: 'https://images.unsplash.com/photo-1516549655169-df83a0774514?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80',
        avatarUrl: 'https://i.pravatar.cc/150?u=maria'
    }
];

export default function HealthCenters() {
    return (
        <div className="flex-1 bg-[#f8f9fa] min-h-screen p-8 font-sans">

            {/* Top Navigation Bar */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-6">
                    <span className="text-[#0f52ba] font-semibold">Editorial Health Admin</span>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search facilities..."
                            className="bg-white border-none rounded-full py-2 pl-10 pr-4 w-64 focus:ring-2 focus:ring-blue-100 outline-none text-sm shadow-sm"
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
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">Health Center Management</h1>
                    <p className="text-gray-500">Oversee community health infrastructure and resource allocation across regions.</p>
                </div>
                <button className="bg-[#0f52ba] hover:bg-blue-700 text-white px-5 py-2.5 rounded-full font-medium flex items-center gap-2 transition-colors shadow-sm">
                    <Plus size={18} />
                    Add New Center
                </button>
            </div>

            {/* KPI Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {/* Card 1 */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-50">
                    <div className="flex justify-between items-start mb-4">
                        <div className="bg-blue-50 p-3 rounded-xl text-blue-600">
                            <Building2 size={24} />
                        </div>
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Centers</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h2 className="text-4xl font-bold text-gray-900">142</h2>
                        <span className="text-sm font-medium text-[#0f52ba]">+3 this month</span>
                    </div>
                </div>

                {/* Card 2 */}
                <div className="bg-[#ffc107] rounded-3xl p-6 shadow-sm text-gray-900">
                    <div className="flex justify-between items-start mb-4">
                        <div className="bg-yellow-500/30 p-3 rounded-xl text-yellow-900">
                            <BriefcaseMedical size={24} />
                        </div>
                        <span className="text-xs font-bold text-yellow-900/70 uppercase tracking-wider">Active Staff</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h2 className="text-4xl font-bold">1,208</h2>
                        <span className="text-sm font-medium text-yellow-900/80">On-duty</span>
                    </div>
                </div>

                {/* Card 3 */}
                <div className="bg-[#0f52ba] rounded-3xl p-6 shadow-sm text-white">
                    <div className="flex justify-between items-start mb-4">
                        <div className="bg-white/20 p-3 rounded-xl text-white">
                            <Package size={24} />
                        </div>
                        <span className="text-xs font-bold text-blue-100 uppercase tracking-wider">Resources Distributed</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h2 className="text-4xl font-bold">85%</h2>
                        <span className="text-sm font-medium text-blue-100">Monthly Target</span>
                    </div>
                </div>
            </div>

            {/* Filters and Controls */}
            <div className="flex justify-between items-center mb-6">
                <div className="flex gap-3">
                    <button className="bg-white border border-gray-200 px-4 py-2 rounded-full text-sm font-medium text-gray-700 flex items-center gap-2 hover:bg-gray-50 shadow-sm">
                        <List size={16} className="text-gray-400" /> All Regions <ChevronDown size={16} className="text-gray-400" />
                    </button>
                    <button className="bg-white border border-gray-200 px-4 py-2 rounded-full text-sm font-medium text-gray-700 flex items-center gap-2 hover:bg-gray-50 shadow-sm">
                        Status: Active <ChevronDown size={16} className="text-gray-400" />
                    </button>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-1 flex gap-1 shadow-sm">
                    <button className="p-2 bg-blue-50 text-[#0f52ba] rounded-lg"><LayoutGrid size={18} /></button>
                    <button className="p-2 text-gray-400 hover:text-gray-700 rounded-lg"><List size={18} /></button>
                </div>
            </div>

            {/* Health Centers Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
                {healthCenters.map((center) => (
                    <div key={center.id} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-50 flex flex-col sm:flex-row gap-5">
                        {/* Image with Badge */}
                        <div className="relative w-full sm:w-40 h-40 flex-shrink-0 rounded-2xl overflow-hidden bg-gray-100">
                            <img src={center.imgUrl} alt={center.name} className="w-full h-full object-cover" />
                            <div className={`absolute top-3 left-3 px-2 py-1 rounded text-xs font-bold shadow-sm ${center.status === 'OPEN' ? 'bg-white text-[#0f52ba]' : 'bg-white text-red-600'
                                }`}>
                                <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${center.status === 'OPEN' ? 'bg-[#0f52ba]' : 'bg-red-600'}`}></span>
                                {center.status}
                            </div>
                        </div>

                        {/* Content Info */}
                        <div className="flex-1 flex flex-col justify-between py-1">
                            <div>
                                <div className="flex justify-between items-start">
                                    <h3 className="font-bold text-gray-900 text-lg leading-tight pr-4">{center.name}</h3>
                                    <button className="text-gray-400 hover:text-gray-600"><MoreHorizontal size={20} /></button>
                                </div>
                                <p className="text-gray-500 text-sm flex items-center gap-1 mt-1.5">
                                    <MapPin size={14} /> {center.location}
                                </p>
                            </div>

                            {/* Bottom Row: Official & Staff Count */}
                            <div className="flex items-center justify-between mt-4">
                                <div className="flex items-center gap-3">
                                    <img src={center.avatarUrl} alt={center.headOfficial} className="w-9 h-9 rounded-full border border-gray-200" />
                                    <div>
                                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Head Official</p>
                                        <p className="text-sm font-medium text-gray-900">{center.headOfficial}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-100">
                                    <span className="text-xs font-bold text-gray-600">{center.staffCount}</span>
                                    <div className={`w-3.5 h-3.5 rounded-full ${center.staffColor} shadow-inner`}></div>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-gray-200 pt-6">
                <p className="text-sm text-gray-500 font-medium">Showing 1-4 of 142 health centers</p>
                <div className="flex items-center gap-2">
                    <button className="p-2 rounded-lg hover:bg-gray-200 text-gray-500 bg-gray-100 transition-colors"><ChevronLeft size={16} /></button>
                    <button className="w-8 h-8 rounded-lg bg-[#0f52ba] text-white font-medium text-sm flex items-center justify-center">1</button>
                    <button className="w-8 h-8 rounded-lg hover:bg-gray-200 text-gray-600 font-medium text-sm flex items-center justify-center transition-colors">2</button>
                    <button className="w-8 h-8 rounded-lg hover:bg-gray-200 text-gray-600 font-medium text-sm flex items-center justify-center transition-colors">3</button>
                    <button className="p-2 rounded-lg hover:bg-gray-200 text-gray-500 bg-gray-100 transition-colors"><ChevronRight size={16} /></button>
                </div>
            </div>

        </div>
    );
}