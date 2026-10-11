import { useNavigate } from 'react-router-dom';
import Avatar from '../common/Avatar.jsx';
import { usePresence } from '../../context/PresenceContext.jsx';
import './ConversationItem.css';

export default function ConversationItem({ conversation, currentUserId, isActive }) {
  const navigate = useNavigate();
  const { isOnline } = usePresence();

  const other = getOtherParticipant(conversation, currentUserId);

  const name =
    conversation.type === 'direct'
      ? other?.displayName || other?.username || 'Unknown'
      : conversation.name || 'Group chat';

  const avatar =
    conversation.type === 'direct' ? other?.avatar : conversation.avatar;

  const online =
    conversation.type === 'direct' ? isOnline(other?._id) : false;

  const lastMsg = conversation.lastMessage;
  const preview = getPreview(lastMsg, currentUserId);
  const timestamp = lastMsg?.createdAt
    ? formatTimestamp(lastMsg.createdAt)
    : formatTimestamp(conversation.createdAt);

  const unread = conversation.unreadCount ?? 0;

  return (
    <button
      className={`conv-item ${isActive ? 'conv-item--active' : ''}`}
      onClick={() => navigate(`/chat/${conversation._id}`)}
      aria-label={`Open conversation with ${name}${unread ? `, ${unread} unread` : ''}`}
      aria-current={isActive ? 'page' : undefined}
    >
      <Avatar
        size={46}
        src={avatar}
        name={name}
        showStatus
        status={online ? 'online' : 'offline'}
      />

      <div className="conv-item__body">
        <div className="conv-item__top">
          <span className={`conv-item__name ${unread > 0 ? 'conv-item__name--unread' : ''}`}>
            {name}
          </span>
          <span className={`conv-item__time ${unread > 0 ? 'conv-item__time--unread' : ''}`}>
            {timestamp}
          </span>
        </div>
        <div className="conv-item__bottom">
          <span className="conv-item__preview">{preview}</span>
          {unread > 0 && (
            <span className="conv-item__badge" aria-label={`${unread} unread`}>
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function getOtherParticipant(conversation, currentUserId) {
  return conversation?.participants?.find(
    (p) => (p.user?._id ?? p.user)?.toString() !== currentUserId?.toString()
  )?.user;
}

function getPreview(lastMsg, currentUserId) {
  if (!lastMsg) return 'No messages yet';
  if (lastMsg.deleted) return 'Message deleted';
  const isOwn = (lastMsg.sender?._id ?? lastMsg.sender)?.toString() === currentUserId?.toString();
  const prefix = isOwn ? 'You: ' : '';
  const text = lastMsg.content?.text;
  if (text) return prefix + (text.length > 55 ? text.slice(0, 55) + '…' : text);
  if (lastMsg.content?.attachments?.length) return prefix + '📎 Attachment';
  return '';
}

function formatTimestamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}
