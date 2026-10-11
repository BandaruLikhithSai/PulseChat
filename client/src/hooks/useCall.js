import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from '../context/SocketContext.jsx';

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

  const pcRef                = useRef(null);
  const localStream          = useRef(null);
  const remoteStream         = useRef(null);
  const timerRef             = useRef(null);
  const sessionIdRef         = useRef(null);
  const pendingIceCandidates = useRef([]);
  const remoteDescSet        = useRef(false);

  const iceServersRef = useRef([
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]);

  const localVideoElRef  = useRef(null);
  const remoteVideoElRef = useRef(null);
  const remoteAudioElRef = useRef(null);

  const log = (...args) => console.log('[CALL]', ...args);

  const attachLocalStream = useCallback((stream) => {
    localStream.current = stream;
    log('Local stream tracks:', stream.getTracks().map(t => `${t.kind}:${t.enabled}`));
    if (localVideoElRef.current) {
      localVideoElRef.current.srcObject = stream;
      log('Local stream attached to video element');
    }
  }, []);

  const attachRemoteStream = useCallback((stream) => {
    remoteStream.current = stream;
    log('Remote stream tracks:', stream.getTracks().map(t => `${t.kind}:${t.enabled}`));
    if (remoteVideoElRef.current) {
      remoteVideoElRef.current.srcObject = stream;
      log('Remote stream attached to video element');
    }
    if (remoteAudioElRef.current) {
      remoteAudioElRef.current.srcObject = stream;
      log('Remote stream attached to audio element');
    }
  }, []);

  const drainIceCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    const queued = pendingIceCandidates.current.splice(0);
    log(`Draining ${queued.length} buffered ICE candidates`);
    for (const c of queued) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); }
      catch (e) { log('ICE drain error (ignored):', e.message); }
    }
  }, []);

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
    setCallState('idle'); setSessionId(null); setRemoteId(null);
    setRemoteName(''); setRemoteAvatar(null); setIncomingCall(null);
    setError(''); setAudioEnabled(true); setVideoEnabled(true);
  }, [cleanup]);

  const setRemoteDescAndDrain = useCallback(async (pc, sdp) => {
    log('Setting remote description, type:', sdp.type);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    remoteDescSet.current = true;
    log('Remote description set ✓');
    await drainIceCandidates();
  }, [drainIceCandidates]);

  const createPC = useCallback((sid, targetId) => {
    if (pcRef.current) { pcRef.current.close(); }
    pendingIceCandidates.current = [];
    remoteDescSet.current = false;

    log('Creating RTCPeerConnection, ICE servers:', iceServersRef.current.map(s => s.urls));

    const pc = new RTCPeerConnection({
      iceServers: iceServersRef.current,
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    });
    pcRef.current = pc;

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        log('Sending ICE candidate to', targetId);
        getSocket()?.emit('call:ice', { sessionId: sid, targetId, candidate });
      } else {
        log('ICE gathering complete');
      }
    };

    pc.ontrack = (event) => {
      log('ontrack fired! streams:', event.streams.length, 'track kind:', event.track.kind);
      const stream = event.streams?.[0] ?? new MediaStream([event.track]);
      remoteStream.current = stream;
      attachRemoteStream(stream);
    };

    pc.onconnectionstatechange = () => {
      log('connectionState:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        setCallState('connected');
        if (!timerRef.current) {
          timerRef.current = setInterval(() => setDuration((s) => s + 1), 1000);
        }
      }
      if (['failed','disconnected','closed'].includes(pc.connectionState)) {
        setError('Connection lost.'); setCallState('failed');
      }
    };

    pc.oniceconnectionstatechange = () => {
      log('iceConnectionState:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setCallState('connected');
        if (!timerRef.current) {
          timerRef.current = setInterval(() => setDuration((s) => s + 1), 1000);
        }
      }
    };

    pc.onsignalingstatechange = () => log('signalingState:', pc.signalingState);
    pc.onicegatheringstatechange = () => log('iceGatheringState:', pc.iceGatheringState);

    return pc;
  }, [getSocket, attachRemoteStream]);

  const startCall = useCallback(async (convId, calleeId, type = 'video', calleeName = '') => {
    log('startCall', { convId, calleeId, type, calleeName });
    setError(''); setRemoteName(calleeName);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });
      log('Got local media stream');
      attachLocalStream(stream);
      setCallState('calling'); setCallType(type); setRemoteId(calleeId);

      getSocket()?.emit('call:invite', { conversationId: convId, calleeId, type }, (ack) => {
        log('call:invite ack', ack);
        if (ack?.error) { setError(ack.error); resetState(); return; }
        sessionIdRef.current = ack?.sessionId;
        setSessionId(ack?.sessionId);
      });
    } catch (err) {
      const msg = err.name === 'NotAllowedError' ? 'Camera/microphone permission denied.' :
                  err.name === 'NotFoundError'   ? 'No camera or microphone found.' :
                  `Media error: ${err.message}`;
      setError(msg); setCallState('failed');
    }
  }, [getSocket, resetState, attachLocalStream]);

  const acceptCall = useCallback(async (incoming) => {
    const { sessionId: sid, callerId, type = 'video' } = incoming;
    log('acceptCall', { sid, callerId, type });
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video',
      });
      log('Callee got local media stream');
      attachLocalStream(stream);
      setCallState('connecting'); setCallType(type);
      sessionIdRef.current = sid; setSessionId(sid);
      setRemoteId(callerId);
      setRemoteName(incoming.callerName || '');
      setRemoteAvatar(incoming.callerAvatar || null);
      setIncomingCall(null);

      // Create PC and add tracks BEFORE sending call:accept
      const pc = createPC(sid, callerId);
      log('Callee: adding', stream.getTracks().length, 'tracks to PC');
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      getSocket()?.emit('call:accept', { sessionId: sid }, (ack) => {
        log('call:accept ack', ack);
        if (ack?.error) { setError(ack.error); resetState(); return; }
        if (ack?.iceServers?.length) {
          iceServersRef.current = ack.iceServers;
          log('Updated ICE servers from server:', ack.iceServers.map(s => s.urls));
        }
      });
    } catch (err) {
      const msg = err.name === 'NotAllowedError' ? 'Camera/microphone permission denied.' :
                  `Media error: ${err.message}`;
      setError(msg); setCallState('failed');
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

  useEffect(() => {
    const socket = getSocket();
    if (!socket) { log('No socket yet, skipping listener registration'); return; }
    log('Registering call socket listeners, connected:', connected);

    const onIncoming = (data) => {
      log('call:incoming received', data);
      setIncomingCall(data); setCallType(data.type || 'video');
    };

    const onAccepted = async ({ sessionId: sid, calleeId, iceServers }) => {
      log('call:accepted received', { sid, calleeId });
      if (iceServers?.length) {
        iceServersRef.current = iceServers;
        log('ICE servers from server:', iceServers.map(s => s.urls));
      }
      setCallState('connecting'); setRemoteId(calleeId);

      const pc = createPC(sid, calleeId);
      if (localStream.current) {
        const tracks = localStream.current.getTracks();
        log('Caller: adding', tracks.length, 'tracks to PC');
        tracks.forEach((t) => pc.addTrack(t, localStream.current));
      } else {
        log('WARNING: no local stream when creating offer!');
      }

      try {
        const offer = await pc.createOffer();
        log('Offer created, type:', offer.type);
        await pc.setLocalDescription(offer);
        log('Local description set ✓');
        socket.emit('call:offer', { sessionId: sid, targetId: calleeId, sdp: offer });
        log('call:offer sent to', calleeId);
      } catch (err) {
        log('createOffer ERROR:', err.message);
        setError('Failed to create offer.'); setCallState('failed');
      }
    };

    const onOffer = async ({ sessionId: sid, sdp, fromId }) => {
      log('call:offer received from', fromId);
      const pc = pcRef.current;
      if (!pc) {
        log('ERROR: No RTCPeerConnection when offer arrived!');
        return;
      }
      log('PC signalingState when offer arrived:', pc.signalingState);
      try {
        await setRemoteDescAndDrain(pc, sdp);
        const answer = await pc.createAnswer();
        log('Answer created');
        await pc.setLocalDescription(answer);
        log('Callee local description set ✓');
        socket.emit('call:answer', { sessionId: sid, targetId: fromId, sdp: answer });
        log('call:answer sent to', fromId);
      } catch (err) {
        log('onOffer ERROR:', err.message);
        setError('Negotiation failed.'); setCallState('failed');
      }
    };

    const onAnswer = async ({ sdp }) => {
      log('call:answer received');
      const pc = pcRef.current;
      if (!pc) { log('ERROR: No PC when answer arrived'); return; }
      try {
        await setRemoteDescAndDrain(pc, sdp);
      } catch (err) {
        log('onAnswer ERROR:', err.message);
      }
    };

    const onIce = async ({ candidate }) => {
      if (!candidate) return;
      const pc = pcRef.current;
      if (!pc) { log('ICE candidate arrived but no PC'); return; }
      if (remoteDescSet.current) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
        catch (e) { log('addIceCandidate error (ignored):', e.message); }
      } else {
        log('Buffering ICE candidate (no remote desc yet), total buffered:', pendingIceCandidates.current.length + 1);
        pendingIceCandidates.current.push(candidate);
      }
    };

    const onRejected = () => { log('call:rejected'); setError('Call was rejected.'); resetState(); };
    const onEnded    = () => { log('call:ended'); resetState(); };

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
