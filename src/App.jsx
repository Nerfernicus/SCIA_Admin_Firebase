import { useEffect } from 'react';

import './App.css';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Test from './pages/Test';
import { createBrowserRouter, Outlet, RouterProvider } from "react-router";
import { client } from './lib/firebase';
import Sidebar from './components/Sidebar';
import HealthCenters from './pages/HealthCenters';
import UserManagement from './pages/UserManagement';
import Announcements from './pages/Announcements';
import SOSMap from './pages/SOSMap';
function Layout() {
  return (
    <Sidebar>
      <Outlet />
    </Sidebar>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      {
        path: "/",
        element: <Dashboard />,
      },
      {
        path: "/test",
        element: <Test />
      },
      {
        path: "/health-centers", // <--- Add this route
        element: <HealthCenters />,
      }, {
        path: "/users",
        element: <UserManagement />,
      }, {
        path: "/announcements",
        element: <Announcements />,
      },
      {
        path: "/sos",
        element: <SOSMap />,
      },
    ],
  },
  {
    path: "/login",
    element: <Login />,
  },
]);

function App() {
  useEffect(() => {
    // Ping Appwrite backend to verify setup
    client.ping();
  }, []);

  return (
    <RouterProvider router={router} />
  );
}

export default App;