"use client";

import ReactPlayer from "react-player";
import { createContext, ReactNode, PointerEvent as ReactPointerEvent, useContext, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useSession } from "next-auth/react";

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
  const [nowPlaying, updateNowPlaying] = useState<NowPlayingTrack | null>(null);
  const [isPlaying, updateIsPlaying] = useState(false);
  const [isMuted, updateIsMuted] = useState(false);
  const [isVideoHidden, setIsVideoHidden] = useState(false);
  const [isMasterControlEnabled, setIsMasterControlEnabled] = useState(true);
  const [isMasterPanelOpen, setIsMasterPanelOpen] = useState(false);
  const [masterControlPosition, setMasterControlPosition] = useState({ x: 16, y: 16 });
  const [masterControlSize, setMasterControlSize] = useState({ width: 158, height: 44 });
  const playerRef = useRef<HTMLVideoElement>(null);
  const masterDragRef = useRef<{ startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const masterDragCompletedRef = useRef(false);
  const masterResizeRef = useRef<{ startX: number; startY: number; width: number; height: number } | null>(null);
  const masterControlSizeRef = useRef(masterControlSize);
  const isMasterAccount = session?.user?.email?.toLowerCase() === MASTER_CONTROL_EMAIL;

  function startPlayback() {
    updateIsMuted(true);
    updateIsPlaying(true);
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
  }

  function handleTrackEnded() {
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

  function handleMasterPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    masterDragRef.current = { startX: event.clientX, startY: event.clientY, originX: masterControlPosition.x, originY: masterControlPosition.y, moved: false };
  }

  function handleMasterPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = masterDragRef.current;
    if (!drag) return;
    const distanceX = event.clientX - drag.startX;
    const distanceY = event.clientY - drag.startY;
    if (Math.hypot(distanceX, distanceY) > 5) drag.moved = true;
    if (!drag.moved) return;
    setMasterControlPosition({ x: Math.min(window.innerWidth - 170, Math.max(0, drag.originX + distanceX)), y: Math.min(window.innerHeight - 44, Math.max(0, drag.originY + distanceY)) });
  }

  function handleMasterPointerUp() {
    masterDragCompletedRef.current = Boolean(masterDragRef.current?.moved);
    if (masterDragCompletedRef.current) {
      window.localStorage.setItem("bh_masterControlPosition", JSON.stringify(masterControlPosition));
    }
    masterDragRef.current = null;
  }

  function handleMasterResizeStart(event: ReactPointerEvent<HTMLSpanElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    masterResizeRef.current = { startX: event.clientX, startY: event.clientY, width: masterControlSize.width, height: masterControlSize.height };
  }

  function handleMasterResizeMove(event: ReactPointerEvent<HTMLSpanElement>) {
    const resize = masterResizeRef.current;
    if (!resize) return;
    const width = Math.min(window.innerWidth - masterControlPosition.x, Math.max(130, resize.width + event.clientX - resize.startX));
    const height = Math.min(window.innerHeight - masterControlPosition.y, Math.max(44, resize.height + event.clientY - resize.startY));
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
    try {
      const savedSize = JSON.parse(window.localStorage.getItem("bh_masterControlSize") || "null") as { width?: number; height?: number } | null;
      if (typeof savedSize?.width === "number" && typeof savedSize.height === "number") {
        const restoredSize = { width: savedSize.width, height: savedSize.height };
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
    try {
      const savedPosition = JSON.parse(window.localStorage.getItem("bh_masterControlPosition") || "null") as { x?: number; y?: number } | null;
      if (typeof savedPosition?.x === "number" && typeof savedPosition.y === "number") setMasterControlPosition({ x: savedPosition.x, y: savedPosition.y });
    } catch {
      // Use the default position when the saved value cannot be read.
    }
  }, []);

  useEffect(() => {
    if (!nowPlaying?.videoId || !isPlaying) return;
    void playerRef.current?.play().catch(() => updateIsPlaying(false));
  }, [isPlaying, nowPlaying?.videoId]);

  return (
    <PlaybackContext.Provider value={{ nowPlaying, isPlaying, setNowPlaying, setIsPlaying: (playing) => playing ? startPlayback() : updateIsPlaying(false), refreshPlayback }}>
      {children}
      {isMasterAccount && <div className="fixed z-50" style={{ left: masterControlPosition.x, top: masterControlPosition.y }}>
        {isMasterPanelOpen && <div className="mb-2 w-56 rounded-lg border border-white/15 bg-[#171717]/95 p-2 shadow-2xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="truncate text-xs font-bold text-white">{nowPlaying?.title || "No song selected"}</p>
            <button onClick={() => setIsMasterPanelOpen(false)} aria-label="Close master control options" title="Close master control options" className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-white/10 hover:text-white">x</button>
          </div>
          <button onClick={toggleMasterControl} role="switch" aria-checked={isMasterControlEnabled} title={isMasterControlEnabled ? "Switch to Hive User control" : "Switch to Master Control"} className={`flex h-9 w-full items-center justify-between rounded px-3 text-xs font-bold transition-colors ${isMasterControlEnabled ? "bg-yellow-500 text-black" : "bg-white/10 text-white"}`}>
            <span>Hive User Mode</span><span className={`h-3 w-3 rounded-full ${isMasterControlEnabled ? "bg-black" : "bg-gray-500"}`} />
          </button>
          {isMasterControlEnabled && <>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <button onClick={playPreviousTrack} disabled={!nowPlaying} aria-label="Play previous song" title="Play previous song" className="flex h-11 items-center justify-center rounded-md bg-white/10 text-white transition-all hover:-translate-y-0.5 hover:bg-white/20 active:translate-y-0 disabled:opacity-40"><SkipBack size={19} fill="currentColor" /></button>
              <button onClick={() => isPlaying ? updateIsPlaying(false) : startPlayback()} disabled={!nowPlaying} aria-label={isPlaying ? "Pause song" : "Play song"} title={isPlaying ? "Pause song" : "Play song"} className="flex h-11 items-center justify-center rounded-md bg-red-600 text-white shadow-lg shadow-red-600/20 transition-all hover:-translate-y-0.5 hover:bg-red-500 active:translate-y-0 disabled:opacity-40">{isPlaying ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button>
              <button onClick={playNextTrack} disabled={!nowPlaying} aria-label="Play next song" title="Play next song" className="flex h-11 items-center justify-center rounded-md bg-white/10 text-white transition-all hover:-translate-y-0.5 hover:bg-white/20 active:translate-y-0 disabled:opacity-40"><SkipForward size={19} fill="currentColor" /></button>
            </div>
          </>}
        </div>}
        {!isMasterPanelOpen && <div className="relative" style={{ width: masterControlSize.width, height: masterControlSize.height }}>
          <button onPointerDown={handleMasterPointerDown} onPointerMove={handleMasterPointerMove} onPointerUp={handleMasterPointerUp} onClick={(event) => { if (masterDragCompletedRef.current) { event.preventDefault(); masterDragCompletedRef.current = false; return; } setIsMasterPanelOpen(true); }} aria-label="Master control options" title="Master control options" aria-expanded={false} className="flex h-full w-full touch-none cursor-grab items-center justify-center rounded-lg border border-red-400/70 bg-red-600 px-4 text-xs font-black tracking-wide text-white shadow-xl transition-all hover:-translate-y-0.5 hover:bg-red-500 active:translate-y-0 active:cursor-grabbing">MASTER CONTROL</button>
          <span onPointerDown={handleMasterResizeStart} onPointerMove={handleMasterResizeMove} onPointerUp={handleMasterResizeEnd} aria-label="Resize master control" title="Drag to resize" className="absolute bottom-0 right-0 z-10 h-4 w-4 cursor-se-resize rounded-tl bg-white/30 hover:bg-white/60" />
        </div>}
      </div>}
      {nowPlaying?.videoId && (
        <>
          <div aria-hidden={isVideoHidden} className={`fixed bottom-4 right-4 z-50 h-[180px] w-[320px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-white/20 bg-black shadow-2xl transition-all ${isVideoHidden ? "pointer-events-none translate-x-[calc(100%+1rem)] opacity-0" : ""}`}>
            <ReactPlayer
              ref={playerRef}
              src={`https://www.youtube.com/watch?v=${nowPlaying.videoId}`}
              playing={isPlaying}
              muted={isMuted}
              volume={1}
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
          {!isVideoHidden && <button onClick={() => setIsVideoHidden(true)} aria-label="Hide video player" title="Hide video player" className="fixed bottom-[calc(180px+1.25rem)] right-4 z-50 flex h-11 w-11 items-center justify-center rounded-lg border border-white/20 bg-black/85 text-white shadow-xl backdrop-blur hover:border-yellow-500 hover:text-yellow-500">
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