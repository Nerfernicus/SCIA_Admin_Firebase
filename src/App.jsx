import './App.css';
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { LangProvider } from './context/LangContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';

import Login          from './pages/Login';
import Dashboard      from './pages/Dashboard';
import Announcements  from './pages/Announcements';
import HealthCenters  from './pages/HealthCenters';
import UserManagement from './pages/UserManagement';
import SOSMap         from './pages/SOSMap';
import AccessDenied   from './pages/Unauthorized';
import IDManagement   from './pages/IDManagement';   // unified module
import Analytics      from './pages/Analytics';
import DigitalID      from './pages/DigitalID';
import EventCheckIn from './pages/EventCheckIn';
import AssistedKiosk from './pages/AssistedKiosk';
import AppDownload from './pages/AppDownload';
import AdminAccounts from './pages/AdminAccounts';
import SeniorRecords from './pages/SeniorRecords';
import IdDesigner from './pages/IdDesigner';


function Layout() {
  return (
    <Sidebar>
      <Outlet />
    </Sidebar>
  );
}

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/unauthorized', element: <AccessDenied /> },
  // Public on purpose: opened by the sidebar's Assisted Sign-up after the admin is logged out.
  // Access is controlled by the session token, not by a login.
  { path: '/assisted-kiosk', element: <AssistedKiosk /> },
  // Public download page for seniors (no login, outside the dashboard layout). Matching is not
  // case-sensitive, so /scia-app-download works too. Settings: src/lib/appDownload.js.
  { path: '/SCIA-APP-DOWNLOAD', element: <AppDownload /> },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Dashboard /> },
      {
        // Unified ID Management: Verification + Release in one page.
        // OSCA admin (super_admin) only: barangay sub-admins have no part in IDs.
        path: 'id-management',
        element: (
          <ProtectedRoute allowedRoles={['super_admin']}>
            <IDManagement />
          </ProtectedRoute>
        ),
      },
      {
        path: 'digital-id',
        element: (
          <ProtectedRoute allowedRoles={['super_admin']}>
            <DigitalID />
          </ProtectedRoute>
        ),
      },
      {
        // Drag-and-drop editor for the OSCA ID design. OSCA Super Admin only.
        path: 'id-designer',
        element: (
          <ProtectedRoute allowedRoles={['super_admin']}>
            <IdDesigner />
          </ProtectedRoute>
        ),
      },
      {
        path: 'users',
        element: (
          <ProtectedRoute allowedRoles={['super_admin']}>
            <UserManagement />
          </ProtectedRoute>
        ),
      },
     {
         path: 'analytics',
         element: (
           <ProtectedRoute allowedRoles={['sub_admin', 'super_admin']}>
              <Analytics />
          </ProtectedRoute>
                  ),
      },
      {
        path: 'announcements',
        element: (
          <ProtectedRoute allowedRoles={['sub_admin', 'super_admin']}>
            <Announcements />
          </ProtectedRoute>
        ),
      },
      {
        path: 'event-check-in',
        element: (
          <ProtectedRoute allowedRoles={['sub_admin', 'super_admin']}>
            <EventCheckIn />
          </ProtectedRoute>
        ),
      },
      {
        path: 'sos',
        element: (
          <ProtectedRoute allowedRoles={['sub_admin', 'super_admin']}>
            <SOSMap />
          </ProtectedRoute>
        ),
      },
      {
        path: 'health-centers',
        element: (
          <ProtectedRoute allowedRoles={['sub_admin', 'super_admin']}>
            <HealthCenters />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin-accounts',
        element: (
          <ProtectedRoute allowedRoles={['super_admin']}>
            <AdminAccounts />
          </ProtectedRoute>
        ),
      },
      {
        // Old in-dashboard page: the sidebar now opens the separate sign-up tab instead.
        path: 'assisted-signup',
        element: <Navigate to="/" replace />,
      },
      {
        // Local OSCA Valenzuela registry: verify, issue record number, print ID, scan to verify.
        path: 'senior-records',
        element: (
          <ProtectedRoute allowedRoles={['sub_admin', 'super_admin']}>
            <SeniorRecords />
          </ProtectedRoute>
        ),
      },
    ],
  },
]);

export default function App() {
  return (
    <ThemeProvider>
      <LangProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </LangProvider>
    </ThemeProvider>
  );
}
