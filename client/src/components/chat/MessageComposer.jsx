import { useState, useRef, useCallback, useEffect } from 'react';
import './MessageComposer.css';

const MAX_LENGTH = 4000;
const MAX_FILES  = 5;
const MAX_FILE_MB = 25;

export default function MessageComposer({
  onSend,
  onSendFiles,     // (files, caption) => Promise
  onTypingStart,
  onTypingStop,
  disabled = false,
  initialText = '',
  placeholder = 'Type a message…',
}) {
  const [text, setText] = useState(initialText);
  const [sending, setSending] = useState(false);
  const [files, setFiles] = useState([]);       // File objects staged for upload
  const [uploadProgress, setUploadProgress] = useState(null); // 0-100 or null
  const [fileError, setFileError] = useState('');
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingRef = useRef(false);
  const typingStopTimer = useRef(null);

  // Sync initialText when editing
  useEffect(() => {
    setText(initialText);
    if (initialText) {
      setTimeout(() => {
        const ta = textareaRef.current;
        if (ta) { ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length; }
      }, 50);
    }
  }, [initialText]);

  // Auto-resize textarea
  const resize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 22 * 6 + 24)}px`;
  }, []);
  useEffect(() => { resize(); }, [text, resize]);

  const handleChange = (e) => {
    const val = e.target.value;
    if (val.length > MAX_LENGTH) return;
    setText(val);
    if (val.trim() && !typingRef.current) { typingRef.current = true; onTypingStart?.(); }
    clearTimeout(typingStopTimer.current);
    typingStopTimer.current = setTimeout(() => {
      if (typingRef.current) { typingRef.current = false; onTypingStop?.(); }
    }, 2000);
  };

  const stopTyping = useCallback(() => {
    clearTimeout(typingStopTimer.current);
    if (typingRef.current) { typingRef.current = false; onTypingStop?.(); }
  }, [onTypingStop]);

  // ── File selection ────────────────────────────────────────────────────────
  const handleFileChange = (e) => {
    setFileError('');
    const selected = Array.from(e.target.files ?? []);
    if (!selected.length) return;

    const invalid = selected.filter((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (invalid.length) {
      setFileError(`${invalid[0].name} exceeds ${MAX_FILE_MB} MB.`);
      return;
    }
    const total = files.length + selected.length;
    if (total > MAX_FILES) {
      setFileError(`You can attach at most ${MAX_FILES} files at once.`);
      return;
    }
    setFiles((prev) => [...prev, ...selected]);
    e.target.value = '';
  };

  const removeFile = (idx) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  // ── Send text ─────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const hasText = text.trim().length > 0;
    const hasFiles = files.length > 0;
    if ((!hasText && !hasFiles) || sending || disabled) return;

    stopTyping();
    setSending(true);

    try {
      if (hasFiles) {
        await onSendFiles?.(files, text.trim(), setUploadProgress);
        setFiles([]);
        setUploadProgress(null);
      }
      if (hasText && !hasFiles) {
        await onSend?.(text.trim());
      }
      setText('');
    } finally {
      setSending(false);
      setUploadProgress(null);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [text, files, sending, disabled, onSend, onSendFiles, stopTyping]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // Drag and drop
  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length) {
      setFileError('');
      setFiles((prev) => [...prev, ...dropped].slice(0, MAX_FILES));
    }
  };

  const charsLeft = MAX_LENGTH - text.length;
  const canSend = (text.trim().length > 0 || files.length > 0) && !sending && !disabled;

  return (
    <div
      className="composer"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* File previews */}
      {files.length > 0 && (
        <div className="composer__files">
          {files.map((f, i) => (
            <div key={i} className="composer__file-chip">
              {f.type.startsWith('image/') ? (
                <img
                  src={URL.createObjectURL(f)}
                  alt={f.name}
                  className="composer__file-thumb"
                />
              ) : (
                <span className="composer__file-icon">📄</span>
              )}
              <span className="composer__file-name">{f.name}</span>
              <button
                className="composer__file-remove"
                onClick={() => removeFile(i)}
                aria-label={`Remove ${f.name}`}
                disabled={sending}
              >✕</button>
            </div>
          ))}
        </div>
      )}

      {fileError && <p className="composer__error">{fileError}</p>}

      {/* Upload progress */}
      {uploadProgress !== null && (
        <div className="composer__progress">
          <div className="composer__progress-bar" style={{ width: `${uploadProgress}%` }} />
          <span>{uploadProgress}%</span>
        </div>
      )}

      <div className="composer__inner">
        {/* Attachment button */}
        <button
          type="button"
          className="composer__attach icon-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || sending || files.length >= MAX_FILES}
          aria-label="Attach files"
          title="Attach files (max 5)"
        >
          <AttachIcon />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.mp4,.mp3"
          className="sr-only"
          onChange={handleFileChange}
        />

        <label htmlFor="msg-input" className="sr-only">Type a message</label>
        <textarea
          id="msg-input"
          ref={textareaRef}
          className="composer__textarea"
          placeholder={files.length > 0 ? 'Add a caption…' : placeholder}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled || sending}
          rows={1}
          aria-multiline="true"
          aria-label="Message input"
        />

        {charsLeft <= 200 && (
          <span
            className={`composer__count ${charsLeft <= 50 ? 'composer__count--warn' : ''}`}
            aria-live="polite"
          >
            {charsLeft}
          </span>
        )}

        <button
          className="composer__send"
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Send message"
          title="Send (Enter)"
        >
          {sending ? <SpinnerIcon /> : <SendIcon />}
        </button>
      </div>

      <p className="composer__hint">Enter to send · Shift+Enter for new line · Drag files to attach</p>
    </div>
  );
}

function AttachIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}
function SpinnerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ animation: 'spin 0.7s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
