import './App.css';
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { LangProvider } from './context/LangContext';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';

import Login          from './pages/Login';
import Dashboard      from './pages/Dashboard';
import Announcements  from './pages/Announcements';
import HealthCenters  from './pages/HealthCenters';
import UserManagement from './pages/UserManagement';
import SOSMap         from './pages/SOSMap';
import AccessDenied   from './pages/Unauthorized';
import IDVerification from './pages/IDVerification';
import Analytics      from './pages/Analytics';
import DigitalID      from './pages/DigitalID';

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
        path: 'verification',
        element: (
          <ProtectedRoute allowedRoles={['super_admin']}>
            <IDVerification />
          </ProtectedRoute>
        ),
      },
      {
        // DigitalID is now the unified ID management page (tabs: ID Release + Digital IDs List)
        path: 'digital-id',
        element: (
          <ProtectedRoute allowedRoles={['sub_admin', 'super_admin']}>
            <DigitalID />
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
          <ProtectedRoute allowedRoles={['super_admin']}>
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
    ],
  },
]);

export default function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </LangProvider>
  );
}
