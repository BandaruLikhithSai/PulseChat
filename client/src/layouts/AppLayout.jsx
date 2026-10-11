import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Sidebar from '../components/sidebar/Sidebar.jsx';
import Toast from '../components/notifications/Toast.jsx';
import './AppLayout.css';

export default function AppLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading__spinner" aria-label="Loading…" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <Outlet />
      </main>
      {/* In-app toast notifications — shown above everything */}
      <Toast />
    </div>
  );
}
