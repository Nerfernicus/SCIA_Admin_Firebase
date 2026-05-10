import React, { useState } from 'react';
import {
  LayoutDashboard, Map, Megaphone, Users,
  ShieldCheck, Building2, LogOut, Crown, User2, CreditCard,
  PanelLeftClose, PanelLeftOpen, FileText, Contact,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import GenerateReportModal from './GenerateReportModal';
import Header from './Header';

export default function Sidebar({ children }) {
  const location = useLocation();
  const { adminData, logout, isSuperAdmin } = useAuth();
  const { t } = useLang();
  const [expanded, setExpanded] = useState(true);
  const [reportOpen, setReportOpen] = useState(false);

  const superAdminItems = [
    { key: 'dashboard',      icon: LayoutDashboard, path: '/' },
    { key: 'idVerification', icon: ShieldCheck,     path: '/verification' },
    { key: 'idRelease',      icon: CreditCard,      path: '/id-release' },
    { key: 'digitalId',      icon: Contact,         path: '/digital-id' },
    { key: 'userManagement', icon: Users,           path: '/users' },
    { key: 'analytics',      icon: LayoutDashboard, path: '/analytics' },
    { key: 'announcements',  icon: Megaphone,       path: '/announcements' },
  ];

  const subAdminItems = [
    { key: 'dashboard',     icon: LayoutDashboard, path: '/' },
    { key: 'digitalId',     icon: Contact,         path: '/digital-id' },
    { key: 'announcements', icon: Megaphone,       path: '/announcements' },
    { key: 'sosMap',        icon: Map,             path: '/sos' },
    { key: 'healthCenters', icon: Building2,       path: '/health-centers' },
  ];

  const navItems = isSuperAdmin ? superAdminItems : subAdminItems;

  const labelStyle = (show) => ({
    opacity: show ? 1 : 0,
    maxWidth: show ? '160px' : '0px',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    transition: 'opacity 0.15s ease, max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  });

  const platformLabel = isSuperAdmin ? t.oscaPlatform : t.barangayPlatform;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside
        style={{ width: expanded ? '256px' : '68px', transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}
        className="h-screen sticky top-0 bg-white border-r border-gray-100 flex flex-col py-6 font-sans overflow-hidden shrink-0"
      >
        {/* Logo row */}
        <div
          className="flex items-center mb-8"
          style={{
            padding: expanded ? '0 12px 0 16px' : '0 10px',
            justifyContent: expanded ? 'space-between' : 'center',
            transition: 'padding 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          <div style={labelStyle(expanded)}>
            <h1 className="text-xl font-bold text-gray-900">SCIA Admin</h1>
            <p className="text-sm text-gray-500 mt-0.5">{platformLabel}</p>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            title={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors duration-150 shrink-0"
          >
            {expanded ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
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
          <div className="shrink-0">
            {isSuperAdmin ? <Crown size={15} className="text-amber-500" /> : <User2 size={15} className="text-blue-500" />}
          </div>
          <div style={labelStyle(expanded)} className="min-w-0">
            <p className={`text-xs font-bold uppercase tracking-wider ${isSuperAdmin ? 'text-amber-600' : 'text-blue-600'}`}>
              {isSuperAdmin ? t.superAdmin : t.subAdmin}
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
                key={item.key}
                to={item.path}
                title={!expanded ? t[item.key] : undefined}
                style={{
                  padding: expanded ? '10px 16px' : '10px',
                  justifyContent: expanded ? 'flex-start' : 'center',
                  transition: 'padding 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                className={`w-full flex items-center gap-3 rounded-xl text-sm font-medium transition-colors duration-150 ${
                  isActive ? 'bg-[#0f52ba] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon size={18} className={`shrink-0 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                <span style={labelStyle(expanded)}>{t[item.key] || item.key}</span>
              </Link>
            );
          })}
        </nav>

        {/* Generate Report — both roles */}
        <div className="px-2 mt-3">
          <button
            onClick={() => setReportOpen(true)}
            title={!expanded ? t.generateReport : undefined}
            style={{
              padding: expanded ? '10px 16px' : '10px',
              justifyContent: expanded ? 'flex-start' : 'center',
              transition: 'padding 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              background: 'linear-gradient(135deg, #0f52ba 0%, #1a6fd4 100%)',
            }}
            className="w-full flex items-center gap-3 rounded-xl text-sm font-semibold text-white shadow-md shadow-blue-500/25 hover:shadow-blue-500/40 hover:brightness-110 transition-all duration-150"
          >
            <FileText size={18} className="shrink-0 text-white/90" />
            <span style={labelStyle(expanded)}>{t.generateReport}</span>
          </button>
        </div>

        {/* Sign out */}
        <div className="mt-4 pt-4 border-t border-gray-100 px-2">
          <button
            onClick={logout}
            title={!expanded ? t.signOut : undefined}
            style={{
              padding: expanded ? '10px 16px' : '10px',
              justifyContent: expanded ? 'flex-start' : 'center',
              transition: 'padding 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            className="w-full flex items-center gap-3 text-sm font-medium text-red-500 hover:bg-red-50 hover:text-red-600 rounded-xl transition-colors"
          >
            <LogOut size={18} className="shrink-0" />
            <span style={labelStyle(expanded)}>{t.signOut}</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto flex flex-col">
        <Header />
        <div className="flex-1">{children}</div>
      </main>

      <GenerateReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
}