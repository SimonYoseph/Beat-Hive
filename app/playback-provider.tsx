"use client";

import ReactPlayer from "react-player";
import { createContext, ReactNode, PointerEvent as ReactPointerEvent, useContext, useEffect, useRef, useState } from "react";
import { Activity, Eye, EyeOff, Pause, Play, RotateCcw, SkipBack, SkipForward, Square, Volume2, VolumeX } from "lucide-react";
import { useSession } from "next-auth/react";

import { RoomState, useRoom } from "./room-provider";

const MASTER_CONTROL_EMAIL = "simon97862012@gmail.com";

type NowPlayingTrack = {
  videoId?: string;
  title: string;
  channelTitle: string;
  thumbnail?: string;
};

type PlaybackContextValue = {
  nowPlaying: NowPlayingTrack | null;
  isPlaying: boolean;
  setNowPlaying: (track: NowPlayingTrack | null) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  refreshPlayback: () => void;
};

type MasterSettings = {
  requestsPaused: boolean;
  queueLocked: boolean;
  maxRequests: number;
  preventDuplicates: boolean;
  voteThreshold: number;
};

const DEFAULT_MASTER_SETTINGS: MasterSettings = { requestsPaused: false, queueLocked: false, maxRequests: 20, preventDuplicates: true, voteThreshold: 0 };

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

function readNowPlaying() {
  try {
    const savedTrack = window.localStorage.getItem("bh_now_playing");
    return savedTrack ? JSON.parse(savedTrack) as NowPlayingTrack : null;
  } catch {
    return null;
  }
}

function recordPlayedTrack(track: NowPlayingTrack) {
  if (!track.videoId) return;

  try {
    const history = JSON.parse(window.localStorage.getItem("bh_play_history") || "[]") as NowPlayingTrack[];
    if (history.at(-1)?.videoId === track.videoId) return;
    window.localStorage.setItem("bh_play_history", JSON.stringify([...history, track].slice(-50)));
  } catch {
    window.localStorage.setItem("bh_play_history", JSON.stringify([track]));
  }
}

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const { room, refreshRoom, updateHostState, manageRoomHost } = useRoom();
  const [nowPlaying, updateNowPlaying] = useState<NowPlayingTrack | null>(null);
  const [isPlaying, updateIsPlaying] = useState(false);
  const [isMuted, updateIsMuted] = useState(false);
  const [isVideoHidden, setIsVideoHidden] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMasterControlEnabled, setIsMasterControlEnabled] = useState(true);
  const [roleEmail, setRoleEmail] = useState("");
  const [roleMessage, setRoleMessage] = useState("");
  const [isMasterPanelOpen, setIsMasterPanelOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [masterControlPosition, setMasterControlPosition] = useState({ x: 16, y: 16 });
  const [masterControlSize, setMasterControlSize] = useState({ width: 440, height: 0 });
  const [masterSettings, setMasterSettings] = useState<MasterSettings>(DEFAULT_MASTER_SETTINGS);
  const playerRef = useRef<HTMLVideoElement>(null);
  const masterDragRef = useRef<{ startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const masterDragCompletedRef = useRef(false);
  const masterResizeRef = useRef<{ startX: number; startY: number; width: number; height: number } | null>(null);
  const masterControlSizeRef = useRef(masterControlSize);
  const masterControlPositionRef = useRef(masterControlPosition);
  const accountEmail = session?.user?.email?.toLowerCase();
  const isMasterAccount = accountEmail === MASTER_CONTROL_EMAIL;
  const isHiveHost = Boolean(accountEmail && room && (room.host_email?.toLowerCase() === accountEmail || room.hosts?.some((host) => host.email.toLowerCase() === accountEmail)));
  const canControlSession = isMasterAccount || isHiveHost;
  const isSessionControlEnabled = isMasterAccount ? isMasterControlEnabled : isHiveHost;
  const sessionControlLabel = isMasterAccount ? "OMNI CONTROL" : "HIVE SESSION";
  const getCollapsedControlWidth = () => window.innerWidth < 640 ? 40 : 170;

  function persistHostState(update: (state: RoomState) => RoomState) {
    if (!room || !canControlSession) return;
    void updateHostState(update).catch(() => { void refreshRoom(); });
  }

  function startPlayback() {
    updateIsPlaying(true);
    persistHostState((state) => ({ ...state, isPlaying: true }));
  }

  function refreshPlayback() {
    updateNowPlaying(readNowPlaying());
    if (window.localStorage.getItem("bh_queue_autoplay") === "true") {
      window.localStorage.removeItem("bh_queue_autoplay");
      startPlayback();
    }
  }

  function setNowPlaying(track: NowPlayingTrack | null) {
    updateNowPlaying(track);
    if (track) window.localStorage.setItem("bh_now_playing", JSON.stringify(track));
    else window.localStorage.removeItem("bh_now_playing");
    persistHostState((state) => ({ ...state, nowPlaying: track?.videoId ? { ...track, videoId: track.videoId } : null }));
  }

  function handleTrackEnded() {
    if (room && !canControlSession) {
      updateIsPlaying(false);
      return;
    }
    if (room && canControlSession) {
      persistHostState((state) => {
        const queue = state.queue || [];
        const currentIndex = queue.findIndex((track) => track.videoId === nowPlaying?.videoId);
        const nextQueue = currentIndex >= 0 ? queue.filter((_, index) => index !== currentIndex) : queue;
        const nextTrack = nextQueue[currentIndex] || nextQueue[0] || null;
        return { ...state, queue: nextQueue, nowPlaying: nextTrack, isPlaying: Boolean(nextTrack) };
      });
      return;
    }
    try {
      const queue = JSON.parse(window.localStorage.getItem("bh_play_queue") || "[]") as NowPlayingTrack[];
      const currentIndex = queue.findIndex((track) => track.videoId === nowPlaying?.videoId);
      if (currentIndex < 0) throw new Error("The completed track is not in the Hive Queue.");

      const nextQueue = queue.filter((_, index) => index !== currentIndex);
      const nextTrack = nextQueue[currentIndex] || nextQueue[0] || null;
      window.localStorage.setItem("bh_play_queue", JSON.stringify(nextQueue));
      setNowPlaying(nextTrack);
      if (nextTrack) startPlayback();
      else updateIsPlaying(false);
      window.dispatchEvent(new Event("bh-playback-change"));
    } catch {
      updateIsPlaying(false);
    }
  }

  function playPreviousTrack() {
    if (room && canControlSession) {
      const queue = room.state.queue || [];
      const currentIndex = queue.findIndex((track) => track.videoId === nowPlaying?.videoId);
      const previousTrack = currentIndex > 0 ? queue[currentIndex - 1] : null;
      if (previousTrack) persistHostState((state) => ({ ...state, nowPlaying: previousTrack, isPlaying: true }));
      return;
    }
    try {
      const history = JSON.parse(window.localStorage.getItem("bh_play_history") || "[]") as NowPlayingTrack[];
      const previousTrack = history.filter((track) => track.videoId !== nowPlaying?.videoId).at(-1);
      if (!previousTrack) return;
      setNowPlaying(previousTrack);
      startPlayback();
      window.dispatchEvent(new Event("bh-playback-change"));
    } catch {
      // Keep the current track active if playback history cannot be read.
    }
  }

  function playNextTrack() {
    if (room && canControlSession) {
      const queue = room.state.queue || [];
      const currentIndex = queue.findIndex((track) => track.videoId === nowPlaying?.videoId);
      const nextTrack = queue[currentIndex + 1];
      if (nextTrack) persistHostState((state) => ({ ...state, nowPlaying: nextTrack, isPlaying: true }));
      return;
    }
    try {
      const queue = JSON.parse(window.localStorage.getItem("bh_play_queue") || "[]") as NowPlayingTrack[];
      const currentIndex = queue.findIndex((track) => track.videoId === nowPlaying?.videoId);
      const nextTrack = queue[currentIndex + 1];
      if (!nextTrack) return;
      setNowPlaying(nextTrack);
      startPlayback();
      window.dispatchEvent(new Event("bh-playback-change"));
    } catch {
      // Keep the current track active if the queue cannot be read.
    }
  }

  function toggleMasterControl() {
    const nextValue = !isMasterControlEnabled;
    setIsMasterControlEnabled(nextValue);
    window.localStorage.setItem("bh_masterControlEnabled", JSON.stringify(nextValue));
    window.dispatchEvent(new Event("bh-master-control-change"));
  }

  function updateMasterSettings(update: Partial<MasterSettings>) {
    const nextSettings = { ...masterSettings, ...update };
    setMasterSettings(nextSettings);
    window.localStorage.setItem("bh_masterSettings", JSON.stringify(nextSettings));
    window.dispatchEvent(new Event("bh-master-settings-change"));
    persistHostState((state) => ({ ...state, settings: { ...(state.settings || {}), ...update } }));
  }

  function stopAudio() {
    updateIsPlaying(false);
    setNowPlaying(null);
    window.dispatchEvent(new Event("bh-playback-change"));
    persistHostState((state) => ({ ...state, nowPlaying: null, isPlaying: false }));
  }

  function clearHiveQueue() {
    if (room && canControlSession) {
      persistHostState((state) => ({ ...state, queue: [], nowPlaying: null, isPlaying: false }));
      return;
    }
    window.localStorage.setItem("bh_play_queue", "[]");
    stopAudio();
  }

  function clearAttendeeRequests() {
    if (room && canControlSession) {
      persistHostState((state) => ({ ...state, requests: [] }));
      return;
    }
    window.localStorage.setItem("bh_youtube_requests", "[]");
    window.dispatchEvent(new Event("bh-playback-change"));
  }

  function resetSession() {
    if (room && canControlSession) {
      persistHostState((state) => ({ ...state, requests: [], queue: [], nowPlaying: null, isPlaying: false }));
      return;
    }
    ["bh_play_queue", "bh_youtube_requests", "bh_play_history", "bh_now_playing"].forEach((key) => window.localStorage.removeItem(key));
    stopAudio();
  }

  function handleMasterPointerDown(event: ReactPointerEvent<HTMLElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    masterDragRef.current = { startX: event.clientX, startY: event.clientY, originX: masterControlPosition.x, originY: masterControlPosition.y, moved: false };
  }

  function handleMasterPointerMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = masterDragRef.current;
    if (!drag) return;
    const distanceX = event.clientX - drag.startX;
    const distanceY = event.clientY - drag.startY;
    if (Math.hypot(distanceX, distanceY) > 5) drag.moved = true;
    if (!drag.moved) return;
    const controlWidth = isMasterPanelOpen ? Math.min(masterControlSize.width, window.innerWidth - 32) : getCollapsedControlWidth();
    const nextPosition = { x: Math.min(window.innerWidth - controlWidth - 16, Math.max(0, drag.originX + distanceX)), y: Math.min(window.innerHeight - 44, Math.max(0, drag.originY + distanceY)) };
    masterControlPositionRef.current = nextPosition;
    setMasterControlPosition(nextPosition);
  }

  function handleMasterPointerUp() {
    masterDragCompletedRef.current = Boolean(masterDragRef.current?.moved);
    if (masterDragCompletedRef.current) {
      window.localStorage.setItem("bh_masterControlPosition", JSON.stringify(masterControlPositionRef.current));
    }
    masterDragRef.current = null;
  }

  function handleMasterResizeStart(event: ReactPointerEvent<HTMLSpanElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    masterResizeRef.current = { startX: event.clientX, startY: event.clientY, width: masterControlSize.width, height: 0 };
  }

  function handleMasterResizeMove(event: ReactPointerEvent<HTMLSpanElement>) {
    const resize = masterResizeRef.current;
    if (!resize) return;
    const width = Math.min(window.innerWidth - masterControlPosition.x, Math.max(400, resize.width + event.clientX - resize.startX));
    const height = 0;
    masterControlSizeRef.current = { width, height };
    setMasterControlSize({ width, height });
  }

  function handleMasterResizeEnd() {
    if (masterResizeRef.current) window.localStorage.setItem("bh_masterControlSize", JSON.stringify(masterControlSizeRef.current));
    masterResizeRef.current = null;
  }

  useEffect(() => {
    refreshPlayback();
    const handlePlaybackChange = () => refreshPlayback();
    window.addEventListener("storage", handlePlaybackChange);
    window.addEventListener("bh-playback-change", handlePlaybackChange);
    return () => {
      window.removeEventListener("storage", handlePlaybackChange);
      window.removeEventListener("bh-playback-change", handlePlaybackChange);
    };
  }, []);

  useEffect(() => {
    if (!room) return;
    updateNowPlaying(room.state.nowPlaying || null);
    if (typeof room.state.isPlaying === "boolean") updateIsPlaying(room.state.isPlaying);
    if (room.state.settings) setMasterSettings({ ...DEFAULT_MASTER_SETTINGS, ...room.state.settings as Partial<MasterSettings> });
  }, [room]);

  useEffect(() => {
    const keepControlInViewport = () => {
      const controlWidth = getCollapsedControlWidth();
      const nextPosition = {
        x: Math.max(0, Math.min(masterControlPositionRef.current.x, window.innerWidth - controlWidth - 16)),
        y: Math.max(0, Math.min(masterControlPositionRef.current.y, window.innerHeight - 44)),
      };
      masterControlPositionRef.current = nextPosition;
      setMasterControlPosition(nextPosition);
    };

    keepControlInViewport();
    window.addEventListener("resize", keepControlInViewport);
    return () => window.removeEventListener("resize", keepControlInViewport);
  }, [isMasterPanelOpen, masterControlSize.width]);

  const sessionActivity = (() => {
    try {
      const requests = JSON.parse(window.localStorage.getItem("bh_youtube_requests") || "[]") as Array<{ upvotes?: number }>;
      const history = JSON.parse(window.localStorage.getItem("bh_play_history") || "[]") as unknown[];
      return { requests: requests.length, votes: requests.reduce((total, track) => total + (track.upvotes || 0), 0), played: history.length };
    } catch {
      return { requests: 0, votes: 0, played: 0 };
    }
  })();

  useEffect(() => {
    try {
      const savedSettings = JSON.parse(window.localStorage.getItem("bh_masterSettings") || "null") as Partial<MasterSettings> | null;
      if (savedSettings) setMasterSettings({ ...DEFAULT_MASTER_SETTINGS, ...savedSettings });
    } catch {
      setMasterSettings(DEFAULT_MASTER_SETTINGS);
    }
  }, []);

  useEffect(() => {
    try {
      const savedSize = JSON.parse(window.localStorage.getItem("bh_masterControlSize") || "null") as { width?: number; height?: number } | null;
      if (typeof savedSize?.width === "number" && typeof savedSize.height === "number") {
        const restoredSize = { width: Math.max(400, savedSize.width), height: 0 };
        masterControlSizeRef.current = restoredSize;
        setMasterControlSize(restoredSize);
      }
    } catch {
      // Use the default size when the saved value cannot be read.
    }
  }, []);

  useEffect(() => {
    try {
      setIsMasterControlEnabled(JSON.parse(window.localStorage.getItem("bh_masterControlEnabled") || "true") as boolean);
    } catch {
      setIsMasterControlEnabled(true);
    }
  }, []);

  useEffect(() => {
    const hideMasterControl = () => {
      setIsTutorialOpen(true);
      setIsMasterPanelOpen(false);
    };
    const showMasterControl = () => setIsTutorialOpen(false);
    window.addEventListener("bh-tutorial-open", hideMasterControl);
    window.addEventListener("bh-tutorial-close", showMasterControl);
    return () => {
      window.removeEventListener("bh-tutorial-open", hideMasterControl);
      window.removeEventListener("bh-tutorial-close", showMasterControl);
    };
  }, []);

  useEffect(() => {
    try {
      const savedPosition = JSON.parse(window.localStorage.getItem("bh_masterControlPosition") || "null") as { x?: number; y?: number } | null;
      if (typeof savedPosition?.x === "number" && typeof savedPosition.y === "number") {
        const restoredPosition = { x: savedPosition.x, y: savedPosition.y };
        masterControlPositionRef.current = restoredPosition;
        setMasterControlPosition(restoredPosition);
      }
    } catch {
      // Use the default position when the saved value cannot be read.
    }
  }, []);

  useEffect(() => {
    if (!nowPlaying?.videoId || !isPlaying) return;
    void playerRef.current?.play().catch(() => updateIsPlaying(false));
  }, [isPlaying, nowPlaying?.videoId]);

  return (
    <PlaybackContext.Provider value={{ nowPlaying, isPlaying, setNowPlaying, setIsPlaying: (playing) => playing ? startPlayback() : (updateIsPlaying(false), persistHostState((state) => ({ ...state, isPlaying: false }))), refreshPlayback }}>
      {children}
      {canControlSession && !isTutorialOpen && <div className="fixed z-50" style={{ left: isMasterPanelOpen ? Math.max(0, Math.min(masterControlPosition.x, window.innerWidth - Math.min(masterControlSize.width, window.innerWidth - 32) - 16)) : masterControlPosition.x, top: masterControlPosition.y }}>
        {isMasterPanelOpen && <div className="relative mb-2 w-[calc(100vw-2rem)] max-w-[440px] rounded-lg border border-yellow-400/40 bg-[#17130b]/95 p-3 shadow-[0_0_36px_rgba(234,179,8,.2)] backdrop-blur" style={{ width: `min(${masterControlSize.width}px, calc(100vw - 2rem))` }}>
          <div onPointerDown={handleMasterPointerDown} onPointerMove={handleMasterPointerMove} onPointerUp={handleMasterPointerUp} className="mb-2 flex touch-none cursor-grab items-center justify-between gap-2 active:cursor-grabbing">
            <p className="truncate text-xs font-bold text-white">{nowPlaying?.title || "No song selected"}</p>
            <button onPointerDown={(event) => event.stopPropagation()} onClick={() => setIsMasterPanelOpen(false)} aria-label="Close Omni Control" title="Close Omni Control" className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-white/10 hover:text-white">x</button>
          </div>
          {isMasterAccount && <button onClick={toggleMasterControl} role="switch" aria-checked={isMasterControlEnabled} title={isMasterControlEnabled ? "Switch to Hive User control" : "Switch to Omni Control"} className={`flex h-9 w-full items-center justify-between rounded px-3 text-xs font-bold transition-colors ${isMasterControlEnabled ? "bg-yellow-400 text-[#17130b]" : "bg-white/10 text-white"}`}>
            <span>Hive User Mode</span><span className={`h-3 w-3 rounded-full ${isMasterControlEnabled ? "bg-black" : "bg-gray-500"}`} />
          </button>}
          {isMasterAccount && room && <div className="mt-3 rounded-md border border-yellow-400/20 bg-black/30 p-2">
            <p className="text-xs font-bold text-yellow-100">Room roles</p>
            <div className="mt-2 flex gap-2"><input aria-label="Account email" value={roleEmail} onChange={(event) => setRoleEmail(event.target.value)} placeholder="account@email.com" className="min-w-0 flex-1 rounded bg-black/40 px-2 py-1 text-xs text-white" /><button onClick={() => void manageRoomHost(roleEmail, "host").then(() => { setRoleMessage("Host added"); setRoleEmail(""); }).catch((error: unknown) => setRoleMessage(error instanceof Error ? error.message : "Could not update role."))} className="rounded bg-yellow-400 px-2 text-xs font-bold text-black">Make host</button><button onClick={() => void manageRoomHost(roleEmail, "user").then(() => { setRoleMessage("Host removed"); setRoleEmail(""); }).catch((error: unknown) => setRoleMessage(error instanceof Error ? error.message : "Could not update role."))} className="rounded bg-white/10 px-2 text-xs font-bold text-white">Make user</button></div>
            {roleMessage && <p className="mt-2 text-xs text-yellow-100" role="status">{roleMessage}</p>}
          </div>}
          {isSessionControlEnabled && <>
            <div className="mt-3 rounded-md border border-yellow-400/20 bg-black/30 p-2">
              <div className="grid grid-cols-3 gap-2">
                <button onClick={playPreviousTrack} disabled={!nowPlaying} aria-label="Play previous song" title="Play previous song" className="flex h-11 items-center justify-center rounded-md bg-white/10 text-white transition-all hover:bg-yellow-400 hover:text-black disabled:opacity-40"><SkipBack size={19} fill="currentColor" /></button>
                <button onClick={() => isPlaying ? (updateIsPlaying(false), persistHostState((state) => ({ ...state, isPlaying: false }))) : startPlayback()} disabled={!nowPlaying} aria-label={isPlaying ? "Pause song" : "Play song"} title={isPlaying ? "Pause song" : "Play song"} className="flex h-11 items-center justify-center rounded-full border-2 border-yellow-200/70 bg-yellow-500 text-black shadow-[0_0_20px_rgba(234,179,8,.4)] transition-all hover:scale-105 disabled:opacity-40">{isPlaying ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button>
                <button onClick={playNextTrack} disabled={!nowPlaying} aria-label="Play next song" title="Play next song" className="flex h-11 items-center justify-center rounded-md bg-white/10 text-white transition-all hover:bg-yellow-400 hover:text-black disabled:opacity-40"><SkipForward size={19} fill="currentColor" /></button>
              </div>
              <div className="mt-2 flex items-center gap-2"><button onClick={() => setVolume(volume ? 0 : 1)} aria-label={volume ? "Mute audio" : "Unmute audio"} className="text-yellow-300">{volume ? <Volume2 size={17} /> : <VolumeX size={17} />}</button><input aria-label="Omni Control volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} className="w-full accent-yellow-400" /></div>
              <input aria-label="Seek current song" type="range" min="0" max="100" defaultValue="0" onChange={(event) => { if (playerRef.current?.duration) playerRef.current.currentTime = (Number(event.target.value) / 100) * playerRef.current.duration; }} className="mt-2 w-full accent-yellow-400" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-bold"><button onClick={() => updateMasterSettings({ requestsPaused: !masterSettings.requestsPaused })} className={`rounded p-2 ${masterSettings.requestsPaused ? "bg-amber-400 text-black" : "bg-white/10 text-white"}`}>{masterSettings.requestsPaused ? "Requests Paused" : "Pause Requests"}</button><button onClick={() => updateMasterSettings({ queueLocked: !masterSettings.queueLocked })} className={`rounded p-2 ${masterSettings.queueLocked ? "bg-amber-400 text-black" : "bg-white/10 text-white"}`}>{masterSettings.queueLocked ? "Queue Locked" : "Lock Queue"}</button><button onClick={stopAudio} className="rounded bg-red-600 p-2 text-white"><Square className="mr-1 inline" size={13} />Stop Audio</button><button onClick={clearHiveQueue} className="rounded bg-white/10 p-2 text-white hover:bg-red-600">Clear Queue</button><button onClick={clearAttendeeRequests} className="rounded bg-white/10 p-2 text-white hover:bg-red-600">Clear Requests</button><button onClick={resetSession} className="rounded bg-white/10 p-2 text-white hover:bg-red-600"><RotateCcw className="mr-1 inline" size={13} />Reset</button></div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-yellow-50"><label>Max requests<input aria-label="Maximum requests" type="number" min="1" value={masterSettings.maxRequests} onChange={(event) => updateMasterSettings({ maxRequests: Math.max(1, Number(event.target.value) || 1) })} className="mt-1 w-full rounded bg-black/40 p-1 text-white" /></label><label>Vote threshold<input aria-label="Vote threshold" type="number" min="0" value={masterSettings.voteThreshold} onChange={(event) => updateMasterSettings({ voteThreshold: Math.max(0, Number(event.target.value) || 0) })} className="mt-1 w-full rounded bg-black/40 p-1 text-white" /></label><button onClick={() => updateMasterSettings({ preventDuplicates: !masterSettings.preventDuplicates })} className="rounded bg-white/10 p-2">Duplicates: {masterSettings.preventDuplicates ? "Blocked" : "Allowed"}</button></div>
            <div className="mt-3 rounded bg-yellow-400/10 p-2 text-xs text-yellow-100"><span><Activity className="mr-1 inline" size={13} />Session activity</span><p className="mt-1">{sessionActivity.requests} requests · {sessionActivity.votes} votes · {sessionActivity.played} played · 37 attendees</p></div>
          </>}
          <span onPointerDown={handleMasterResizeStart} onPointerMove={handleMasterResizeMove} onPointerUp={handleMasterResizeEnd} aria-label="Resize Omni Control" title="Drag to resize" className="absolute bottom-0 right-0 h-4 w-4 cursor-ew-resize rounded-tl bg-white/30 hover:bg-white/60" />
        </div>}
        {!isMasterPanelOpen && <button onPointerDown={handleMasterPointerDown} onPointerMove={handleMasterPointerMove} onPointerUp={handleMasterPointerUp} onClick={(event) => { if (masterDragCompletedRef.current) { event.preventDefault(); masterDragCompletedRef.current = false; return; } setIsMasterPanelOpen(true); }} aria-label={`${sessionControlLabel} options`} title={`${sessionControlLabel} options`} aria-expanded={false} className="flex h-10 w-10 touch-none cursor-grab items-center justify-center rounded-full border border-yellow-300/70 bg-yellow-500 px-0 text-xs font-black tracking-wide text-[#17130b] shadow-[0_0_20px_rgba(234,179,8,.3)] transition-all hover:-translate-y-0.5 hover:bg-yellow-400 active:translate-y-0 active:cursor-grabbing sm:h-11 sm:w-auto sm:rounded-lg sm:px-4"><span className="sm:hidden">{isMasterAccount ? "OC" : "HS"}</span><span className="hidden sm:inline">{sessionControlLabel}</span></button>}
      </div>}
      {nowPlaying?.videoId && (
        <>
          <div aria-hidden={isVideoHidden} className={`fixed bottom-4 right-4 z-50 h-[90px] w-[160px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-white/20 bg-black shadow-2xl transition-all sm:h-[180px] sm:w-[320px] ${isVideoHidden ? "pointer-events-none translate-x-[calc(100%+1rem)] opacity-0" : ""}`}>
            <ReactPlayer
              ref={playerRef}
              src={`https://www.youtube.com/watch?v=${nowPlaying.videoId}`}
              playing={isPlaying}
              muted={isMuted}
              volume={volume}
              controls
              playsInline
              width="100%"
              height="100%"
              onPlay={() => {
                updateIsPlaying(true);
                recordPlayedTrack(nowPlaying);
              }}
              onPlaying={() => updateIsMuted(false)}
              onPause={() => updateIsPlaying(false)}
              onEnded={handleTrackEnded}
            />
          </div>
          {!isVideoHidden && <button onClick={() => setIsVideoHidden(true)} aria-label="Hide video player" title="Hide video player" className="fixed bottom-[calc(90px+1.25rem)] right-4 z-50 flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-black/85 text-white shadow-xl backdrop-blur hover:border-yellow-500 hover:text-yellow-500 sm:bottom-[calc(180px+1.25rem)] sm:h-11 sm:w-11">
            <EyeOff size={19} />
          </button>}
          {isVideoHidden && <button onClick={() => setIsVideoHidden(false)} aria-label="Show video player" title="Show video player" className="fixed bottom-4 right-4 z-50 flex h-11 w-11 items-center justify-center rounded-lg border border-white/20 bg-black/85 text-white shadow-xl backdrop-blur hover:border-yellow-500 hover:text-yellow-500">
            <Eye size={19} />
          </button>}
        </>
      )}
    </PlaybackContext.Provider>
  );
}

export function usePlayback() {
  const playback = useContext(PlaybackContext);
  if (!playback) throw new Error("usePlayback must be used within PlaybackProvider");
  return playback;
}