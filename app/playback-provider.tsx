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
type QueuedFallbackTrack = NowPlayingTrack & { videoId: string };

type SearchTrack = { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; thumbnails?: { medium?: { url?: string }; default?: { url?: string } } } };

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
const PLAYER_MIN_TOP = 180;

function formatPlaybackTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const roundedSeconds = Math.floor(seconds);
  return `${Math.floor(roundedSeconds / 60)}:${String(roundedSeconds % 60).padStart(2, "0")}`;
}

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
  const [hasRestoredPlayback, setHasRestoredPlayback] = useState(false);
  const [isMuted, updateIsMuted] = useState(false);
  const [isVideoHidden, setIsVideoHidden] = useState(false);
  const [volume, setVolume] = useState(1);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [trackDuration, setTrackDuration] = useState(0);
  const [transitionGain, setTransitionGain] = useState(1);
  const [isFindingFallbackTrack, setIsFindingFallbackTrack] = useState(false);
  const [isMasterControlEnabled, setIsMasterControlEnabled] = useState(true);
  const [roleEmail, setRoleEmail] = useState("");
  const [roleMessage, setRoleMessage] = useState("");
  const [isMasterPanelOpen, setIsMasterPanelOpen] = useState(false);
  const [omniSection, setOmniSection] = useState<"deck" | "queue" | "session" | "access">("deck");
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [masterControlPosition, setMasterControlPosition] = useState({ x: 16, y: 16 });
  const [masterControlSize, setMasterControlSize] = useState({ width: 440, height: 0 });
  const [playerPosition, setPlayerPosition] = useState({ x: 16, y: PLAYER_MIN_TOP });
  const [masterSettings, setMasterSettings] = useState<MasterSettings>(DEFAULT_MASTER_SETTINGS);
  const playerRef = useRef<HTMLVideoElement>(null);
  const transitionGainRef = useRef(1);
  const transitionFrameRef = useRef<number | null>(null);
  const isTransitioningRef = useRef(false);
  const fallbackForTrackRef = useRef<string | null>(null);
  const masterDragRef = useRef<{ startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const masterDragCompletedRef = useRef(false);
  const masterResizeRef = useRef<{ startX: number; startY: number; width: number; height: number } | null>(null);
  const masterControlSizeRef = useRef(masterControlSize);
  const masterControlPositionRef = useRef(masterControlPosition);
  const playerPositionRef = useRef(playerPosition);
  const playerDragRef = useRef<{ startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const playerDragCompletedRef = useRef(false);
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
    const savedTrack = readNowPlaying();
    updateNowPlaying(savedTrack);
    if (savedTrack?.videoId && window.localStorage.getItem("bh_isPlaying") === "true") updateIsPlaying(true);
    setHasRestoredPlayback(true);
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

  function selectedVibe() {
    const roomVibe = room?.state.feedback?.selectedVibe;
    if (typeof roomVibe === "string" && roomVibe.trim()) return roomVibe.trim();
    try {
      const storedVibe = JSON.parse(window.localStorage.getItem("bh_selectedVibe") || "null");
      return typeof storedVibe === "string" ? storedVibe : "";
    } catch {
      return "";
    }
  }

  function ensureFallbackTrack(currentTrack: NowPlayingTrack) {
    if (!currentTrack.videoId || !canControlSession || fallbackForTrackRef.current === currentTrack.videoId) return;
    const queue = room?.state.queue || (() => {
      try { return JSON.parse(window.localStorage.getItem("bh_play_queue") || "[]") as NowPlayingTrack[]; } catch { return []; }
    })();
    const currentIndex = queue.findIndex((track) => track.videoId === currentTrack.videoId);
    if (currentIndex < 0 || currentIndex < queue.length - 1) return;

    fallbackForTrackRef.current = currentTrack.videoId;
    setIsFindingFallbackTrack(true);
    const vibe = selectedVibe();
    const query = vibe ? `${vibe} party music` : `${currentTrack.channelTitle} ${currentTrack.title} similar music`;
    void fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`).then(async (response) => {
      if (!response.ok) throw new Error("Could not find a matching track.");
      const data = await response.json() as { items?: SearchTrack[] };
      const match = data.items?.find((item) => item.id?.videoId && item.id.videoId !== currentTrack.videoId && item.snippet?.title && item.snippet.channelTitle);
      if (!match?.id?.videoId || !match.snippet?.title || !match.snippet.channelTitle) return;
      const fallbackTrack: QueuedFallbackTrack = { videoId: match.id.videoId, title: match.snippet.title, channelTitle: match.snippet.channelTitle, thumbnail: match.snippet.thumbnails?.medium?.url || match.snippet.thumbnails?.default?.url };
      if (room) {
        persistHostState((state) => {
          const currentQueue = state.queue || [];
          const latestIndex = currentQueue.findIndex((track) => track.videoId === currentTrack.videoId);
          return latestIndex >= 0 && latestIndex === currentQueue.length - 1 ? { ...state, queue: [...currentQueue, fallbackTrack] } : state;
        });
      } else {
        const latestQueue = JSON.parse(window.localStorage.getItem("bh_play_queue") || "[]") as NowPlayingTrack[];
        if (!latestQueue.some((track) => track.videoId === fallbackTrack.videoId)) window.localStorage.setItem("bh_play_queue", JSON.stringify([...latestQueue, fallbackTrack]));
        window.dispatchEvent(new Event("bh-playback-change"));
      }
    }).catch(() => undefined).finally(() => setIsFindingFallbackTrack(false));
  }

  function fadeTo(gain: number, duration: number) {
    if (transitionFrameRef.current !== null) cancelAnimationFrame(transitionFrameRef.current);
    const initialGain = transitionGainRef.current;
    const startedAt = performance.now();
    return new Promise<void>((resolve) => {
      const step = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const nextGain = initialGain + (gain - initialGain) * progress;
        transitionGainRef.current = nextGain;
        setTransitionGain(nextGain);
        if (progress < 1) transitionFrameRef.current = requestAnimationFrame(step);
        else {
          transitionFrameRef.current = null;
          resolve();
        }
      };
      transitionFrameRef.current = requestAnimationFrame(step);
    });
  }

  async function transitionToTrack(track: NowPlayingTrack, updateRoom: () => void) {
    if (isTransitioningRef.current || track.videoId === nowPlaying?.videoId) return;
    isTransitioningRef.current = true;
    await fadeTo(0, 280);
    updateNowPlaying(track);
    window.localStorage.setItem("bh_now_playing", JSON.stringify(track));
    updateIsPlaying(true);
    updateRoom();
    await fadeTo(1, 650);
    isTransitioningRef.current = false;
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
      if (previousTrack) void transitionToTrack(previousTrack, () => persistHostState((state) => ({ ...state, nowPlaying: previousTrack, isPlaying: true })));
      return;
    }
    try {
      const history = JSON.parse(window.localStorage.getItem("bh_play_history") || "[]") as NowPlayingTrack[];
      const previousTrack = history.filter((track) => track.videoId !== nowPlaying?.videoId).at(-1);
      if (!previousTrack) return;
      void transitionToTrack(previousTrack, () => window.dispatchEvent(new Event("bh-playback-change")));
    } catch {
      // Keep the current track active if playback history cannot be read.
    }
  }

  function playNextTrack() {
    if (room && canControlSession) {
      const queue = room.state.queue || [];
      const currentIndex = queue.findIndex((track) => track.videoId === nowPlaying?.videoId);
      const nextTrack = queue[currentIndex + 1];
      if (nextTrack) void transitionToTrack(nextTrack, () => persistHostState((state) => ({ ...state, nowPlaying: nextTrack, isPlaying: true })));
      return;
    }
    try {
      const queue = JSON.parse(window.localStorage.getItem("bh_play_queue") || "[]") as NowPlayingTrack[];
      const currentIndex = queue.findIndex((track) => track.videoId === nowPlaying?.videoId);
      const nextTrack = queue[currentIndex + 1];
      if (!nextTrack) return;
      void transitionToTrack(nextTrack, () => window.dispatchEvent(new Event("bh-playback-change")));
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

  function getPlayerDimensions(hidden = isVideoHidden) {
    const compactPlayer = window.innerWidth < 640;
    if (hidden) return { width: compactPlayer ? 36 : 44, height: compactPlayer ? 36 : 44, controlHeight: 0 };
    return { width: compactPlayer ? Math.min(160, window.innerWidth - 32) : 320, height: compactPlayer ? 90 : 180, controlHeight: compactPlayer ? 40 : 48 };
  }

  function constrainPlayerPosition(position: { x: number; y: number }, dimensions = getPlayerDimensions()) {
    const { width, height, controlHeight } = dimensions;
    return {
      x: Math.max(16, Math.min(position.x, window.innerWidth - width - 16)),
      y: Math.max(PLAYER_MIN_TOP, Math.min(position.y, Math.max(PLAYER_MIN_TOP, window.innerHeight - height - controlHeight - 16))),
    };
  }

  function handlePlayerPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    playerDragRef.current = { startX: event.clientX, startY: event.clientY, originX: playerPosition.x, originY: playerPosition.y, moved: false };
  }

  function handlePlayerPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = playerDragRef.current;
    if (!drag) return;
    const distanceX = event.clientX - drag.startX;
    const distanceY = event.clientY - drag.startY;
    if (Math.hypot(distanceX, distanceY) > 5) drag.moved = true;
    if (!drag.moved) return;
    const nextPosition = constrainPlayerPosition({ x: drag.originX + distanceX, y: drag.originY + distanceY });
    playerPositionRef.current = nextPosition;
    setPlayerPosition(nextPosition);
  }

  function handlePlayerPointerUp() {
    playerDragCompletedRef.current = Boolean(playerDragRef.current?.moved);
    if (playerDragCompletedRef.current) window.localStorage.setItem("bh_videoPlayerPosition", JSON.stringify(playerPositionRef.current));
    playerDragRef.current = null;
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
    if (!hasRestoredPlayback) return;
    window.localStorage.setItem("bh_isPlaying", JSON.stringify(isPlaying));
  }, [hasRestoredPlayback, isPlaying]);

  useEffect(() => {
    const restoreAfterBackground = () => {
      if (document.visibilityState === "visible") refreshPlayback();
    };
    document.addEventListener("visibilitychange", restoreAfterBackground);
    window.addEventListener("pageshow", restoreAfterBackground);
    return () => {
      document.removeEventListener("visibilitychange", restoreAfterBackground);
      window.removeEventListener("pageshow", restoreAfterBackground);
    };
  }, []);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = nowPlaying ? new MediaMetadata({ title: nowPlaying.title, artist: nowPlaying.channelTitle, artwork: nowPlaying.thumbnail ? [{ src: nowPlaying.thumbnail }] : [] }) : null;
    navigator.mediaSession.setActionHandler("play", startPlayback);
    navigator.mediaSession.setActionHandler("pause", () => updateIsPlaying(false));
    navigator.mediaSession.setActionHandler("nexttrack", playNextTrack);
    navigator.mediaSession.setActionHandler("previoustrack", playPreviousTrack);
  }, [nowPlaying, isPlaying]);

  useEffect(() => () => {
    if (transitionFrameRef.current !== null) cancelAnimationFrame(transitionFrameRef.current);
  }, []);

  useEffect(() => {
    if (!room) return;
    updateNowPlaying(room.state.nowPlaying || null);
    if (typeof room.state.isPlaying === "boolean") updateIsPlaying(room.state.isPlaying);
    if (room.state.settings) setMasterSettings({ ...DEFAULT_MASTER_SETTINGS, ...room.state.settings as Partial<MasterSettings> });
  }, [room]);

  useEffect(() => {
    setElapsedTime(0);
    setTrackDuration(0);
  }, [nowPlaying?.videoId]);

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

  useEffect(() => {
    try {
      const savedPosition = JSON.parse(window.localStorage.getItem("bh_videoPlayerPosition") || "null") as { x?: number; y?: number } | null;
      const defaultPosition = { x: window.innerWidth - getPlayerDimensions().width - 16, y: window.innerHeight - getPlayerDimensions().height - getPlayerDimensions().controlHeight - 16 };
      const storedPosition = typeof savedPosition?.x === "number" && typeof savedPosition.y === "number" ? { x: savedPosition.x, y: savedPosition.y } : defaultPosition;
      const restoredPosition = constrainPlayerPosition(storedPosition);
      playerPositionRef.current = restoredPosition;
      setPlayerPosition(restoredPosition);
    } catch {
      // Keep the default player position when the saved value cannot be read.
    }
  }, []);

  useEffect(() => {
    const keepPlayerInViewport = () => {
      const nextPosition = constrainPlayerPosition(playerPositionRef.current);
      playerPositionRef.current = nextPosition;
      setPlayerPosition(nextPosition);
    };
    window.addEventListener("resize", keepPlayerInViewport);
    return () => window.removeEventListener("resize", keepPlayerInViewport);
  }, []);

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
        {isMasterPanelOpen && <div className="relative mb-2 w-[calc(100vw-2rem)] max-w-[440px] overflow-hidden rounded-[32px] border border-yellow-400/40 bg-[#17130b]/95 p-4 shadow-[0_0_50px_rgba(234,179,8,.25)] backdrop-blur" style={{ width: `min(${masterControlSize.width}px, calc(100vw - 2rem))` }}>
          <div onPointerDown={handleMasterPointerDown} onPointerMove={handleMasterPointerMove} onPointerUp={handleMasterPointerUp} className="relative mb-4 flex touch-none cursor-grab items-center justify-between gap-2 active:cursor-grabbing">
            <div><p className="text-[10px] font-black tracking-[0.2em] text-yellow-300">{sessionControlLabel}</p><p className="max-w-72 truncate text-sm font-bold text-white">{nowPlaying?.title || "No song selected"}</p></div>
            <button onPointerDown={(event) => event.stopPropagation()} onClick={() => setIsMasterPanelOpen(false)} aria-label="Close Omni Control" title="Close Omni Control" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/30 text-gray-400 transition-colors hover:bg-white/10 hover:text-white">x</button>
          </div>
          <div className="relative grid grid-cols-4 gap-1">
            {(["deck", "queue", "session", "access"] as const).filter((section) => section !== "access" || isMasterAccount).map((section) => <button key={section} type="button" onClick={() => setOmniSection(section)} className={`border-b-2 py-2 text-[10px] font-black uppercase tracking-wide transition-colors ${omniSection === section ? "border-yellow-400 text-yellow-300" : "border-transparent text-yellow-100/70 hover:text-yellow-100"}`}>{section}</button>)}
          </div>
          {isSessionControlEnabled && omniSection === "deck" && <div className="relative mt-4 rounded-[24px] border border-yellow-400/20 bg-black/30 p-3">
              <div className="grid grid-cols-3 gap-2">
                <button onClick={playPreviousTrack} disabled={!nowPlaying} aria-label="Play previous song" title="Play previous song" className="flex h-11 items-center justify-center rounded-md bg-white/10 text-white transition-all hover:bg-yellow-400 hover:text-black disabled:opacity-40"><SkipBack size={19} fill="currentColor" /></button>
                <button onClick={() => isPlaying ? (updateIsPlaying(false), persistHostState((state) => ({ ...state, isPlaying: false }))) : startPlayback()} disabled={!nowPlaying} aria-label={isPlaying ? "Pause song" : "Play song"} title={isPlaying ? "Pause song" : "Play song"} className="flex h-11 items-center justify-center rounded-full border-2 border-yellow-200/70 bg-yellow-500 text-black shadow-[0_0_20px_rgba(234,179,8,.4)] transition-all hover:scale-105 disabled:opacity-40">{isPlaying ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button>
                <button onClick={playNextTrack} disabled={!nowPlaying} aria-label="Play next song" title="Play next song" className="flex h-11 items-center justify-center rounded-md bg-white/10 text-white transition-all hover:bg-yellow-400 hover:text-black disabled:opacity-40"><SkipForward size={19} fill="currentColor" /></button>
              </div>
              <div className="mt-2 flex items-center gap-2"><button onClick={() => setVolume(volume ? 0 : 1)} aria-label={volume ? "Mute audio" : "Unmute audio"} className="text-yellow-300">{volume ? <Volume2 size={17} /> : <VolumeX size={17} />}</button><input aria-label="Omni Control volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} className="w-full accent-yellow-400" /></div>
              <div className="mt-2"><div className="mb-1 flex justify-between text-[10px] font-bold tabular-nums text-yellow-100"><span>{formatPlaybackTime(elapsedTime)}</span><span>{formatPlaybackTime(trackDuration)}</span></div><input aria-label="Seek current song" aria-valuetext={`${formatPlaybackTime(elapsedTime)} of ${formatPlaybackTime(trackDuration)}`} type="range" min="0" max={trackDuration || 0} step="1" value={Math.min(elapsedTime, trackDuration)} disabled={trackDuration <= 0} onChange={(event) => { const nextTime = Number(event.target.value); if (playerRef.current?.duration) playerRef.current.currentTime = nextTime; setElapsedTime(nextTime); }} className="w-full accent-yellow-400 disabled:opacity-40" /></div>
          </div>}
          {isSessionControlEnabled && omniSection === "queue" && <div className="relative mt-4 grid grid-cols-2 gap-2 text-xs font-bold"><button onClick={() => updateMasterSettings({ requestsPaused: !masterSettings.requestsPaused })} className={`rounded-xl p-3 ${masterSettings.requestsPaused ? "bg-amber-400 text-black" : "bg-white/10 text-white"}`}>{masterSettings.requestsPaused ? "Requests Paused" : "Pause Requests"}</button><button onClick={() => updateMasterSettings({ queueLocked: !masterSettings.queueLocked })} className={`rounded-xl p-3 ${masterSettings.queueLocked ? "bg-amber-400 text-black" : "bg-white/10 text-white"}`}>{masterSettings.queueLocked ? "Queue Locked" : "Lock Queue"}</button><button onClick={clearHiveQueue} className="rounded-xl bg-white/10 p-3 text-white hover:bg-red-600">Clear Queue</button><button onClick={clearAttendeeRequests} className="rounded-xl bg-white/10 p-3 text-white hover:bg-red-600">Clear Requests</button><button onClick={resetSession} className="col-span-2 rounded-xl bg-white/10 p-3 text-white hover:bg-red-600"><RotateCcw className="mr-1 inline" size={13} />Reset Session</button></div>}
          {isSessionControlEnabled && omniSection === "session" && <div className="relative mt-4 space-y-3"><button onClick={stopAudio} className="w-full rounded-2xl bg-red-600 p-3 text-sm font-black text-white"><Square className="mr-1 inline" size={14} />Stop Audio</button><div className="grid grid-cols-2 gap-2 text-xs text-yellow-50"><label>Max requests<input aria-label="Maximum requests" type="number" min="1" value={masterSettings.maxRequests} onChange={(event) => updateMasterSettings({ maxRequests: Math.max(1, Number(event.target.value) || 1) })} className="mt-1 w-full rounded-lg bg-black/40 p-2 text-white" /></label><label>Vote threshold<input aria-label="Vote threshold" type="number" min="0" value={masterSettings.voteThreshold} onChange={(event) => updateMasterSettings({ voteThreshold: Math.max(0, Number(event.target.value) || 0) })} className="mt-1 w-full rounded-lg bg-black/40 p-2 text-white" /></label></div><button onClick={() => updateMasterSettings({ preventDuplicates: !masterSettings.preventDuplicates })} className="w-full rounded-xl bg-white/10 p-3 text-xs font-bold text-white">Duplicates: {masterSettings.preventDuplicates ? "Blocked" : "Allowed"}</button><div className="rounded-2xl bg-yellow-400/10 p-3 text-xs text-yellow-100"><Activity className="mr-1 inline" size={13} />{sessionActivity.requests} requests · {sessionActivity.votes} votes · {sessionActivity.played} played · 37 attendees</div></div>}
          {isMasterAccount && omniSection === "access" && <div className="relative mt-4 space-y-3"><button onClick={toggleMasterControl} role="switch" aria-checked={isMasterControlEnabled} title={isMasterControlEnabled ? "Switch to Hive User control" : "Switch to Omni Control"} className={`flex h-11 w-full items-center justify-between rounded-full px-4 text-xs font-bold ${isMasterControlEnabled ? "bg-yellow-400 text-[#17130b]" : "bg-white/10 text-white"}`}><span>Hive User Mode</span><span className={`h-3 w-3 rounded-full ${isMasterControlEnabled ? "bg-black" : "bg-gray-500"}`} /></button>{room && <div className="rounded-2xl border border-yellow-400/20 bg-black/30 p-3"><p className="text-xs font-bold text-yellow-100">Room roles</p><div className="mt-2 flex gap-2"><input aria-label="Account email" value={roleEmail} onChange={(event) => setRoleEmail(event.target.value)} placeholder="account@email.com" className="min-w-0 flex-1 rounded-lg bg-black/40 px-2 py-2 text-xs text-white" /><button onClick={() => void manageRoomHost(roleEmail, "host").then(() => { setRoleMessage("Host added"); setRoleEmail(""); }).catch((error: unknown) => setRoleMessage(error instanceof Error ? error.message : "Could not update role."))} className="rounded-lg bg-yellow-400 px-2 text-xs font-bold text-black">Host</button><button onClick={() => void manageRoomHost(roleEmail, "user").then(() => { setRoleMessage("Host removed"); setRoleEmail(""); }).catch((error: unknown) => setRoleMessage(error instanceof Error ? error.message : "Could not update role."))} className="rounded-lg bg-white/10 px-2 text-xs font-bold text-white">User</button></div>{roleMessage && <p className="mt-2 text-xs text-yellow-100" role="status">{roleMessage}</p>}</div>}</div>}
          <span onPointerDown={handleMasterResizeStart} onPointerMove={handleMasterResizeMove} onPointerUp={handleMasterResizeEnd} aria-label="Resize Omni Control" title="Drag to resize" className="absolute bottom-0 right-0 h-4 w-4 cursor-ew-resize rounded-tl bg-white/30 hover:bg-white/60" />
        </div>}
        {!isMasterPanelOpen && <button onPointerDown={handleMasterPointerDown} onPointerMove={handleMasterPointerMove} onPointerUp={handleMasterPointerUp} onClick={(event) => { if (masterDragCompletedRef.current) { event.preventDefault(); masterDragCompletedRef.current = false; return; } setIsMasterPanelOpen(true); }} aria-label={`${sessionControlLabel} options`} title={`${sessionControlLabel} options`} aria-expanded={false} className="flex h-10 w-10 touch-none cursor-grab items-center justify-center rounded-full border border-yellow-300/70 bg-yellow-500 px-0 text-xs font-black tracking-wide text-[#17130b] shadow-[0_0_20px_rgba(234,179,8,.3)] transition-all hover:-translate-y-0.5 hover:bg-yellow-400 active:translate-y-0 active:cursor-grabbing sm:h-11 sm:w-auto sm:rounded-lg sm:px-4"><span className="sm:hidden">{isMasterAccount ? "OC" : "HS"}</span><span className="hidden sm:inline">{sessionControlLabel}</span></button>}
      </div>}
      {nowPlaying?.videoId && (
        <div className="fixed z-50" style={{ left: playerPosition.x, top: playerPosition.y }}>
          {!isVideoHidden && <div className="relative pt-10 sm:pt-12">
            <button onPointerDown={handlePlayerPointerDown} onPointerMove={handlePlayerPointerMove} onPointerUp={handlePlayerPointerUp} onClick={(event) => { if (playerDragCompletedRef.current) { event.preventDefault(); playerDragCompletedRef.current = false; return; } setIsVideoHidden(true); }} aria-label="Hide video player" title="Drag to move. Tap to hide video player" className="absolute right-0 top-0 flex h-9 w-9 touch-none cursor-grab items-center justify-center rounded-lg border border-white/20 bg-black/85 text-white shadow-xl backdrop-blur hover:border-yellow-500 hover:text-yellow-500 active:cursor-grabbing sm:h-11 sm:w-11">
              <EyeOff size={19} />
            </button>
            <div aria-hidden={false} className="h-[90px] w-[160px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-white/20 bg-black shadow-2xl sm:h-[180px] sm:w-[320px]">
            <ReactPlayer
              ref={playerRef}
              src={`https://www.youtube.com/watch?v=${nowPlaying.videoId}`}
              playing={isPlaying}
              loop={isFindingFallbackTrack}
              muted={isMuted}
              volume={volume * transitionGain}
              controls
              playsInline
              width="100%"
              height="100%"
              onPlay={() => {
                updateIsPlaying(true);
                recordPlayedTrack(nowPlaying);
              }}
              onPlaying={() => updateIsMuted(false)}
              onPause={() => { if (!isTransitioningRef.current) updateIsPlaying(false); }}
              onEnded={handleTrackEnded}
              onTimeUpdate={(event) => {
                const player = event.currentTarget;
                if (Number.isFinite(player.duration)) setTrackDuration(player.duration);
                setElapsedTime(player.currentTime);
                if (player.duration - player.currentTime <= 12) ensureFallbackTrack(nowPlaying);
              }}
              onLoadedMetadata={(event) => setTrackDuration(event.currentTarget.duration)}
            />
          </div>
          </div>}
          {isVideoHidden && <button onPointerDown={handlePlayerPointerDown} onPointerMove={handlePlayerPointerMove} onPointerUp={handlePlayerPointerUp} onClick={(event) => { if (playerDragCompletedRef.current) { event.preventDefault(); playerDragCompletedRef.current = false; return; } const nextPosition = constrainPlayerPosition(playerPositionRef.current, getPlayerDimensions(false)); playerPositionRef.current = nextPosition; setPlayerPosition(nextPosition); window.localStorage.setItem("bh_videoPlayerPosition", JSON.stringify(nextPosition)); setIsVideoHidden(false); }} aria-label="Show video player" title="Drag to move. Tap to show video player" className="flex h-9 w-9 touch-none cursor-grab items-center justify-center rounded-lg border border-white/20 bg-black/85 text-white shadow-xl backdrop-blur hover:border-yellow-500 hover:text-yellow-500 active:cursor-grabbing sm:h-11 sm:w-11">
            <Eye size={19} />
          </button>}
        </div>
      )}
    </PlaybackContext.Provider>
  );
}

export function usePlayback() {
  const playback = useContext(PlaybackContext);
  if (!playback) throw new Error("usePlayback must be used within PlaybackProvider");
  return playback;
}