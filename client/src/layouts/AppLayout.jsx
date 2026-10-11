import { Outlet, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Sidebar from '../components/sidebar/Sidebar.jsx';
import Toast from '../components/notifications/Toast.jsx';
import './AppLayout.css';

export default function AppLayout() {
  const { user, loading } = useAuth();
  const { conversationId } = useParams();

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

  // On mobile: if a conversationId is in the URL, show chat panel and hide sidebar.
  // This is detected from the route params — no JS state toggling needed.
  const chatOpen = !!conversationId;

  return (
    <div className={`app-shell ${chatOpen ? 'chat-open' : ''}`}>
      <Sidebar />
      <main className="app-main">
        <Outlet />
      </main>
      <Toast />
    </div>
  );
}
