import './App.css';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Test from './pages/Test';
import { createBrowserRouter, Outlet, RouterProvider } from "react-router-dom";
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
      { index: true, element: <Dashboard /> },
      { path: "test", element: <Test /> },
      { path: "health-centers", element: <HealthCenters /> },
      { path: "users", element: <UserManagement /> },
      { path: "announcements", element: <Announcements /> },
      { path: "sos", element: <SOSMap /> },
    ],
  },
  {
    path: "/login",
    element: <Login />,
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
