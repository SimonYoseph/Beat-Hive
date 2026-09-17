"use client";

import ReactPlayer from "react-player";
import { createContext, ReactNode, PointerEvent as ReactPointerEvent, useContext, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Pause, Play, Settings2, SkipBack, SkipForward } from "lucide-react";
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
  const playerRef = useRef<HTMLVideoElement>(null);
  const masterDragRef = useRef<{ startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const masterDragCompletedRef = useRef(false);
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
    setMasterControlPosition({ x: Math.min(window.innerWidth - 44, Math.max(0, drag.originX + distanceX)), y: Math.min(window.innerHeight - 44, Math.max(0, drag.originY + distanceY)) });
  }

  function handleMasterPointerUp() {
    masterDragCompletedRef.current = Boolean(masterDragRef.current?.moved);
    if (masterDragCompletedRef.current) {
      window.localStorage.setItem("bh_masterControlPosition", JSON.stringify(masterControlPosition));
    }
    masterDragRef.current = null;
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
        {isMasterPanelOpen && <div className="mb-2 flex items-center gap-1 rounded-lg border border-white/15 bg-[#171717]/95 p-2 shadow-2xl backdrop-blur">
          <button onClick={toggleMasterControl} role="switch" aria-checked={isMasterControlEnabled} title={isMasterControlEnabled ? "Switch to Hive User control" : "Switch to Master Control"} className={`flex h-9 items-center gap-2 rounded px-2 text-xs font-bold transition-colors ${isMasterControlEnabled ? "bg-yellow-500 text-black" : "bg-white/10 text-white"}`}>
            {isMasterControlEnabled ? "Master Control" : "Hive User"}
          </button>
          {isMasterControlEnabled && <>
            <button onClick={playPreviousTrack} disabled={!nowPlaying} aria-label="Play previous song" title="Play previous song" className="flex h-9 w-9 items-center justify-center rounded bg-white/10 text-white hover:bg-yellow-500 hover:text-black disabled:opacity-40"><SkipBack size={17} fill="currentColor" /></button>
            <button onClick={() => isPlaying ? updateIsPlaying(false) : startPlayback()} disabled={!nowPlaying} aria-label={isPlaying ? "Pause song" : "Play song"} title={isPlaying ? "Pause song" : "Play song"} className="flex h-9 w-9 items-center justify-center rounded bg-white/10 text-white hover:bg-yellow-500 hover:text-black disabled:opacity-40">{isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
            <button onClick={playNextTrack} disabled={!nowPlaying} aria-label="Play next song" title="Play next song" className="flex h-9 w-9 items-center justify-center rounded bg-white/10 text-white hover:bg-yellow-500 hover:text-black disabled:opacity-40"><SkipForward size={17} fill="currentColor" /></button>
          </>}
        </div>}
        <button onPointerDown={handleMasterPointerDown} onPointerMove={handleMasterPointerMove} onPointerUp={handleMasterPointerUp} onClick={(event) => { if (masterDragCompletedRef.current) { event.preventDefault(); masterDragCompletedRef.current = false; return; } setIsMasterPanelOpen((open) => !open); }} aria-label="Master control options" title="Master control options" className={`flex h-11 w-11 touch-none cursor-grab items-center justify-center rounded-lg border shadow-xl transition-colors active:cursor-grabbing ${isMasterControlEnabled ? "border-yellow-500/50 bg-yellow-500 text-black hover:bg-yellow-400" : "border-white/20 bg-black/85 text-white hover:border-yellow-500"}`}><Settings2 size={19} /></button>
      </div>}
      {nowPlaying?.videoId && (
        <>
          <div aria-hidden={isVideoHidden} className={`fixed bottom-4 right-4 z-50 h-[180px] w-[320px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-white/20 bg-black shadow-2xl transition-all ${isVideoHidden ? "pointer-events-none translate-x-[calc(100%+1rem)] opacity-0" : ""}`}>
            <button onClick={() => setIsVideoHidden(true)} aria-label="Hide video player" title="Hide video player" className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded bg-black/70 text-white hover:bg-black hover:text-yellow-500">
              <EyeOff size={16} />
            </button>
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