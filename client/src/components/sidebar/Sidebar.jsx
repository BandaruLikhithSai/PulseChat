import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { usePresence } from '../../context/PresenceContext.jsx';
import { userApi, conversationApi } from '../../services/api.js';
import { useConversations } from '../../hooks/useConversations.js';
import Avatar from '../common/Avatar.jsx';
import ConversationItem from './ConversationItem.jsx';
import NotificationBell from '../notifications/NotificationBell.jsx';
import './Sidebar.css';

const NAV_TABS = [
  { id: 'chats',    label: 'Chats',   Icon: ChatIcon },
  { id: 'contacts', label: 'People',  Icon: ContactsIcon },
];

export default function Sidebar() {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { isOnline } = usePresence();
  const navigate = useNavigate();
  const { conversationId: activeId } = useParams();
  const [activeTab, setActiveTab] = useState('chats');
  const [searchQuery, setSearchQuery] = useState('');
  const [showGroupModal, setShowGroupModal] = useState(false);
  const { conversations, loading: convsLoading, addOrUpdateConversation } = useConversations();

  const handleStartDirect = async (targetUserId) => {
    try {
      const res = await conversationApi.createDirect(targetUserId);
      addOrUpdateConversation(res.data.conversation);
      navigate(`/chat/${res.data.conversation._id}`);
      setActiveTab('chats');
      setSearchQuery('');
    } catch (err) {
      console.error('Failed to open conversation:', err.message);
    }
  };

  return (
    <aside className="sidebar" aria-label="Conversations">
      {/* Header */}
      <header className="sidebar__header">
        <div className="sidebar__brand">
          <span className="sidebar__brand-dot" aria-hidden="true" />
          <span className="sidebar__brand-name">PulseChat</span>
        </div>
        <div className="sidebar__header-actions">
          <NotificationBell />
          <button className="icon-btn" onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>
            {theme === 'light' ? <MoonIcon /> : <SunIcon />}
          </button>
          <button className="icon-btn" aria-label="New group chat" title="New group chat"
            onClick={() => setShowGroupModal(true)}>
            <GroupIcon />
          </button>
          <button className="icon-btn" aria-label="New direct message" title="New direct message"
            onClick={() => setActiveTab('contacts')}>
            <EditIcon />
          </button>
        </div>
      </header>

      {/* Profile strip */}
      <button className="sidebar__profile" onClick={() => navigate('/profile')}
        aria-label="Your profile">
        <Avatar size={36} src={user?.avatar} name={user?.displayName || user?.username}
          showStatus status="online" />
        <div className="sidebar__profile-info">
          <span className="sidebar__profile-name">{user?.displayName || user?.username}</span>
          <span className="sidebar__profile-status">
            <span className="status-dot status-dot--online" aria-hidden="true" />
            Online
          </span>
        </div>
        <button className="icon-btn sidebar__logout-btn"
          onClick={(e) => { e.stopPropagation(); logout(); }}
          aria-label="Sign out" title="Sign out">
          <LogoutIcon />
        </button>
      </button>

      {/* Search */}
      <div className="sidebar__search">
        <label htmlFor="sidebar-search" className="sr-only">Search conversations or people</label>
        <div className="search-input-wrapper">
          <SearchIcon className="search-input-icon" aria-hidden="true" />
          <input id="sidebar-search" type="search" className="search-input"
            placeholder="Search…" value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (e.target.value) setActiveTab('contacts');
            }}
            autoComplete="off" />
        </div>
      </div>

      {/* Nav tabs */}
      <nav className="sidebar__tabs" role="tablist" aria-label="Sections">
        {NAV_TABS.map(({ id, label, Icon }) => (
          <button key={id} role="tab" aria-selected={activeTab === id}
            className={`sidebar__tab ${activeTab === id ? 'sidebar__tab--active' : ''}`}
            onClick={() => setActiveTab(id)}>
            <Icon aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      {/* List */}
      <div className="sidebar__list" role="tabpanel">
        {activeTab === 'chats' && (
          <ConversationList
            conversations={conversations}
            loading={convsLoading}
            currentUserId={user?._id}
            activeId={activeId}
          />
        )}
        {activeTab === 'contacts' && (
          <PeopleSearch query={searchQuery} onStartChat={handleStartDirect} />
        )}
      </div>

      {/* Group creation modal */}
      {showGroupModal && (
        <CreateGroupModal
          onClose={() => setShowGroupModal(false)}
          onCreated={(conv) => {
            addOrUpdateConversation(conv);
            navigate(`/chat/${conv._id}`);
            setShowGroupModal(false);
          }}
        />
      )}
    </aside>
  );
}

// ── Conversation list ─────────────────────────────────────────────────────────
function ConversationList({ conversations, loading, currentUserId, activeId }) {
  if (loading) {
    return (
      <div style={{ padding: 'var(--space-2) 0' }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
            <div className="skeleton" style={{ width: 46, height: 46, borderRadius: '50%', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div className="skeleton" style={{ width: '60%', height: 13, marginBottom: 6 }} />
              <div className="skeleton" style={{ width: '80%', height: 11 }} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (!conversations.length) {
    return (
      <div className="sidebar__empty">
        <ChatIcon aria-hidden="true" />
        <p>No conversations yet.</p>
        <p className="text-sm text-muted">Search for people or create a group.</p>
      </div>
    );
  }
  return (
    <div>
      {conversations.map((conv) => (
        <ConversationItem
          key={conv._id}
          conversation={conv}
          currentUserId={currentUserId}
          isActive={conv._id === activeId}
        />
      ))}
    </div>
  );
}

// ── People search ─────────────────────────────────────────────────────────────
function PeopleSearch({ query, onStartChat }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query || query.length < 2) { setResults([]); return; }
    setLoading(true); setError('');
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await userApi.search(query);
        setResults(res.data.users);
      } catch { setError('Search failed.'); }
      finally { setLoading(false); }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  if (!query) return (
    <div className="sidebar__empty">
      <ContactsIcon aria-hidden="true" />
      <p>Search for people to start chatting.</p>
    </div>
  );
  if (loading) return (
    <div className="sidebar__search-results">
      {[1, 2, 3].map((i) => <UserRowSkeleton key={i} />)}
    </div>
  );
  if (error) return <div className="sidebar__empty"><p style={{ color: 'var(--error)', fontSize: 'var(--text-sm)' }}>{error}</p></div>;
  if (!results.length) return (
    <div className="sidebar__empty">
      <SearchIcon aria-hidden="true" />
      <p>No users found for "<strong>{query}</strong>"</p>
    </div>
  );
  return (
    <div className="sidebar__search-results">
      {results.map((u) => <UserRow key={u._id} user={u} onStartChat={onStartChat} />)}
    </div>
  );
}

function UserRow({ user, onStartChat }) {
  const { isOnline } = usePresence();
  const online = isOnline(user._id);
  return (
    <button className="user-row" aria-label={`Start chat with ${user.displayName || user.username}`}
      onClick={() => onStartChat?.(user._id)}>
      <Avatar size={40} src={user.avatar} name={user.displayName || user.username}
        showStatus status={online ? 'online' : 'offline'} />
      <div className="user-row__info">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span className="user-row__name">{user.displayName || user.username}</span>
          {online && <span className="user-row__online-dot" aria-label="Online" />}
        </div>
        <span className="user-row__username">@{user.username}</span>
      </div>
    </button>
  );
}

function UserRowSkeleton() {
  return (
    <div className="user-row user-row--skeleton">
      <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%' }} />
      <div className="user-row__info">
        <div className="skeleton" style={{ width: '60%', height: 14, marginBottom: 6 }} />
        <div className="skeleton" style={{ width: '40%', height: 12 }} />
      </div>
    </div>
  );
}

// ── Create group modal ────────────────────────────────────────────────────────
function CreateGroupModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef(null);
  const { user } = useAuth();

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!memberSearch || memberSearch.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await userApi.search(memberSearch);
        // Exclude already-selected members
        const selectedIds = new Set(selectedMembers.map((m) => m._id));
        setSearchResults(res.data.users.filter((u) => !selectedIds.has(u._id)));
      } catch { /* ignore */ }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [memberSearch, selectedMembers]);

  const addMember = (u) => {
    setSelectedMembers((prev) => [...prev, u]);
    setMemberSearch('');
    setSearchResults([]);
  };

  const removeMember = (id) =>
    setSelectedMembers((prev) => prev.filter((m) => m._id !== id));

  const handleCreate = async () => {
    if (!name.trim()) { setError('Group name is required.'); return; }
    if (selectedMembers.length < 1) { setError('Add at least one other member.'); return; }
    setError('');
    setCreating(true);
    try {
      const res = await conversationApi.createGroup({
        name: name.trim(),
        description: description.trim(),
        memberIds: selectedMembers.map((m) => m._id),
      });
      onCreated(res.data.conversation);
    } catch (err) {
      setError(err.message || 'Failed to create group.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Create group chat"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal__header">
          <h2 className="modal__title">New group chat</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal__body">
          {error && <p className="form-error form-error--banner" style={{ marginBottom: 'var(--space-3)' }}>{error}</p>}

          <div className="form-group">
            <label className="form-label" htmlFor="group-name">Group name *</label>
            <input id="group-name" type="text" className="form-input"
              placeholder="e.g. Project Team" maxLength={100}
              value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="group-desc">Description</label>
            <input id="group-desc" type="text" className="form-input"
              placeholder="What's this group about?" maxLength={200}
              value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="member-search">Add members</label>
            <input id="member-search" type="search" className="form-input"
              placeholder="Search by name or username…"
              value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)}
              autoComplete="off" />
          </div>

          {/* Search results dropdown */}
          {(searching || searchResults.length > 0) && (
            <div className="group-member-results">
              {searching && <p className="group-member-results__hint">Searching…</p>}
              {searchResults.map((u) => (
                <button key={u._id} className="user-row user-row--compact"
                  onClick={() => addMember(u)}>
                  <Avatar size={32} src={u.avatar} name={u.displayName || u.username} />
                  <div className="user-row__info">
                    <span className="user-row__name">{u.displayName || u.username}</span>
                    <span className="user-row__username">@{u.username}</span>
                  </div>
                  <span className="group-member-add-icon">+</span>
                </button>
              ))}
            </div>
          )}

          {/* Selected members */}
          {selectedMembers.length > 0 && (
            <div className="group-members-selected">
              <p className="group-members-selected__label">
                Members ({selectedMembers.length + 1} including you)
              </p>
              <div className="group-members-chips">
                {/* Show self first */}
                <div className="member-chip member-chip--self">
                  <Avatar size={24} src={user?.avatar} name={user?.displayName || user?.username} />
                  <span>{user?.displayName || user?.username}</span>
                  <span className="member-chip__role">admin</span>
                </div>
                {selectedMembers.map((m) => (
                  <div key={m._id} className="member-chip">
                    <Avatar size={24} src={m.avatar} name={m.displayName || m.username} />
                    <span>{m.displayName || m.username}</span>
                    <button className="member-chip__remove" onClick={() => removeMember(m._id)}
                      aria-label={`Remove ${m.displayName}`}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="modal__footer">
          <button className="btn btn--outline" onClick={onClose} disabled={creating}>Cancel</button>
          <button className="btn btn--primary" onClick={handleCreate} disabled={creating || !name.trim()}>
            {creating ? 'Creating…' : 'Create group'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Icons ───────────────────────────────────────────────────── */
function SearchIcon({ className }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function ContactsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function GroupIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}
function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
