import { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { userApi } from '../services/api.js';
import Avatar from '../components/common/Avatar.jsx';
import './ProfilePage.css';

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({
    displayName: user?.displayName || '',
    username: user?.username || '',
    bio: user?.bio || '',
  });
  const [saveStatus, setSaveStatus] = useState(''); // '' | 'saving' | 'saved' | 'error'
  const [saveError, setSaveError] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const fileInputRef = useRef(null);

  const handleChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaveError('');
    setSaveStatus('saving');
    try {
      const res = await userApi.updateProfile(form);
      updateUser(res.data.user);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(''), 2500);
    } catch (err) {
      setSaveError(err.message || 'Failed to save changes.');
      setSaveStatus('error');
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError('');
    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const res = await userApi.uploadAvatar(formData);
      updateUser(res.data.user);
    } catch (err) {
      setAvatarError(err.message || 'Avatar upload failed.');
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="profile-page">
      <div className="profile-card">
        <h2 className="profile-card__title">Your profile</h2>

        {/* Avatar */}
        <div className="profile-avatar-section">
          <div className="profile-avatar-wrapper">
            <Avatar size={80} src={user?.avatar} name={user?.displayName || user?.username} />
            {avatarUploading && (
              <div className="profile-avatar-overlay" aria-label="Uploading…">
                <div className="app-loading__spinner" style={{ width: 24, height: 24 }} />
              </div>
            )}
          </div>
          <div className="profile-avatar-controls">
            <button className="btn btn--outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarUploading}>
              {avatarUploading ? 'Uploading…' : 'Change photo'}
            </button>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only" aria-label="Upload avatar" onChange={handleAvatarChange} />
            {avatarError && <p className="form-error">{avatarError}</p>}
            <p className="form-hint">JPEG, PNG, WebP or GIF · max 10 MB</p>
          </div>
        </div>

        {/* Profile form */}
        <form className="auth-form" onSubmit={handleSave} noValidate>
          {saveError && <p className="form-error form-error--banner" role="alert">{saveError}</p>}

          <div className="form-group">
            <label htmlFor="prof-displayName" className="form-label">Display name</label>
            <input id="prof-displayName" name="displayName" type="text" className="form-input"
              value={form.displayName} onChange={handleChange} maxLength={60} />
          </div>

          <div className="form-group">
            <label htmlFor="prof-username" className="form-label">Username</label>
            <input id="prof-username" name="username" type="text" className="form-input"
              value={form.username} onChange={handleChange}
              minLength={3} maxLength={30} autoComplete="username" />
            <span className="form-hint">@{form.username || '…'}</span>
          </div>

          <div className="form-group">
            <label htmlFor="prof-bio" className="form-label">Bio</label>
            <textarea id="prof-bio" name="bio" className="form-input form-textarea"
              rows={3} value={form.bio} onChange={handleChange}
              placeholder="Tell others a little about yourself…" maxLength={200} />
            <span className="form-hint">{form.bio.length}/200</span>
          </div>

          <div className="profile-form-footer">
            <button type="submit" className="btn btn--primary"
              disabled={saveStatus === 'saving'}>
              {saveStatus === 'saving' ? 'Saving…' : 'Save changes'}
            </button>
            {saveStatus === 'saved' && (
              <span className="profile-saved-msg" role="status">✓ Saved</span>
            )}
          </div>
        </form>

        {/* Account info */}
        <div className="profile-meta">
          <p className="text-sm text-muted">Email: {user?.email}</p>
          <p className="text-sm text-muted">Member since: {user?.createdAt
            ? new Date(user.createdAt).toLocaleDateString() : '—'}</p>
        </div>
      </div>
    </div>
  );
}
