import { Outlet, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useCall } from '../hooks/useCall.js';
import Sidebar from '../components/sidebar/Sidebar.jsx';
import Toast from '../components/notifications/Toast.jsx';
import CallScreen from '../components/call/CallScreen.jsx';
import './AppLayout.css';

/**
 * AppLayout — holds the call hook so incoming calls are received
 * regardless of which page is open. Passes the call object down via
 * the router Outlet context so ChatPage can access it.
 */
export default function AppLayout() {
  const { user, loading } = useAuth();
  const { conversationId } = useParams();
  // useCall lives here so it is ALWAYS mounted when the user is logged in.
  // This ensures call:incoming events are received even when the user is
  // not in a ChatPage.
  const call = useCall();

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading__spinner" aria-label="Loading…" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  const chatOpen = !!conversationId;

  return (
    <div className={`app-shell ${chatOpen ? 'chat-open' : ''}`}>
      <Sidebar />
      <main className="app-main">
        {/* Pass call down so ChatPage can use startCall + show call buttons */}
        <Outlet context={{ call }} />
      </main>
      <Toast />
      {/* CallScreen is always rendered here so incoming call UI appears everywhere */}
      <CallScreen call={call} />
    </div>
  );
}
