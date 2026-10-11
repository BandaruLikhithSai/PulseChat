import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../../context/SocketContext.jsx';
import './Toast.css';

/**
 * Toast — shows a brief popup for incoming messages when the user is
 * not currently viewing that conversation.
 * 
 * Listens for notification:new and auto-dismisses after 4s.
 */
export default function Toast() {
  const { getSocket } = useSocket();
  const navigate = useNavigate();
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handle = ({ notification }) => {
      const id = notification._id || Date.now();
      setToasts((prev) => [...prev.slice(-2), { ...notification, id }]); // max 3

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    };

    socket.on('notification:new', handle);
    return () => socket.off('notification:new', handle);
  }, [getSocket]);

  if (!toasts.length) return null;

  return (
    <div className="toast-stack" aria-live="polite" aria-label="Notifications">
      {toasts.map((t) => (
        <button
          key={t.id}
          className="toast"
          onClick={() => {
            if (t.conversation?._id || t.conversation) {
              navigate(`/chat/${t.conversation?._id ?? t.conversation}`);
            }
            setToasts((prev) => prev.filter((x) => x.id !== t.id));
          }}
        >
          <div className="toast__dot" aria-hidden="true" />
          <div className="toast__content">
            <p className="toast__preview">{t.preview}</p>
          </div>
          <button
            className="toast__close"
            onClick={(e) => { e.stopPropagation(); setToasts((p) => p.filter((x) => x.id !== t.id)); }}
            aria-label="Dismiss"
          >✕</button>
        </button>
      ))}
    </div>
  );
}
