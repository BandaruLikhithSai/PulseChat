import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from '../context/SocketContext.jsx';

/**
 * useCall — WebRTC 1-to-1 call hook.
 *
 * Key design decisions that fix "Connecting but no audio/video":
 *
 * 1. ICE CANDIDATE BUFFERING
 *    ICE candidates often arrive BEFORE setRemoteDescription() completes.
 *    We buffer them in pendingIceCandidates and drain the buffer as soon as
 *    the remote description is set. Without this, candidates are silently
 *    discarded and the connection never leaves "checking" state.
 *
 * 2. STABLE REFS FOR PC AND STREAMS
 *    pcRef, localStream, remoteStream are refs so callbacks always see the
 *    current value without needing to re-register on every render.
 *
 * 3. DIRECT DOM ATTACHMENT
 *    Streams are attached to <video>/<audio> elements via refs registered
 *    by CallScreen — no window events, no timing issues.
 *
 * 4. BOTH SIDES ADD TRACKS BEFORE NEGOTIATION
 *    Caller: adds tracks in onAccepted before createOffer.
 *    Callee: adds tracks in acceptCall before call:accept ack.
 */
export function useCall() {
  const { getSocket, connected } = useSocket();

  const [callState,    setCallState]    = useState('idle');
  const [callType,     setCallType]     = useState('video');
  const [sessionId,    setSessionId]    = useState(null);
  const [remoteId,     setRemoteId]     = useState(null);
  const [remoteName,   setRemoteName]   = useState('');
  const [remoteAvatar, setRemoteAvatar] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [duration,     setDuration]     = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [error,        setError]        = useState('');

  const pcRef                  = useRef(null);
  const localStream            = useRef(null);
  const remoteStream           = useRef(null);
  const timerRef               = useRef(null);
  const sessionIdRef           = useRef(null);   // mirrors sessionId state for callbacks
  const pendingIceCandidates   = useRef([]);      // ICE candidates buffered before remoteDesc
  const remoteDescSet          = useRef(false);   // true once setRemoteDescription succeeds

  const iceServersRef    = useRef([
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]);

  // DOM element refs — registered by CallScreen
  const localVideoElRef  = useRef(null);
  const remoteVideoElRef = useRef(null);
  const remoteAudioElRef = useRef(null);

  // ── Stream attachment helpers ──────────────────────────────────────────────
  const attachLocalStream = useCallback((stream) => {
    localStream.current = stream;
    if (localVideoElRef.current) localVideoElRef.current.srcObject = stream;
  }, []);

  const attachRemoteStream = useCallback((stream) => {
    remoteStream.current = stream;
    if (remoteVideoElRef.current) remoteVideoElRef.current.srcObject = stream;
    if (remoteAudioElRef.current) remoteAudioElRef.current.srcObject = stream;
  }, []);

  // ── Drain buffered ICE candidates ──────────────────────────────────────────
  const drainIceCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    const queued = pendingIceCandidates.current.splice(0);
    for (const c of queued) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch { /* ignore */ }
    }
  }, []);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    clearInterval(timerRef.current);
    if (localStream.current) {
      localStream.current.getTracks().forEach((t) => t.stop());
      localStream.current = null;
    }
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (localVideoElRef.current)  localVideoElRef.current.srcObject  = null;
    if (remoteVideoElRef.current) remoteVideoElRef.current.srcObject = null;
    if (remoteAudioElRef.current) remoteAudioElRef.current.srcObject = null;
    pendingIceCandidates.current = [];
    remoteDescSet.current = false;
    sessionIdRef.current = null;
    setDuration(0);
  }, []);

  const resetState = useCallback(() => {
    cleanup();
    setCallState('idle');
    setSessionId(null);
    setRemoteId(null);
    setRemoteName('');
    setRemoteAvatar(null);
    setIncomingCall(null);
    setError('');
    setAudioEnabled(true);
    setVideoEnabled(true);
  }, [cleanup]);

  // ── Build RTCPeerConnection ────────────────────────────────────────────────
  const createPC = useCallback((sid, targetId) => {
    // Close any existing PC first
    if (pcRef.current) { pcRef.current.close(); }
    pendingIceCandidates.current = [];
    remoteDescSet.current = false;

    const pc = new RTCPeerConnection({
      iceServers: iceServersRef.current,
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    });
    pcRef.current = pc;

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        getSocket()?.emit('call:ice', { sessionId: sid, targetId, candidate });
      }
    };

    pc.ontrack = (event) => {
      // event.streams[0] is the remote MediaStream
      const stream = event.streams?.[0];
      if (stream) {
        remoteStream.current = stream;
        attachRemoteStream(stream);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] connectionState:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        setCallState('connected');
        let secs = 0;
        timerRef.current = setInterval(() => setDuration((s) => s + 1), 1000);
      }
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
        setError('Connection lost.');
        setCallState('failed');
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] iceConnectionState:', pc.iceConnectionState);
      // Some browsers only fire iceConnectionState 'connected', not connectionState
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setCallState('connected');
        if (!timerRef.current) {
          timerRef.current = setInterval(() => setDuration((s) => s + 1), 1000);
        }
      }
    };

    return pc;
  }, [getSocket, attachRemoteStream]);

  // ── Helper: set remote description and drain buffered ICE ─────────────────
  const setRemoteDescAndDrain = useCallback(async (pc, sdp) => {
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    remoteDescSet.current = true;
    await drainIceCandidates();
  }, [drainIceCandidates]);

  // ── Start call (caller side) ───────────────────────────────────────────────
  const startCall = useCallback(async (convId, calleeId, type = 'video', calleeName = '') => {
    setError('');
    setRemoteName(calleeName);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });
      attachLocalStream(stream);
      setCallState('calling');
      setCallType(type);
      setRemoteId(calleeId);

      getSocket()?.emit('call:invite', { conversationId: convId, calleeId, type }, (ack) => {
        if (ack?.error) { setError(ack.error); resetState(); return; }
        sessionIdRef.current = ack?.sessionId;
        setSessionId(ack?.sessionId);
      });
    } catch (err) {
      setError(
        err.name === 'NotAllowedError' ? 'Camera/microphone permission denied.' :
        err.name === 'NotFoundError'   ? 'No camera or microphone found.' :
        `Media error: ${err.message}`
      );
      setCallState('failed');
    }
  }, [getSocket, resetState, attachLocalStream]);

  // ── Accept call (callee side) ──────────────────────────────────────────────
  const acceptCall = useCallback(async (incoming) => {
    const { sessionId: sid, callerId, type = 'video' } = incoming;
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video',
      });
      attachLocalStream(stream);
      setCallState('connecting');
      setCallType(type);
      sessionIdRef.current = sid;
      setSessionId(sid);
      setRemoteId(callerId);
      setRemoteName(incoming.callerName || '');
      setRemoteAvatar(incoming.callerAvatar || null);
      setIncomingCall(null);

      // Create PC and add tracks BEFORE sending call:accept
      // so tracks are ready when the offer arrives
      const pc = createPC(sid, callerId);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      getSocket()?.emit('call:accept', { sessionId: sid }, (ack) => {
        if (ack?.error) { setError(ack.error); resetState(); return; }
        if (ack?.iceServers) iceServersRef.current = ack.iceServers;
        // PC is ready and tracks added — caller will now send the offer
      });
    } catch (err) {
      setError(
        err.name === 'NotAllowedError' ? 'Camera/microphone permission denied.' :
        `Media error: ${err.message}`
      );
      setCallState('failed');
      getSocket()?.emit('call:reject', { sessionId: incoming.sessionId });
    }
  }, [getSocket, resetState, createPC, attachLocalStream]);

  const rejectCall = useCallback((sid) => {
    getSocket()?.emit('call:reject', { sessionId: sid ?? sessionIdRef.current });
    resetState();
  }, [getSocket, resetState]);

  const endCall = useCallback(() => {
    if (sessionIdRef.current) getSocket()?.emit('call:end', { sessionId: sessionIdRef.current });
    resetState();
  }, [getSocket, resetState]);

  const toggleAudio = useCallback(() => {
    const track = localStream.current?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setAudioEnabled(track.enabled); }
  }, []);

  const toggleVideo = useCallback(() => {
    const track = localStream.current?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; setVideoEnabled(track.enabled); }
  }, []);

  // ── Socket event listeners ─────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onIncoming = (data) => {
      setIncomingCall(data);
      setCallType(data.type || 'video');
    };

    // Caller receives: callee accepted → create offer
    const onAccepted = async ({ sessionId: sid, calleeId, iceServers }) => {
      if (iceServers?.length) iceServersRef.current = iceServers;
      setCallState('connecting');
      setRemoteId(calleeId);

      const pc = createPC(sid, calleeId);
      // Add local tracks before offer so callee gets our media
      if (localStream.current) {
        localStream.current.getTracks().forEach((t) => pc.addTrack(t, localStream.current));
      }
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('call:offer', { sessionId: sid, targetId: calleeId, sdp: offer });
      } catch (err) {
        console.error('[WebRTC] createOffer error:', err);
        setError('Failed to create offer.');
        setCallState('failed');
      }
    };

    // Callee receives: offer from caller → send answer
    const onOffer = async ({ sessionId: sid, sdp, fromId }) => {
      const pc = pcRef.current;
      if (!pc) {
        console.error('[WebRTC] No PC when offer arrived — createPC was not called in acceptCall');
        return;
      }
      try {
        await setRemoteDescAndDrain(pc, sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('call:answer', { sessionId: sid, targetId: fromId, sdp: answer });
      } catch (err) {
        console.error('[WebRTC] onOffer error:', err);
        setError('Negotiation failed.');
        setCallState('failed');
      }
    };

    // Caller receives: answer from callee
    const onAnswer = async ({ sdp }) => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        await setRemoteDescAndDrain(pc, sdp);
      } catch (err) {
        console.error('[WebRTC] onAnswer setRemoteDescription error:', err);
      }
    };

    // Both sides receive ICE candidates
    const onIce = async ({ candidate }) => {
      if (!candidate) return;
      const pc = pcRef.current;
      if (!pc) return;

      if (remoteDescSet.current) {
        // Remote description already set — add immediately
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch { /* ignore */ }
      } else {
        // Remote description not set yet — buffer for later
        pendingIceCandidates.current.push(candidate);
      }
    };

    const onRejected = () => { setError('Call was rejected.'); resetState(); };
    const onEnded    = () => { resetState(); };

    socket.on('call:incoming',  onIncoming);
    socket.on('call:accepted',  onAccepted);
    socket.on('call:offer',     onOffer);
    socket.on('call:answer',    onAnswer);
    socket.on('call:ice',       onIce);
    socket.on('call:rejected',  onRejected);
    socket.on('call:ended',     onEnded);

    return () => {
      socket.off('call:incoming',  onIncoming);
      socket.off('call:accepted',  onAccepted);
      socket.off('call:offer',     onOffer);
      socket.off('call:answer',    onAnswer);
      socket.off('call:ice',       onIce);
      socket.off('call:rejected',  onRejected);
      socket.off('call:ended',     onEnded);
    };
  }, [getSocket, resetState, createPC, setRemoteDescAndDrain, connected]);

  useEffect(() => () => cleanup(), [cleanup]);

  return {
    callState, callType, sessionId, remoteId, remoteName, remoteAvatar,
    incomingCall, duration, audioEnabled, videoEnabled, error,
    localStream, remoteStream,
    localVideoElRef, remoteVideoElRef, remoteAudioElRef,
    startCall, acceptCall, rejectCall, endCall,
    toggleAudio, toggleVideo, attachRemoteStream,
  };
}
