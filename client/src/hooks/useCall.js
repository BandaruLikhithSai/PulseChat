import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from '../context/SocketContext.jsx';

/**
 * useCall — manages a single WebRTC call session.
 *
 * Call states:
 *   idle        → no call
 *   calling     → we initiated, waiting for callee to accept
 *   ringing     → we received an invite, deciding whether to accept
 *   connecting  → both accepted, WebRTC negotiation in progress
 *   connected   → media flowing
 *   ended       → call finished
 *   failed      → error state
 *
 * Usage:
 *   const call = useCall();
 *   call.startCall(conversationId, calleeId, 'video');
 *   <CallScreen call={call} />
 */
export function useCall() {
  const { getSocket } = useSocket();
  const [callState, setCallState] = useState('idle');
  const [callType, setCallType] = useState('video');   // 'audio' | 'video'
  const [sessionId, setSessionId] = useState(null);
  const [remoteId, setRemoteId] = useState(null);
  const [remoteName, setRemoteName] = useState('');
  const [remoteAvatar, setRemoteAvatar] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null); // { sessionId, callerId, ... }
  const [duration, setDuration] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [error, setError] = useState('');

  const pcRef        = useRef(null);  // RTCPeerConnection
  const localStream  = useRef(null);  // MediaStream (camera + mic)
  const remoteStream = useRef(null);  // MediaStream from peer
  const timerRef     = useRef(null);
  const iceServersRef = useRef([{ urls: 'stun:stun.l.google.com:19302' }]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
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
  function createPC(sid, targetId) {
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
    pcRef.current = pc;

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        getSocket()?.emit('call:ice', { sessionId: sid, targetId, candidate });
      }
    };

    pc.ontrack = (event) => {
      remoteStream.current = event.streams[0];
      // Dispatch custom event so CallScreen can attach to <video>
      window.dispatchEvent(new CustomEvent('call:remote-stream', {
        detail: { stream: event.streams[0] },
      }));
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCallState('connected');
        // Start duration timer
        let secs = 0;
        timerRef.current = setInterval(() => setDuration(++secs), 1000);
      }
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
        setError('Connection lost.');
        setCallState('failed');
      }
    };

    return pc;
  }

  // ── Initiate a call ───────────────────────────────────────────────────────
  const startCall = useCallback(async (convId, calleeId, type = 'video') => {
    setError('');
    try {
      const constraints = {
        audio: true,
        video: type === 'video' ? { width: 1280, height: 720 } : false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStream.current = stream;

      // Dispatch so CallScreen can attach local <video>
      window.dispatchEvent(new CustomEvent('call:local-stream', { detail: { stream } }));

      setCallState('calling');
      setCallType(type);
      setConversationId(convId);
      setRemoteId(calleeId);

      getSocket()?.emit('call:invite', { conversationId: convId, calleeId, type }, (ack) => {
        if (ack?.error) { setError(ack.error); resetState(); }
        else { setSessionId(ack?.sessionId); }
      });
    } catch (err) {
      const msg = err.name === 'NotAllowedError'
        ? 'Camera/microphone permission denied.'
        : err.name === 'NotFoundError'
        ? 'No camera or microphone found.'
        : `Could not access media: ${err.message}`;
      setError(msg);
      setCallState('failed');
    }
  }, [getSocket, resetState]);

  // ── Accept an incoming call ────────────────────────────────────────────────
  const acceptCall = useCallback(async (incoming) => {
    const { sessionId: sid, callerId, type = 'video' } = incoming;
    setError('');
    try {
      const constraints = { audio: true, video: type === 'video' ? true : false };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStream.current = stream;
      window.dispatchEvent(new CustomEvent('call:local-stream', { detail: { stream } }));

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
        // Add local tracks
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      });
    } catch (err) {
      const msg = err.name === 'NotAllowedError'
        ? 'Camera/microphone permission denied.'
        : `Could not access media: ${err.message}`;
      setError(msg);
      rejectCall(incoming.sessionId);
    }
  }, [getSocket, resetState]);

  // ── Reject an incoming call ────────────────────────────────────────────────
  const rejectCall = useCallback((sid) => {
    getSocket()?.emit('call:reject', { sessionId: sid ?? sessionId });
    resetState();
  }, [getSocket, resetState, sessionId]);

  // ── End an active call ────────────────────────────────────────────────────
  const endCall = useCallback(() => {
    if (sessionId) getSocket()?.emit('call:end', { sessionId });
    resetState();
  }, [getSocket, resetState, sessionId]);

  // ── Toggle audio/video ────────────────────────────────────────────────────
  const toggleAudio = useCallback(() => {
    if (!localStream.current) return;
    const track = localStream.current.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; setAudioEnabled(track.enabled); }
  }, []);

  const toggleVideo = useCallback(() => {
    if (!localStream.current) return;
    const track = localStream.current.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; setVideoEnabled(track.enabled); }
  }, []);

  // ── Socket event listeners ────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // Incoming call from another user
    const onIncoming = (data) => {
      setIncomingCall(data);
      setCallType(data.type || 'video');
    };

    // Our call was accepted — create offer
    const onAccepted = async ({ sessionId: sid, calleeId, iceServers }) => {
      iceServersRef.current = iceServers || iceServersRef.current;
      setCallState('connecting');
      setRemoteId(calleeId);

      const pc = createPC(sid, calleeId);
      if (localStream.current) {
        localStream.current.getTracks().forEach((t) => pc.addTrack(t, localStream.current));
      }

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('call:offer', { sessionId: sid, targetId: calleeId, sdp: offer });
      } catch (err) {
        setError('Failed to create WebRTC offer.');
        setCallState('failed');
      }
    };

    // Receive an offer — create answer
    const onOffer = async ({ sessionId: sid, sdp, fromId }) => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('call:answer', { sessionId: sid, targetId: fromId, sdp: answer });
      } catch (err) {
        setError('WebRTC negotiation failed.');
        setCallState('failed');
      }
    };

    // Receive an answer
    const onAnswer = async ({ sdp }) => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch {}
    };

    // Receive ICE candidate
    const onIce = async ({ candidate }) => {
      const pc = pcRef.current;
      if (!pc || !candidate) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {}
    };

    const onRejected = () => {
      setError('Call was rejected.');
      resetState();
    };

    const onEnded = () => {
      resetState();
    };

    socket.on('call:incoming',   onIncoming);
    socket.on('call:accepted',   onAccepted);
    socket.on('call:offer',      onOffer);
    socket.on('call:answer',     onAnswer);
    socket.on('call:ice',        onIce);
    socket.on('call:rejected',   onRejected);
    socket.on('call:ended',      onEnded);

    return () => {
      socket.off('call:incoming',   onIncoming);
      socket.off('call:accepted',   onAccepted);
      socket.off('call:offer',      onOffer);
      socket.off('call:answer',     onAnswer);
      socket.off('call:ice',        onIce);
      socket.off('call:rejected',   onRejected);
      socket.off('call:ended',      onEnded);
    };
  }, [getSocket, resetState]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => () => cleanup(), [cleanup]);

  return {
    // State
    callState, callType, sessionId, remoteId, remoteName, remoteAvatar,
    conversationId, incomingCall, duration, audioEnabled, videoEnabled, error,
    // Refs (for <video> elements)
    localStream, remoteStream,
    // Actions
    startCall, acceptCall, rejectCall, endCall, toggleAudio, toggleVideo,
  };
}
