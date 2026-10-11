import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../../hooks/useNotifications.js';
import './NotificationBell.css';

/**
 * NotificationBell — header bell icon + dropdown panel.
 *
 * Shows unread badge, lists recent notifications, marks them read on open.
 */
export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const btnRef = useRef(null);

  const {
    notifications, unreadCount, loading,
    markRead, markAllRead, remove, requestBrowserPermission,
  } = useNotifications();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (!panelRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = () => {
    setOpen((v) => !v);
    if (!open && unreadCount > 0) markAllRead();
  };

  const handleClick = (notif) => {
    if (!notif.read) markRead(notif._id);
    if (notif.conversation?._id || notif.conversation) {
      navigate(`/chat/${notif.conversation?._id ?? notif.conversation}`);
    }
    setOpen(false);
  };

  return (
    <div className="notif-bell">
      <button
        ref={btnRef}
        className="icon-btn notif-bell__btn"
        onClick={handleOpen}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <BellIcon />
        {unreadCount > 0 && (
          <span className="notif-badge" aria-hidden="true">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div ref={panelRef} className="notif-panel" role="region" aria-label="Notifications">
          <div className="notif-panel__header">
            <span className="notif-panel__title">Notifications</span>
            <div className="notif-panel__actions">
              {unreadCount > 0 && (
                <button className="notif-text-btn" onClick={markAllRead}>
                  Mark all read
                </button>
              )}
              <button
                className="notif-text-btn"
                onClick={async () => {
                  const r = await requestBrowserPermission();
                  if (r === 'not-supported') alert('Browser notifications are not supported.');
                }}
                title="Enable browser notifications"
              >
                🔔
              </button>
            </div>
          </div>

          <div className="notif-panel__list">
            {loading && (
              <div className="notif-panel__empty">
                <div className="skeleton" style={{ width: '80%', height: 14, margin: '0 auto 8px' }} />
                <div className="skeleton" style={{ width: '60%', height: 12, margin: '0 auto' }} />
              </div>
            )}

            {!loading && notifications.length === 0 && (
              <div className="notif-panel__empty">
                <p>No notifications yet.</p>
              </div>
            )}

            {!loading && notifications.map((n) => (
              <NotifItem
                key={n._id}
                notif={n}
                onClick={() => handleClick(n)}
                onRemove={() => remove(n._id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NotifItem({ notif, onClick, onRemove }) {
  const time = notif.createdAt
    ? new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className={`notif-item ${notif.read ? '' : 'notif-item--unread'}`}>
      <button className="notif-item__body" onClick={onClick}>
        {notif.actor?.avatar ? (
          <img src={notif.actor.avatar} alt="" className="notif-item__avatar" />
        ) : (
          <div className="notif-item__avatar notif-item__avatar--initials">
            {(notif.actor?.displayName || notif.actor?.username || '?')[0].toUpperCase()}
          </div>
        )}
        <div className="notif-item__content">
          <p className="notif-item__preview">{notif.preview}</p>
          <span className="notif-item__time">{time}</span>
        </div>
        {!notif.read && <span className="notif-item__dot" aria-label="Unread" />}
      </button>
      <button
        className="notif-item__remove"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        aria-label="Dismiss notification"
      >
        ✕
      </button>
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
