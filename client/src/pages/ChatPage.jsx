import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { conversationApi } from '../services/api.js';
import { useMessages } from '../hooks/useMessages.js';
import ChatHeader from '../components/chat/ChatHeader.jsx';
import MessageList from '../components/chat/MessageList.jsx';
import MessageComposer from '../components/chat/MessageComposer.jsx';
import './ChatPage.css';

export default function ChatPage() {
  const { conversationId } = useParams();
  // call comes from AppLayout via Outlet context — it lives there permanently
  // so incoming calls work even when not in a chat.
  const { call } = useOutletContext() ?? {};

  if (!conversationId) return <WelcomeScreen />;
  return <ConversationView conversationId={conversationId} call={call} />;
}

// ── Active conversation view ──────────────────────────────────────────────────
function ConversationView({ conversationId, call }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [conversation, setConversation] = useState(null);
  const [convError, setConvError] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null); // { id, text }
  const [deleteConfirm, setDeleteConfirm] = useState(null); // messageId

  const {
    messages, loading, loadingOlder, hasMore,
    error: msgError, typingUsers,
    sendMessage, editMessage, deleteMessage, reactToMessage, sendFiles,
    loadOlder, sendTypingStart, sendTypingStop, markRead,
  } = useMessages(conversationId);

  useEffect(() => {
    setConversation(null);
    setConvError('');
    conversationApi.getById(conversationId)
      .then((res) => setConversation(res.data.conversation))
      .catch((err) => setConvError(
        (err.statusCode === 403 || err.statusCode === 404)
          ? (err.message || 'Conversation not found.')
          : 'Failed to load conversation.'
      ));
  }, [conversationId]);

  useEffect(() => {
    if (!loading && messages.length > 0) markRead();
  }, [conversationId, loading, messages.length, markRead]);

  const handleSend = useCallback(async (text) => {
    if (editingMsg) {
      await editMessage(editingMsg.id, text);
      setEditingMsg(null);
    } else {
      await sendMessage(text, replyTo?._id ?? null);
      setReplyTo(null);
    }
  }, [editingMsg, editMessage, sendMessage, replyTo]);

  const handleEdit = useCallback((messageId, currentText) => {
    setEditingMsg({ id: messageId, text: currentText });
    setReplyTo(null);
  }, []);

  const handleDelete = useCallback((messageId) => {
    setDeleteConfirm(messageId);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (deleteConfirm) {
      await deleteMessage(deleteConfirm);
      setDeleteConfirm(null);
    }
  }, [deleteConfirm, deleteMessage]);

  if (convError) {
    return (
      <div className="chat-page chat-page--error">
        <p className="chat-error-msg">{convError}</p>
        <button className="btn btn--outline" onClick={() => navigate('/')}>
          Back to conversations
        </button>
      </div>
    );
  }

  const isGroup = conversation?.type === 'group';

  return (
    <div className="chat-page">
      <ChatHeader
        conversation={conversation}
        currentUserId={user?._id}
        onBack={() => navigate('/')}
        call={call}
      />

      <MessageList
        messages={messages}
        currentUserId={user?._id}
        loading={loading}
        loadingOlder={loadingOlder}
        hasMore={hasMore}
        error={msgError}
        typingUsers={typingUsers}
        onLoadOlder={loadOlder}
        showName={isGroup}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onReact={reactToMessage}
        onReply={(msg) => { setReplyTo(msg); setEditingMsg(null); }}
      />

      {/* Reply / edit context bar */}
      {(replyTo || editingMsg) && (
        <div className="chat-context-bar">
          {replyTo && (
            <>
              <span className="chat-context-bar__label">Replying to</span>
              <span className="chat-context-bar__preview">
                {replyTo.sender?.displayName}: {replyTo.content?.text?.slice(0, 60)}
              </span>
            </>
          )}
          {editingMsg && (
            <>
              <span className="chat-context-bar__label">Editing</span>
              <span className="chat-context-bar__preview">{editingMsg.text?.slice(0, 60)}</span>
            </>
          )}
          <button className="chat-context-bar__cancel" onClick={() => { setReplyTo(null); setEditingMsg(null); }} aria-label="Cancel">✕</button>
        </div>
      )}

      <MessageComposer
        onSend={handleSend}
        onSendFiles={sendFiles}
        onTypingStart={sendTypingStart}
        onTypingStop={sendTypingStop}
        disabled={!!convError}
        initialText={editingMsg?.text ?? ''}
        placeholder={editingMsg ? 'Edit message…' : 'Type a message…'}
      />

      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <div className="dialog-overlay" role="dialog" aria-modal="true" aria-label="Confirm delete">
          <div className="dialog">
            <h3 className="dialog__title">Delete message?</h3>
            <p className="dialog__body">This action cannot be undone.</p>
            <div className="dialog__actions">
              <button className="btn btn--outline" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn--danger" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Welcome screen ────────────────────────────────────────────────────────────
function WelcomeScreen() {
  return (
    <div className="chat-welcome">
      <div className="chat-welcome__content">
        <div className="chat-welcome__icon" aria-hidden="true">
          <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="64" height="64" rx="16" fill="var(--accent-100)" />
            <path d="M16 20h32v20a4 4 0 01-4 4H20a4 4 0 01-4-4V20z" fill="var(--accent-500)" fillOpacity="0.9"/>
            <circle cx="24" cy="30" r="3" fill="white"/>
            <circle cx="32" cy="30" r="3" fill="white"/>
            <circle cx="40" cy="30" r="3" fill="white"/>
          </svg>
        </div>
        <h2 className="chat-welcome__title">Welcome to PulseChat</h2>
        <p className="chat-welcome__body">Select a conversation or start a new one.</p>
        <div className="chat-welcome__features">
          <FeaturePill icon="💬" text="Real-time messaging" />
          <FeaturePill icon="👥" text="Group chats" />
          <FeaturePill icon="📎" text="File sharing" />
          <FeaturePill icon="📞" text="Voice &amp; video calls" />
        </div>
      </div>
    </div>
  );
}

function FeaturePill({ icon, text }) {
  return (
    <span className="feature-pill">
      <span aria-hidden="true">{icon}</span>
      {text}
    </span>
  );
}
