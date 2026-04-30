import './App.css';
import { createBrowserRouter, Outlet, RouterProvider, Navigate } from 'react-router';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';

// Pages
import Login         from './pages/Login';
import Dashboard     from './pages/Dashboard';
import Announcements from './pages/Announcements';
import HealthCenters from './pages/HealthCenters';
import UserManagement from './pages/UserManagement';
import SOSMap        from './pages/SOSMap';
import Unauthorized  from './pages/Unauthorized';
// Placeholder stubs for super-admin-only pages (create real ones later)
import IDVerification from './pages/IDVerification';
import IDRelease      from './pages/IDRelease';
import Analytics      from './pages/Analytics';

function Layout() {
  return (
    <Sidebar>
      <Outlet />
    </Sidebar>
  );
}

// Redirect root → login when logged out, dashboard when logged in
function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={user ? '/' : '/login'} replace />;
}

const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/unauthorized',
    element: <Unauthorized />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      // ── Shared ──────────────────────────────────────────────────────
      { index: true, element: <Dashboard /> },

      // ── Super Admin only ─────────────────────────────────────────────
      {
        path: 'verification',
        element: (
          <ProtectedRoute allowedRoles={['super_admin']}>
            <IDVerification />
          </ProtectedRoute>
        ),
      },
      {
        path: 'id-release',
        element: (
          <ProtectedRoute allowedRoles={['super_admin']}>
            <IDRelease />
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

      // ── Sub Admin (+ Super Admin can also view) ──────────────────────
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
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}