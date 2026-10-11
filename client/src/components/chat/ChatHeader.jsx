import { useNavigate } from 'react-router-dom';
import Avatar from '../common/Avatar.jsx';
import { usePresence } from '../../context/PresenceContext.jsx';
import './ChatHeader.css';

export default function ChatHeader({ conversation, currentUserId, onBack, call }) {
  const navigate = useNavigate();
  const { isOnline } = usePresence();

  if (!conversation) {
    return (
      <div className="chat-header">
        <div className="chat-header__skeleton">
          <div className="skeleton" style={{ width: 38, height: 38, borderRadius: '50%' }} />
          <div>
            <div className="skeleton" style={{ width: 120, height: 14, marginBottom: 6 }} />
            <div className="skeleton" style={{ width: 80, height: 11 }} />
          </div>
        </div>
      </div>
    );
  }

  const other = getOtherParticipant(conversation, currentUserId);
  const isDirect = conversation.type === 'direct';

  const title = isDirect
    ? other?.displayName || other?.username || 'Unknown'
    : conversation.name || 'Group chat';

  const online = isDirect ? isOnline(other?._id) : false;
  const activeMembers = conversation.participants?.filter((p) => !p.leftAt) ?? [];
  const onlineGroupCount = isDirect
    ? null
    : activeMembers.filter((p) => isOnline(p.user?._id ?? p.user)).length;

  const subtitle = isDirect
    ? online
      ? 'Online'
      : other?.lastSeen
        ? `Last seen ${formatLastSeen(other.lastSeen)}`
        : 'Offline'
    : onlineGroupCount > 0
      ? `${activeMembers.length} members · ${onlineGroupCount} online`
      : `${activeMembers.length} members`;

  const callActive = call && call.callState !== 'idle';

  return (
    <div className="chat-header">
      <button className="chat-header__back icon-btn" onClick={onBack} aria-label="Back to conversations">
        <BackIcon />
      </button>

      <button
        className="chat-header__identity"
        onClick={() => isDirect && navigate(`/profile/${other?._id ?? ''}`)}
        aria-label={isDirect ? `View profile of ${title}` : title}
        style={!isDirect ? { cursor: 'default' } : undefined}
      >
        <Avatar
          size={38}
          src={isDirect ? other?.avatar : conversation.avatar}
          name={title}
          showStatus={isDirect}
          status={online ? 'online' : 'offline'}
        />
        <div className="chat-header__info">
          <span className="chat-header__name">{title}</span>
          <span className={`chat-header__subtitle ${online ? 'chat-header__subtitle--online' : ''}`}>
            {subtitle}
          </span>
        </div>
      </button>

      <div className="chat-header__actions">
        {isDirect && call && (
          <>
            <button
              className="icon-btn"
              title="Voice call"
              aria-label="Start voice call"
              disabled={callActive}
              onClick={() => call.startCall(conversation._id, other?._id, 'audio', title)}
            >
              <PhoneCallIcon />
            </button>
            <button
              className="icon-btn"
              title="Video call"
              aria-label="Start video call"
              disabled={callActive}
              onClick={() => call.startCall(conversation._id, other?._id, 'video', title)}
            >
              <VideoCallIcon />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function getOtherParticipant(conversation, currentUserId) {
  return conversation?.participants?.find(
    (p) => (p.user?._id ?? p.user)?.toString() !== currentUserId?.toString()
  )?.user;
}

function formatLastSeen(date) {
  const d = new Date(date);
  const diffMins = Math.floor((Date.now() - d) / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleDateString();
}

function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function PhoneCallIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l1.27-.94a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  );
}

function VideoCallIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7"/>
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
    </svg>
  );
}
