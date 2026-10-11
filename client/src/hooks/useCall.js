import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from '../context/SocketContext.jsx';

export function useCall() {
  const { getSocket, connected } = useSocket();
  const [callState, setCallState] = useState('idle');
  const [callType, setCallType] = useState('video');
  const [sessionId, setSessionId] = useState(null);
  const [remoteId, setRemoteId] = useState(null);
  const [remoteName, setRemoteName] = useState('');
  const [remoteAvatar, setRemoteAvatar] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [duration, setDuration] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [error, setError] = useState('');

  const pcRef           = useRef(null);
  const localStream     = useRef(null);
  const remoteStream    = useRef(null);
  const timerRef        = useRef(null);
  const iceServersRef   = useRef([{ urls: 'stun:stun.l.google.com:19302' }]);

  // These refs are set by CallScreen via the returned setters so we can
  // attach streams directly without relying on window events or state timing.
  const localVideoElRef  = useRef(null);  // set by CallScreen
  const remoteVideoElRef = useRef(null);  // set by CallScreen
  const remoteAudioElRef = useRef(null);  // set by CallScreen (audio-only calls)

  // ── Helpers to attach streams to elements ─────────────────────────────────
  const attachLocalStream = useCallback((stream) => {
    localStream.current = stream;
    if (localVideoElRef.current) {
      localVideoElRef.current.srcObject = stream;
    }
  }, []);

  const attachRemoteStream = useCallback((stream) => {
    remoteStream.current = stream;
    // Video element (video calls)
    if (remoteVideoElRef.current) {
      remoteVideoElRef.current.srcObject = stream;
    }
    // Audio element (audio-only calls, or as fallback)
    if (remoteAudioElRef.current) {
      remoteAudioElRef.current.srcObject = stream;
    }
  }, []);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    clearInterval(timerRef.current);
    if (localStream.current) {
      localStream.current.getTracks().forEach((t) => t.stop());
      localStream.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    // Detach streams from elements
    if (localVideoElRef.current)  localVideoElRef.current.srcObject  = null;
    if (remoteVideoElRef.current) remoteVideoElRef.current.srcObject = null;
    if (remoteAudioElRef.current) remoteAudioElRef.current.srcObject = null;
    setDuration(0);
  }, []);

  const resetState = useCallback(() => {
    cleanup();
    setCallState('idle');
    setSessionId(null);
    setRemoteId(null);
    setRemoteName('');
    setRemoteAvatar(null);
    setConversationId(null);
    setIncomingCall(null);
    setError('');
    setAudioEnabled(true);
    setVideoEnabled(true);
  }, [cleanup]);

  // ── Build RTCPeerConnection ────────────────────────────────────────────────
  const createPC = useCallback((sid, targetId) => {
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
    pcRef.current = pc;

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        getSocket()?.emit('call:ice', { sessionId: sid, targetId, candidate });
      }
    };

    // Fires when remote media arrives — attach directly to DOM elements
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      remoteStream.current = stream;
      attachRemoteStream(stream);
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCallState('connected');
        let secs = 0;
        timerRef.current = setInterval(() => setDuration(++secs), 1000);
      }
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
        setError('Connection lost. Check your network or try again.');
        setCallState('failed');
      }
    };

    // Log ICE state for debugging
    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE state:', pc.iceConnectionState);
    };

    return pc;
  }, [getSocket, attachRemoteStream]);

  // ── Initiate a call ────────────────────────────────────────────────────────
  const startCall = useCallback(async (convId, calleeId, type = 'video', calleeName = '') => {
    setError('');
    setRemoteName(calleeName);
    try {
      const constraints = {
        audio: true,
        video: type === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      attachLocalStream(stream);

      setCallState('calling');
      setCallType(type);
      setConversationId(convId);
      setRemoteId(calleeId);

      getSocket()?.emit('call:invite', { conversationId: convId, calleeId, type }, (ack) => {
        if (ack?.error) { setError(ack.error); resetState(); }
        else setSessionId(ack?.sessionId);
      });
    } catch (err) {
      const msg =
        err.name === 'NotAllowedError' ? 'Camera/microphone permission denied.' :
        err.name === 'NotFoundError'   ? 'No camera or microphone found.' :
        `Could not access media: ${err.message}`;
      setError(msg);
      setCallState('failed');
    }
  }, [getSocket, resetState, attachLocalStream]);

  // ── Accept an incoming call ────────────────────────────────────────────────
  const acceptCall = useCallback(async (incoming) => {
    const { sessionId: sid, callerId, type = 'video' } = incoming;
    setError('');
    try {
      const constraints = { audio: true, video: type === 'video' };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      attachLocalStream(stream);

      setCallState('connecting');
      setCallType(type);
      setSessionId(sid);
      setRemoteId(callerId);
      setRemoteName(incoming.callerName || '');
      setRemoteAvatar(incoming.callerAvatar || null);
      setIncomingCall(null);

      getSocket()?.emit('call:accept', { sessionId: sid }, (ack) => {
        if (ack?.error) { setError(ack.error); resetState(); return; }
        if (ack?.iceServers) iceServersRef.current = ack.iceServers;

        const pc = createPC(sid, callerId);
        // Add all local tracks so caller will receive our audio/video
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      });
    } catch (err) {
      const msg =
        err.name === 'NotAllowedError' ? 'Camera/microphone permission denied.' :
        `Could not access media: ${err.message}`;
      setError(msg);
      setCallState('failed');
      getSocket()?.emit('call:reject', { sessionId: incoming.sessionId });
    }
  }, [getSocket, resetState, createPC, attachLocalStream]);

  // ── Reject ────────────────────────────────────────────────────────────────
  const rejectCall = useCallback((sid) => {
    getSocket()?.emit('call:reject', { sessionId: sid ?? sessionId });
    resetState();
  }, [getSocket, resetState, sessionId]);

  // ── End ───────────────────────────────────────────────────────────────────
  const endCall = useCallback(() => {
    if (sessionId) getSocket()?.emit('call:end', { sessionId });
    resetState();
  }, [getSocket, resetState, sessionId]);

  // ── Toggle audio/video ─────────────────────────────────────────────────────
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

    const onAccepted = async ({ sessionId: sid, calleeId, iceServers }) => {
      iceServersRef.current = iceServers || iceServersRef.current;
      setCallState('connecting');
      setRemoteId(calleeId);

      const pc = createPC(sid, calleeId);
      // Add local tracks before creating offer
      if (localStream.current) {
        localStream.current.getTracks().forEach((t) => pc.addTrack(t, localStream.current));
      }
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('call:offer', { sessionId: sid, targetId: calleeId, sdp: offer });
      } catch (err) {
        console.error('[WebRTC] createOffer failed:', err);
        setError('Failed to start call negotiation.');
        setCallState('failed');
      }
    };

    const onOffer = async ({ sessionId: sid, sdp, fromId }) => {
      const pc = pcRef.current;
      if (!pc) { console.error('[WebRTC] No RTCPeerConnection when offer arrived'); return; }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('call:answer', { sessionId: sid, targetId: fromId, sdp: answer });
      } catch (err) {
        console.error('[WebRTC] answer failed:', err);
        setError('WebRTC negotiation failed.');
        setCallState('failed');
      }
    };

    const onAnswer = async ({ sdp }) => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch (err) {
        console.error('[WebRTC] setRemoteDescription(answer) failed:', err);
      }
    };

    const onIce = async ({ candidate }) => {
      const pc = pcRef.current;
      if (!pc || !candidate) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        // Trickle ICE — some candidates may arrive before remote description; safe to ignore
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
  }, [getSocket, resetState, createPC, connected]);

  useEffect(() => () => cleanup(), [cleanup]);

  return {
    callState, callType, sessionId, remoteId, remoteName, remoteAvatar,
    conversationId, incomingCall, duration, audioEnabled, videoEnabled, error,
    localStream, remoteStream,
    // Element ref setters — CallScreen calls these to register its DOM nodes
    localVideoElRef, remoteVideoElRef, remoteAudioElRef,
    startCall, acceptCall, rejectCall, endCall, toggleAudio, toggleVideo,
    attachRemoteStream, // exposed so CallScreen can re-attach on mount
  };
}
