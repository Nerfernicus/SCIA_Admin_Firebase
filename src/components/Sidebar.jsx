import React, { useState } from 'react';
import {
  LayoutDashboard, Map, Megaphone, Users,
  ShieldCheck, Building2, LogOut, Crown, User2, CreditCard,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Sidebar({ children }) {
  const location = useLocation();
  const { adminData, logout, isSuperAdmin } = useAuth();
  const [expanded, setExpanded] = useState(true);

  const superAdminItems = [
    { name: 'Dashboard',       icon: LayoutDashboard, path: '/' },
    { name: 'ID Verification', icon: ShieldCheck,     path: '/verification' },
    { name: 'ID Release',      icon: CreditCard,      path: '/id-release' },
    { name: 'User Management', icon: Users,           path: '/users' },
    { name: 'Analytics',       icon: LayoutDashboard, path: '/analytics' },
  ];

  const subAdminItems = [
    { name: 'Dashboard',      icon: LayoutDashboard, path: '/' },
    { name: 'Announcements',  icon: Megaphone,       path: '/announcements' },
    { name: 'SOS Map',        icon: Map,             path: '/sos' },
    { name: 'Health Centers', icon: Building2,       path: '/health-centers' },
  ];

  const navItems = isSuperAdmin ? superAdminItems : subAdminItems;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside
        style={{
          width: expanded ? '256px' : '68px',
          transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        className="h-screen sticky top-0 bg-white border-r border-gray-100 flex flex-col py-6 font-sans overflow-hidden flex-shrink-0"
      >
        {/* Header row: title + toggle button */}
        <div
          className="flex items-center mb-8"
          style={{
            padding: expanded ? '0 12px 0 16px' : '0 10px',
            justifyContent: expanded ? 'space-between' : 'center',
            transition: 'padding 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <div
            style={{
              opacity: expanded ? 1 : 0,
              maxWidth: expanded ? '160px' : '0px',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              transition: 'opacity 0.2s ease, max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            <h1 className="text-xl font-bold text-gray-900">SCIA Admin</h1>
            <p className="text-sm text-gray-500 mt-0.5">Health Platform</p>
          </div>

          <button
            onClick={() => setExpanded(!expanded)}
            title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors duration-150 flex-shrink-0"
          >
            {expanded
              ? <PanelLeftClose size={18} />
              : <PanelLeftOpen size={18} />
            }
          </button>
        </div>

        {/* Role badge */}
        <div
          style={{
            margin: expanded ? '0 8px 24px 8px' : '0 6px 24px 6px',
            padding: expanded ? '10px 12px' : '10px',
            justifyContent: expanded ? 'flex-start' : 'center',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
          className={`rounded-2xl flex items-center gap-2.5 ${
            isSuperAdmin ? 'bg-amber-50 border border-amber-200' : 'bg-blue-50 border border-blue-200'
          }`}
        >
          <div className="flex-shrink-0">
            {isSuperAdmin
              ? <Crown size={15} className="text-amber-500" />
              : <User2 size={15} className="text-blue-500" />
            }
          </div>
          <div
            style={{
              opacity: expanded ? 1 : 0,
              maxWidth: expanded ? '160px' : '0px',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              transition: 'opacity 0.15s ease, max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            className="min-w-0"
          >
            <p className={`text-xs font-bold uppercase tracking-wider ${isSuperAdmin ? 'text-amber-600' : 'text-blue-600'}`}>
              {isSuperAdmin ? 'Super Admin' : 'Sub Admin'}
            </p>
            <p className="text-xs text-gray-500 truncate">{adminData?.name || adminData?.email || 'Admin'}</p>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 space-y-0.5 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.name}
                to={item.path}
                title={!expanded ? item.name : undefined}
                style={{
                  padding: expanded ? '10px 16px' : '10px',
                  justifyContent: expanded ? 'flex-start' : 'center',
                  transition: 'padding 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                className={`w-full flex items-center gap-3 rounded-xl text-sm font-medium transition-colors duration-150 ${
                  isActive
                    ? 'bg-[#0f52ba] text-white shadow-sm'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon size={18} className={`flex-shrink-0 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                <span
                  style={{
                    opacity: expanded ? 1 : 0,
                    maxWidth: expanded ? '160px' : '0px',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    transition: 'opacity 0.15s ease, max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  {item.name}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Sign out */}
        <div className="mt-auto pt-6 border-t border-gray-100 px-2">
          <button
            onClick={logout}
            title={!expanded ? 'Sign Out' : undefined}
            style={{
              padding: expanded ? '10px 16px' : '10px',
              justifyContent: expanded ? 'flex-start' : 'center',
              transition: 'padding 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            className="w-full flex items-center gap-3 text-sm font-medium text-red-500 hover:bg-red-50 hover:text-red-600 rounded-xl transition-colors"
          >
            <LogOut size={18} className="flex-shrink-0" />
            <span
              style={{
                opacity: expanded ? 1 : 0,
                maxWidth: expanded ? '160px' : '0px',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                transition: 'opacity 0.15s ease, max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              Sign Out
            </span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
