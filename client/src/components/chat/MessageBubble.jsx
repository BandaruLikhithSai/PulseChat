import { useState, useRef } from 'react';
import './MessageBubble.css';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

/**
 * MessageBubble — renders a single message with reactions, edit/delete menu.
 *
 * Props:
 *   message        — message object
 *   isOwn          — current user is the sender
 *   showAvatar     — show avatar (first in a consecutive group)
 *   showName       — show sender name (group chats)
 *   onEdit         — (messageId, currentText) => void
 *   onDelete       — (messageId) => void
 *   onReact        — (messageId, emoji) => void
 *   onReply        — (message) => void
 */
export default function MessageBubble({
  message, isOwn, showAvatar, showName,
  onEdit, onDelete, onReact, onReply,
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const menuRef = useRef(null);

  if (message.deleted) {
    return (
      <div className={`msg-row ${isOwn ? 'msg-row--own' : 'msg-row--other'}`}>
        {!isOwn && <div className="msg-avatar-slot" />}
        <div className="msg-content">
          <div className="msg-bubble msg-bubble--deleted">
            <span>This message was deleted</span>
          </div>
        </div>
      </div>
    );
  }

  const text = message.content?.text;
  const isPending = message._pending;

  // Group reactions by emoji
  const reactionGroups = groupReactions(message.reactions ?? []);

  return (
    <div
      className={`msg-row ${isOwn ? 'msg-row--own' : 'msg-row--other'}`}
      onMouseLeave={() => { setShowMenu(false); setShowEmojiPicker(false); }}
    >
      {!isOwn && (
        <div className="msg-avatar-slot">
          {showAvatar && (
            <div className="msg-avatar" title={message.sender?.displayName}>
              {message.sender?.avatar
                ? <img src={message.sender.avatar} alt={message.sender.displayName} />
                : <span>{getInitial(message.sender?.displayName || message.sender?.username)}</span>
              }
            </div>
          )}
        </div>
      )}

      <div className="msg-content">
        {showName && !isOwn && (
          <span className="msg-sender-name">
            {message.sender?.displayName || message.sender?.username}
          </span>
        )}

        {message.replyTo && !message.replyTo.deleted && (
          <div className="msg-reply-preview">
            <span className="msg-reply-preview__name">
              {message.replyTo.sender?.displayName || message.replyTo.sender?.username}
            </span>
            <span className="msg-reply-preview__text">
              {message.replyTo.content?.text?.slice(0, 80)}
            </span>
          </div>
        )}

        <div className="msg-bubble-wrapper">
          <div className={`msg-bubble ${isOwn ? 'msg-bubble--own' : 'msg-bubble--other'} ${isPending ? 'msg-bubble--pending' : ''}`}>
            {text && <p className="msg-text">{text}</p>}
            {message.content?.attachments?.length > 0 && (
              <div className="msg-attachments">
                {message.content.attachments.map((att, i) => (
                  <AttachmentPreview key={i} attachment={att} />
                ))}
              </div>
            )}
          </div>

          {/* Hover actions */}
          {!isPending && (
            <div className={`msg-actions ${isOwn ? 'msg-actions--own' : 'msg-actions--other'}`}>
              {/* Emoji reaction picker toggle */}
              <button
                className="msg-action-btn"
                title="React"
                aria-label="Add reaction"
                onClick={() => { setShowEmojiPicker((v) => !v); setShowMenu(false); }}
              >
                <EmojiIcon />
              </button>
              {/* Reply */}
              <button
                className="msg-action-btn"
                title="Reply"
                aria-label="Reply to message"
                onClick={() => onReply?.(message)}
              >
                <ReplyIcon />
              </button>
              {/* More (edit/delete) */}
              {isOwn && (
                <button
                  className="msg-action-btn"
                  title="More options"
                  aria-label="More options"
                  onClick={() => { setShowMenu((v) => !v); setShowEmojiPicker(false); }}
                >
                  <MoreIcon />
                </button>
              )}
            </div>
          )}

          {/* Emoji quick-picker */}
          {showEmojiPicker && (
            <div className={`emoji-picker ${isOwn ? 'emoji-picker--own' : ''}`} ref={menuRef}>
              {QUICK_EMOJIS.map((e) => (
                <button
                  key={e}
                  className="emoji-btn"
                  onClick={() => { onReact?.(message._id, e); setShowEmojiPicker(false); }}
                  title={e}
                >
                  {e}
                </button>
              ))}
            </div>
          )}

          {/* Edit / delete menu */}
          {showMenu && isOwn && (
            <div className={`msg-menu ${isOwn ? 'msg-menu--own' : ''}`} ref={menuRef}>
              <button
                className="msg-menu-item"
                onClick={() => { onEdit?.(message._id, message.content?.text ?? ''); setShowMenu(false); }}
              >
                ✏️ Edit
              </button>
              <button
                className="msg-menu-item msg-menu-item--danger"
                onClick={() => { onDelete?.(message._id); setShowMenu(false); }}
              >
                🗑️ Delete
              </button>
            </div>
          )}
        </div>

        {/* Reactions */}
        {reactionGroups.length > 0 && (
          <div className="msg-reactions">
            {reactionGroups.map(({ emoji, count, userIds }) => (
              <button
                key={emoji}
                className="msg-reaction"
                title={`${count} reaction${count > 1 ? 's' : ''}`}
                onClick={() => onReact?.(message._id, emoji)}
                aria-label={`React with ${emoji}: ${count}`}
              >
                {emoji} <span>{count}</span>
              </button>
            ))}
          </div>
        )}

        <div className="msg-meta">
          <time className="msg-time" dateTime={message.createdAt} title={formatDateTime(message.createdAt)}>
            {formatTime(message.createdAt)}
          </time>
          {message.edited && !message.deleted && (
            <span className="msg-edited" title={`Edited ${formatDateTime(message.editedAt)}`}>edited</span>
          )}
          {isOwn && (
            <span className="msg-status" aria-label={isPending ? 'Sending' : 'Sent'}>
              {isPending ? <ClockIcon /> : <CheckIcon />}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function groupReactions(reactions) {
  const map = new Map();
  for (const r of reactions) {
    const key = r.emoji;
    if (!map.has(key)) map.set(key, { emoji: key, count: 0, userIds: [] });
    const entry = map.get(key);
    entry.count++;
    entry.userIds.push(r.user?._id ?? r.user);
  }
  return [...map.values()];
}

function getInitial(name) { return name ? name[0].toUpperCase() : '?'; }
function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function formatDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString();
}

function CheckIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>;
}
function ClockIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
}
function EmojiIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>;
}
function ReplyIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>;
}
function MoreIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>;
}

function AttachmentPreview({ attachment }) {
  const { type, url, name, size } = attachment;

  if (type === 'image') {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="att-img-link">
        <img src={url} alt={name} className="att-img" loading="lazy" />
      </a>
    );
  }

  const icon = type === 'video' ? '🎬' : type === 'audio' ? '🎵' : '📄';
  const sizeLabel = size < 1024 * 1024
    ? `${(size / 1024).toFixed(1)} KB`
    : `${(size / (1024 * 1024)).toFixed(1)} MB`;

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="att-file">
      <span className="att-file__icon">{icon}</span>
      <div className="att-file__info">
        <span className="att-file__name">{name}</span>
        <span className="att-file__size">{sizeLabel}</span>
      </div>
      <span className="att-file__dl" aria-label="Download">↓</span>
    </a>
  );
}
