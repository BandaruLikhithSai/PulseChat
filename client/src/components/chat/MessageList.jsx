import { useEffect, useRef, useCallback } from 'react';
import MessageBubble from './MessageBubble.jsx';
import './MessageList.css';

/**
 * MessageList — scrollable message container.
 *
 * - Auto-scrolls to bottom when new messages arrive (only if already at bottom).
 * - Triggers loadOlder when the user scrolls to the top.
 * - Groups consecutive messages from the same sender.
 * - Shows date dividers between messages on different days.
 */
export default function MessageList({
  messages,
  currentUserId,
  loading,
  loadingOlder,
  hasMore,
  error,
  typingUsers,
  onLoadOlder,
  showName = false,
  onEdit,
  onDelete,
  onReact,
  onReply,
}) {
  const listRef = useRef(null);
  const atBottomRef = useRef(true);
  const prevScrollHeightRef = useRef(0);

  // Track whether user is at the bottom
  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottomRef.current = distFromBottom < 80;

    // Load older messages when scrolled near the top
    if (el.scrollTop < 120 && hasMore && !loadingOlder) {
      prevScrollHeightRef.current = el.scrollHeight;
      onLoadOlder?.();
    }
  }, [hasMore, loadingOlder, onLoadOlder]);

  // After loading older messages, preserve scroll position
  useEffect(() => {
    if (!loadingOlder && prevScrollHeightRef.current && listRef.current) {
      const el = listRef.current;
      const newScrollHeight = el.scrollHeight;
      el.scrollTop = newScrollHeight - prevScrollHeightRef.current;
      prevScrollHeightRef.current = 0;
    }
  }, [loadingOlder, messages.length]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (atBottomRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  // Initial scroll to bottom
  useEffect(() => {
    if (!loading && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
      atBottomRef.current = true;
    }
  }, [loading]);

  if (loading) {
    return (
      <div className="message-list message-list--loading" aria-busy="true">
        <MessageListSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="message-list message-list--error">
        <p className="message-list__error-msg">{error}</p>
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="message-list"
      onScroll={handleScroll}
      role="log"
      aria-label="Messages"
      aria-live="polite"
    >
      {/* Load older button / spinner */}
      {hasMore && (
        <div className="message-list__load-older">
          {loadingOlder ? (
            <div className="message-list__spinner" aria-label="Loading older messages" />
          ) : (
            <button
              className="message-list__load-btn"
              onClick={onLoadOlder}
              aria-label="Load older messages"
            >
              Load older messages
            </button>
          )}
        </div>
      )}

      {/* Empty state */}
      {messages.length === 0 && !loading && (
        <div className="message-list__empty">
          <p>No messages yet. Say hello! 👋</p>
        </div>
      )}

      {/* Messages with date dividers */}
      {renderWithDividers(messages, currentUserId, showName, onEdit, onDelete, onReact, onReply)}

      {/* Typing indicator */}
      {typingUsers.size > 0 && <TypingIndicator count={typingUsers.size} />}
    </div>
  );
}

function renderWithDividers(messages, currentUserId, showName, onEdit, onDelete, onReact, onReply) {
  const items = [];
  let lastDate = null;
  let lastSenderId = null;

  messages.forEach((msg, idx) => {
    const msgDate = getDateLabel(msg.createdAt);

    if (msgDate !== lastDate) {
      items.push(
        <div key={`date-${msg._id}`} className="msg-date-divider" aria-label={msgDate}>
          {msgDate}
        </div>
      );
      lastDate = msgDate;
      lastSenderId = null; // Reset grouping after date divider
    }

    const isOwn = (msg.sender?._id ?? msg.sender) === currentUserId;
    const senderId = msg.sender?._id ?? msg.sender;
    const showAvatar = senderId !== lastSenderId;

    // Show sender name only in group chats
    const showSenderName = showName && !isOwn && showAvatar;

    items.push(
      <MessageBubble
        key={msg._id}
        message={msg}
        isOwn={isOwn}
        showAvatar={showAvatar}
        showName={showSenderName}
        onEdit={onEdit}
        onDelete={onDelete}
        onReact={onReact}
        onReply={onReply}
      />
    );

    lastSenderId = senderId;
  });

  return items;
}

function getDateLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(d, today)) return 'Today';
  if (isSameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function TypingIndicator({ count }) {
  return (
    <div className="msg-row msg-row--other" aria-live="polite" aria-label="Someone is typing">
      <div className="msg-avatar-slot" />
      <div className="typing-indicator">
        <span /><span /><span />
      </div>
    </div>
  );
}

function MessageListSkeleton() {
  return (
    <div className="message-skeleton">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className={`msg-row ${i % 3 === 0 ? 'msg-row--own' : 'msg-row--other'}`}>
          {i % 3 !== 0 && <div className="msg-avatar-slot"><div className="skeleton" style={{ width: 30, height: 30, borderRadius: '50%' }} /></div>}
          <div className="skeleton" style={{ width: `${30 + (i * 13) % 40}%`, height: 38, borderRadius: 16 }} />
        </div>
      ))}
    </div>
  );
}
