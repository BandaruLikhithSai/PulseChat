import { useEffect, useRef } from 'react';
import './CallScreen.css';

/**
 * CallScreen — full-screen overlay shown during an active call.
 *
 * Handles:
 *  - Calling / ringing states (with accept/reject for incoming)
 *  - Active call with local + remote video
 *  - Audio-only mode (no video tiles)
 *  - Mute / camera toggle
 *  - End call
 *  - Duration timer
 *  - Error display
 */
export default function CallScreen({ call }) {
  const { callState, callType, remoteName, remoteAvatar, incomingCall,
    duration, audioEnabled, videoEnabled, error,
    localStream, startCall, acceptCall, rejectCall, endCall,
    toggleAudio, toggleVideo } = call;

  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);

  // Attach local stream
  useEffect(() => {
    const attach = (e) => {
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = e.detail.stream;
      }
    };
    window.addEventListener('call:local-stream', attach);
    // If stream already exists
    if (localStream.current && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream.current;
    }
    return () => window.removeEventListener('call:local-stream', attach);
  }, [localStream]);

  // Attach remote stream
  useEffect(() => {
    const attach = (e) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = e.detail.stream;
      }
    };
    window.addEventListener('call:remote-stream', attach);
    return () => window.removeEventListener('call:remote-stream', attach);
  }, []);

  // Don't render if idle
  if (callState === 'idle' && !incomingCall) return null;

  return (
    <div className="call-overlay" role="dialog" aria-modal="true" aria-label="Call">

      {/* Incoming call notification */}
      {incomingCall && callState === 'idle' && (
        <div className="call-incoming">
          <div className="call-incoming__avatar">
            {incomingCall.callerAvatar
              ? <img src={incomingCall.callerAvatar} alt={incomingCall.callerName} />
              : <span>{(incomingCall.callerName || '?')[0].toUpperCase()}</span>
            }
          </div>
          <p className="call-incoming__name">{incomingCall.callerName || 'Unknown'}</p>
          <p className="call-incoming__label">
            Incoming {incomingCall.type === 'video' ? '📹 video' : '📞 audio'} call…
          </p>
          <div className="call-incoming__actions">
            <button className="call-btn call-btn--reject" onClick={() => rejectCall(incomingCall.sessionId)} aria-label="Reject">
              <PhoneOffIcon />
            </button>
            <button className="call-btn call-btn--accept" onClick={() => acceptCall(incomingCall)} aria-label="Accept">
              <PhoneIcon />
            </button>
          </div>
        </div>
      )}

      {/* Active / connecting call */}
      {callState !== 'idle' && (
        <div className={`call-screen ${callType === 'audio' ? 'call-screen--audio' : ''}`}>

          {/* Remote video */}
          {callType === 'video' ? (
            <video
              ref={remoteVideoRef}
              className="call-video call-video--remote"
              autoPlay
              playsInline
            />
          ) : (
            <div className="call-audio-avatar">
              {remoteAvatar
                ? <img src={remoteAvatar} alt={remoteName} />
                : <span>{(remoteName || '?')[0].toUpperCase()}</span>
              }
            </div>
          )}

          {/* Local video (picture-in-picture) */}
          {callType === 'video' && (
            <video
              ref={localVideoRef}
              className="call-video call-video--local"
              autoPlay
              playsInline
              muted
            />
          )}

          {/* Status bar */}
          <div className="call-status">
            <span className="call-status__name">{remoteName}</span>
            <span className="call-status__state">
              {callState === 'calling'    && 'Calling…'}
              {callState === 'connecting' && 'Connecting…'}
              {callState === 'connected'  && formatDuration(duration)}
              {callState === 'failed'     && (error || 'Call failed')}
              {callState === 'ended'      && 'Call ended'}
            </span>
          </div>

          {/* Controls */}
          <div className="call-controls">
            <button
              className={`call-ctrl-btn ${!audioEnabled ? 'call-ctrl-btn--off' : ''}`}
              onClick={toggleAudio}
              aria-label={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
              title={audioEnabled ? 'Mute' : 'Unmute'}
            >
              {audioEnabled ? <MicIcon /> : <MicOffIcon />}
            </button>

            {callType === 'video' && (
              <button
                className={`call-ctrl-btn ${!videoEnabled ? 'call-ctrl-btn--off' : ''}`}
                onClick={toggleVideo}
                aria-label={videoEnabled ? 'Turn off camera' : 'Turn on camera'}
                title={videoEnabled ? 'Camera off' : 'Camera on'}
              >
                {videoEnabled ? <VideoIcon /> : <VideoOffIcon />}
              </button>
            )}

            <button
              className="call-ctrl-btn call-ctrl-btn--end"
              onClick={endCall}
              aria-label="End call"
              title="End call"
            >
              <PhoneOffIcon />
            </button>
          </div>

          {/* Error */}
          {error && <p className="call-error">{error}</p>}
        </div>
      )}
    </div>
  );
}

function formatDuration(secs) {
  const m = String(Math.floor(secs / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function PhoneIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.18 6.18l1.27-.94a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
}
function PhoneOffIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-.95a2 2 0 0 1 2.11-.45c.907.34 1.85.574 2.81.7a2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 4.69 13M7.1 7.1 2 2m17 0-5.35 5.35M17 2l-5 5"/></svg>;
}
function MicIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>;
}
function MicOffIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>;
}
function VideoIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>;
}
function VideoOffIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/></svg>;
}
