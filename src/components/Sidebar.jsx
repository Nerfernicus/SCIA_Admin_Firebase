import React from 'react';
import {
  LayoutDashboard,
  Map,
  Megaphone,
  Users,
  ShieldCheck,
  Building2, // Imported the icon for Health Centers
  HelpCircle,
  LogOut
} from 'lucide-react';
import { Link, useLocation } from 'react-router';

const Sidebar = ({ children }) => {
  // Get the current route to handle active states automatically
  const location = useLocation();

  const navItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { name: 'SOS Map', icon: Map, path: '/sos' },
    { name: 'Announcements', icon: Megaphone, path: '/announcements' },
    { name: 'User Management', icon: Users, path: '/users' },
    { name: 'ID Verification', icon: ShieldCheck, path: '/verification' },
    { name: 'Health Centers', icon: Building2, path: '/health-centers' }, // Added new route
    { name: 'Test Route', icon: ShieldCheck, path: '/test' },
  ];

  return (
    <div className="flex min-h-screen bg-gray-50">

      {/* Sidebar fixed on the left */}
      <aside className="w-64 h-screen sticky top-0 bg-white border-r border-gray-100 flex flex-col px-4 py-6 font-sans">

        {/* Header / Logo Area */}
        <div className="mb-10 px-2">
          <h1 className="text-xl font-bold text-gray-900">Health Platform</h1>
          <p className="text-sm text-gray-500 mt-1">Admin Control</p>
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            // Check if the current URL matches this link's path
            const isActive = location.pathname === item.path;

            return (
              <Link
                key={item.name}
                to={item.path}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors duration-200 ${isActive
                    ? 'bg-[#0f52ba] text-white shadow-sm' // Active styling
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900' // Inactive styling
                  }`}
              >
                <Icon size={20} className={isActive ? 'text-white' : 'text-gray-400'} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Section */}
        <div className="mt-auto pt-8 border-t border-transparent space-y-4">
          <button className="w-full bg-[#0f52ba] hover:bg-blue-700 text-white py-3 rounded-xl text-sm font-medium transition-colors">
            Generate Report
          </button>

          <div className="space-y-1">
            <button className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 rounded-xl transition-colors">
              <HelpCircle size={20} className="text-gray-400" />
              Support
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 rounded-xl transition-colors">
              <LogOut size={20} className="text-gray-400" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area rendering the children (Outlet) */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>

    </div>
  );
};

export default Sidebar;