import React from 'react';
import {
  LayoutDashboard, Map, Megaphone, Users,
  ShieldCheck, Building2, LogOut, Crown, User2, IdCard
} from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';

export default function Sidebar({ children }) {
  const location = useLocation();
  const { adminData, role, logout, isSuperAdmin } = useAuth();

  // Build nav items based on role
  const superAdminItems = [
    { name: 'Dashboard',       icon: LayoutDashboard, path: '/' },
    { name: 'ID Verification', icon: ShieldCheck,     path: '/verification' },
    { name: 'ID Release',      icon: IdCard,          path: '/id-release' },
    { name: 'User Management', icon: Users,           path: '/users' },
    { name: 'Analytics',       icon: LayoutDashboard, path: '/analytics' },
  ];

  const subAdminItems = [
    { name: 'Dashboard',     icon: LayoutDashboard, path: '/' },
    { name: 'Announcements', icon: Megaphone,        path: '/announcements' },
    { name: 'SOS Map',       icon: Map,              path: '/sos' },
    { name: 'Health Centers',icon: Building2,        path: '/health-centers' },
  ];

  const navItems = isSuperAdmin ? superAdminItems : subAdminItems;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-64 h-screen sticky top-0 bg-white border-r border-gray-100 flex flex-col px-4 py-6 font-sans">

        {/* Logo */}
        <div className="mb-8 px-2">
          <h1 className="text-xl font-bold text-gray-900">SCIA Admin</h1>
          <p className="text-sm text-gray-500 mt-0.5">Health Platform</p>
        </div>

        {/* Role badge */}
        <div className={`mx-2 mb-6 px-3 py-2.5 rounded-2xl flex items-center gap-2.5 ${
          isSuperAdmin
            ? 'bg-amber-50 border border-amber-200'
            : 'bg-blue-50 border border-blue-200'
        }`}>
          {isSuperAdmin
            ? <Crown size={15} className="text-amber-500 flex-shrink-0" />
            : <User2 size={15} className="text-blue-500 flex-shrink-0" />
          }
          <div className="min-w-0">
            <p className={`text-xs font-bold uppercase tracking-wider ${isSuperAdmin ? 'text-amber-600' : 'text-blue-600'}`}>
              {isSuperAdmin ? 'Super Admin' : 'Sub Admin'}
            </p>
            <p className="text-xs text-gray-500 truncate">{adminData?.name || adminData?.email || 'Admin'}</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors duration-150 ${
                  isActive
                    ? 'bg-[#0f52ba] text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon size={18} className={isActive ? 'text-white' : 'text-gray-400'} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="mt-auto pt-6 border-t border-gray-100 space-y-1">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 hover:text-red-600 rounded-xl transition-colors"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}