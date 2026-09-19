"use client";

import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, ArrowUp, ChevronDown, ChevronUp, History, ListMusic, LoaderCircle, Menu, Music2, Play, Plus, Search, ThumbsUp, Trash2 } from "lucide-react";
import NextLink from "next/link";
import { signIn, useSession } from "next-auth/react";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { usePlayback } from "../playback-provider";
import { useRoom } from "../room-provider";

const MASTER_CONTROL_EMAIL = "simon97862012@gmail.com";

type SearchResult = {
  id: { videoId: string };
  snippet: { title: string; channelTitle: string; thumbnails: { medium?: { url: string }; default?: { url: string } } };
};

type QueuedTrack = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail?: string;
};

type RequestedTrack = QueuedTrack & {
  upvotes: number;
};

type MasterSettings = {
  requestsPaused: boolean;
  queueLocked: boolean;
  maxRequests: number;
  preventDuplicates: boolean;
  voteThreshold: number;
};

const DEFAULT_MASTER_SETTINGS: MasterSettings = { requestsPaused: false, queueLocked: false, maxRequests: 20, preventDuplicates: true, voteThreshold: 0 };

function toQueuedTrack(track: SearchResult): QueuedTrack {
  return {
    videoId: track.id.videoId,
    title: track.snippet.title,
    channelTitle: track.snippet.channelTitle,
    thumbnail: track.snippet.thumbnails.medium?.url || track.snippet.thumbnails.default?.url,
  };
}

type QueueTrackItemProps = {
  track: RequestedTrack;
  index: number;
  isPlaying: boolean;
  canReorder: boolean;
  canRemove: boolean;
  canControlPlayback: boolean;
  showUpvoteCount: boolean;
  pendingAction: boolean;
  onRemove: (videoId: string) => void;
  onUpvote: (videoId: string) => void;
  onPlayNow: (track: RequestedTrack) => void;
  onMoveToTop: (videoId: string) => void;
};

function QueueTrackItem({ track, index, isPlaying, canReorder, canRemove, canControlPlayback, showUpvoteCount, pendingAction, onRemove, onUpvote, onPlayNow, onMoveToTop }: QueueTrackItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: track.videoId,
    disabled: !canReorder,
  });

  return (
    <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition: isDragging ? undefined : transition }} className={`grid min-w-0 grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-2 gap-y-2 rounded-lg bg-[#1b1b1b] p-2 will-change-transform ${isDragging ? "opacity-40" : ""}`}>
      <span className="row-span-2 self-center w-4 text-center text-xs font-bold text-yellow-500">{index + 1}</span>
      <div className="col-start-2 flex min-w-0 items-center gap-2">
        {track.thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.thumbnail} alt="" className="h-9 w-12 shrink-0 rounded object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold">{track.title}</h3>
          <p className="truncate text-xs text-gray-400">{track.channelTitle}</p>
        </div>
      </div>
      <div className="col-span-2 flex w-full flex-col items-end gap-1">
        {isPlaying && <span className="inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-bold text-red-400"><span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,.9)]" />Now Playing</span>}
        <div className="relative z-[60] flex w-full flex-wrap justify-end gap-1">
          {canControlPlayback && <button onClick={() => onPlayNow(track)} disabled={pendingAction} className="flex h-7 w-7 items-center justify-center rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-400 hover:text-black disabled:cursor-wait disabled:opacity-50" aria-label={`Play ${track.title} now`} title="Play now"><Play size={14} fill="currentColor" /></button>}
          {canControlPlayback && <button onClick={() => onMoveToTop(track.videoId)} disabled={pendingAction} className="flex h-7 w-7 items-center justify-center rounded bg-white/5 text-gray-300 hover:bg-emerald-400 hover:text-black disabled:cursor-wait disabled:opacity-50" aria-label={`Move ${track.title} to top of queue`} title="Move to top"><ArrowUp size={14} /></button>}
          <button onClick={() => onUpvote(track.videoId)} disabled={pendingAction} className={`flex h-7 items-center justify-center rounded bg-white/5 text-xs text-gray-300 hover:bg-yellow-500 hover:text-black disabled:cursor-wait disabled:opacity-50 ${showUpvoteCount ? "gap-0.5 px-1.5" : "w-7"}`} aria-label={`Upvote ${track.title}`} title="Upvote">
            <ThumbsUp size={14} /> {showUpvoteCount && track.upvotes}
          </button>
          {canReorder && (
            <button type="button" disabled={pendingAction} className="flex h-7 w-7 touch-none cursor-grab items-center justify-center rounded bg-white/5 text-gray-300 hover:bg-yellow-500 hover:text-black active:cursor-grabbing disabled:cursor-wait disabled:opacity-50" aria-label={`Drag ${track.title} to reorder`} title="Drag to reorder" {...attributes} {...listeners}>
              <Menu size={16} />
            </button>
          )}
          {canRemove && <button onClick={() => onRemove(track.videoId)} disabled={pendingAction} className="flex h-7 w-7 items-center justify-center rounded bg-white/5 text-gray-400 hover:bg-red-500 hover:text-white disabled:cursor-wait disabled:opacity-50" aria-label={`Remove ${track.title} from queue`} title="Remove from queue">
            <Trash2 size={13} />
          </button>}
        </div>
      </div>
    </article>
  );
}

function RequestTrackItem({ track, canAddToHiveQueue, pendingAction, onAddToHiveQueue, onRemove }: { track: RequestedTrack; canAddToHiveQueue: boolean; pendingAction: boolean; onAddToHiveQueue: (track: RequestedTrack) => void; onRemove: (videoId: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `request-${track.videoId}` });

  return (
    <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition: isDragging ? undefined : transition }} className={`flex min-w-0 items-center gap-2 rounded-lg bg-[#1b1b1b] p-2 will-change-transform sm:p-3 ${isDragging ? "opacity-40" : ""}`}>
      <div className="min-w-0 flex-1"><h4 className="truncate text-sm font-bold sm:text-base">{track.title}</h4><p className="truncate text-xs text-gray-400 sm:text-sm">{track.channelTitle}</p></div>
      {canAddToHiveQueue && <button onClick={() => onAddToHiveQueue(track)} disabled={pendingAction} className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-400 hover:text-black disabled:cursor-wait disabled:opacity-50 sm:h-8 sm:w-8" aria-label={`Add ${track.title} to Hive Queue`} title="Add to Hive Queue"><Plus size={17} /></button>}
      <button type="button" className="flex h-7 w-7 touch-none cursor-grab items-center justify-center rounded bg-white/5 text-gray-300 hover:bg-yellow-500 hover:text-black active:cursor-grabbing sm:h-8 sm:w-8" aria-label={`Drag ${track.title} to reorder`} title="Drag to reorder" {...attributes} {...listeners}><Menu size={16} /></button>
      <button onClick={() => onRemove(track.videoId)} className="flex h-7 w-7 items-center justify-center rounded bg-white/5 text-gray-400 hover:bg-red-500 hover:text-white sm:h-8 sm:w-8" aria-label={`Remove ${track.title} from requests`} title="Remove request"><Trash2 size={13} /></button>
    </article>
  );
}

function HiveQueueDropZone({ children }: { children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: "hive-queue" });

  return <div ref={setNodeRef} className={`rounded-lg transition-colors ${isOver ? "bg-yellow-500/10" : ""}`}>{children}</div>;
}

function PersonalQueueDropZone({ children }: { children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: "personal-queue" });

  return <div ref={setNodeRef} className={`rounded-lg transition-colors ${isOver ? "bg-yellow-500/10" : ""}`}>{children}</div>;
}

function DragTrackOverlay({ track }: { track: RequestedTrack }) {
  return <div className="flex w-72 items-center gap-3 rounded-lg border border-yellow-500/60 bg-[#202020] p-3 text-white shadow-2xl"><Menu size={18} className="text-yellow-500" /><div className="min-w-0"><p className="truncate font-bold">{track.title}</p><p className="truncate text-sm text-gray-400">{track.channelTitle}</p></div></div>;
}

export default function YoutubePage() {
  const { data: session, status } = useSession();
  const { nowPlaying, isPlaying, setIsPlaying, setNowPlaying } = usePlayback();
  const { room, requestTrack, updateHostState, voteForTrack } = useRoom();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [areSuggestionsDismissed, setAreSuggestionsDismissed] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [queueingId, setQueueingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [requestTracks, setRequestTracks] = useState<RequestedTrack[]>([]);
  const [playQueue, setPlayQueue] = useState<RequestedTrack[]>([]);
  const [playedTracks, setPlayedTracks] = useState<QueuedTrack[]>([]);
  const [nowPlayingId, setNowPlayingId] = useState<string | null>(null);
  const [isQueueCollapsed, setIsQueueCollapsed] = useState(false);
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(true);
  const [isHost, setIsHost] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [isMasterControlEnabled, setIsMasterControlEnabled] = useState(true);
  const [pendingTrackActionId, setPendingTrackActionId] = useState<string | null>(null);
  const pendingTrackActionRef = useRef<string | null>(null);
  const [masterSettings, setMasterSettings] = useState<MasterSettings>(DEFAULT_MASTER_SETTINGS);
  const isMasterAccount = session?.user?.email?.toLowerCase() === MASTER_CONTROL_EMAIL && isMasterControlEnabled;
  const canManageQueue = isMasterAccount || isHost;
  const canPromoteRequests = isMasterAccount;
  const searchFormRef = useRef<HTMLFormElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    setIsHost(window.localStorage.getItem("bh_userRole") === '"dj"');
  }, []);

  useEffect(() => {
    const loadMasterSettings = () => {
      try {
        setMasterSettings({ ...DEFAULT_MASTER_SETTINGS, ...(JSON.parse(window.localStorage.getItem("bh_masterSettings") || "{}") as Partial<MasterSettings>) });
      } catch {
        setMasterSettings(DEFAULT_MASTER_SETTINGS);
      }
    };
    loadMasterSettings();
    window.addEventListener("bh-master-settings-change", loadMasterSettings);
    return () => window.removeEventListener("bh-master-settings-change", loadMasterSettings);
  }, []);

  useEffect(() => {
    const syncMasterControl = () => {
      try {
        setIsMasterControlEnabled(JSON.parse(window.localStorage.getItem("bh_masterControlEnabled") || "true") as boolean);
      } catch {
        setIsMasterControlEnabled(true);
      }
    };
    syncMasterControl();
    window.addEventListener("bh-master-control-change", syncMasterControl);
    return () => window.removeEventListener("bh-master-control-change", syncMasterControl);
  }, []);

  useEffect(() => {
    const savedRequests = window.localStorage.getItem("bh_youtube_requests");
    if (!savedRequests) return;

    try {
      const savedTracks = JSON.parse(savedRequests) as Array<QueuedTrack | string>;
      const storedTracks = savedTracks.filter((track): track is QueuedTrack => typeof track !== "string").map((track) => ({ ...track, upvotes: typeof (track as RequestedTrack).upvotes === "number" ? (track as RequestedTrack).upvotes : 0 }));
      const legacyIds = savedTracks.filter((track): track is string => typeof track === "string");
      const savedPlayQueue = window.localStorage.getItem("bh_play_queue");
      const storedPlayQueue = savedPlayQueue
        ? (JSON.parse(savedPlayQueue) as Array<QueuedTrack | string>).filter((track): track is QueuedTrack => typeof track !== "string").map((track) => ({ ...track, upvotes: typeof (track as RequestedTrack).upvotes === "number" ? (track as RequestedTrack).upvotes : 0 }))
        : storedTracks;
      setRequestTracks(storedTracks);
      setPlayQueue(storedPlayQueue);
      if (!savedPlayQueue && storedTracks.length > 0) {
        window.localStorage.setItem("bh_play_queue", JSON.stringify(storedTracks));
      }

      void Promise.all(legacyIds.map(async (videoId) => {
        const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(`https://youtu.be/${videoId}`)}`);
        const data = (await response.json()) as { items?: SearchResult[] };
        return data.items?.[0] ? toQueuedTrack(data.items[0]) : null;
      })).then((legacyTracks) => {
        const restoredTracks = [...storedTracks, ...legacyTracks.filter((track): track is QueuedTrack => track !== null).map((track) => ({ ...track, upvotes: 0 }))];
        setRequestTracks(restoredTracks);
        window.localStorage.setItem("bh_youtube_requests", JSON.stringify(restoredTracks));
        if (!savedPlayQueue) {
          setPlayQueue(restoredTracks);
          window.localStorage.setItem("bh_play_queue", JSON.stringify(restoredTracks));
        }
      });
    } catch {
      window.localStorage.removeItem("bh_youtube_requests");
    }
  }, []);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (areSuggestionsDismissed || trimmedQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    const timeout = window.setTimeout(() => {
      void fetch(`/api/youtube/search?q=${encodeURIComponent(trimmedQuery)}`)
        .then(async (response) => (await response.json()) as { items?: SearchResult[] })
        .then((data) => setSuggestions([...new Set((data.items || []).map((track) => track.snippet.title))].slice(0, 5)))
        .catch(() => setSuggestions([]));
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [areSuggestionsDismissed, query]);

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Tab" || suggestions.length === 0) return;
    event.preventDefault();
    setQuery(suggestions[0]);
    setSuggestions([]);
    setAreSuggestionsDismissed(true);
  }

  useEffect(() => {
    function dismissSuggestions(event: PointerEvent) {
      if (!searchFormRef.current?.contains(event.target as Node)) {
        setSuggestions([]);
        setAreSuggestionsDismissed(true);
      }
    }

    window.addEventListener("pointerdown", dismissSuggestions);
    return () => window.removeEventListener("pointerdown", dismissSuggestions);
  }, []);

  useEffect(() => {
    function loadPlayedTracks() {
      try {
        setPlayedTracks(JSON.parse(window.localStorage.getItem("bh_play_history") || "[]") as QueuedTrack[]);
      } catch {
        setPlayedTracks([]);
      }
    }

    loadPlayedTracks();
    window.addEventListener("storage", loadPlayedTracks);
    return () => window.removeEventListener("storage", loadPlayedTracks);
  }, []);

  useEffect(() => {
    function loadPlayQueue() {
      try {
        const savedPlayQueue = JSON.parse(window.localStorage.getItem("bh_play_queue") || "[]") as QueuedTrack[];
        setPlayQueue(savedPlayQueue.map((track) => ({ ...track, upvotes: typeof (track as RequestedTrack).upvotes === "number" ? (track as RequestedTrack).upvotes : 0 })));
      } catch {
        setPlayQueue([]);
      }
    }

    window.addEventListener("bh-playback-change", loadPlayQueue);
    return () => window.removeEventListener("bh-playback-change", loadPlayQueue);
  }, []);

  useEffect(() => {
    function loadQueueState() {
      try {
        const requests = JSON.parse(window.localStorage.getItem("bh_youtube_requests") || "[]") as RequestedTrack[];
        setRequestTracks(requests.map((track) => ({ ...track, upvotes: typeof track.upvotes === "number" ? track.upvotes : 0 })));
      } catch {
        setRequestTracks([]);
      }

      try {
        setPlayedTracks(JSON.parse(window.localStorage.getItem("bh_play_history") || "[]") as QueuedTrack[]);
      } catch {
        setPlayedTracks([]);
      }
    }

    window.addEventListener("bh-playback-change", loadQueueState);
    return () => window.removeEventListener("bh-playback-change", loadQueueState);
  }, []);

  useEffect(() => {
    function loadNowPlaying() {
      try {
        const savedTrack = window.localStorage.getItem("bh_now_playing");
        const track = savedTrack ? JSON.parse(savedTrack) as QueuedTrack : null;
        setNowPlayingId(track?.videoId || null);
      } catch {
        setNowPlayingId(null);
      }
    }

    loadNowPlaying();
    window.addEventListener("storage", loadNowPlaying);
    window.addEventListener("bh-playback-change", loadNowPlaying);
    return () => {
      window.removeEventListener("storage", loadNowPlaying);
      window.removeEventListener("bh-playback-change", loadNowPlaying);
    };
  }, []);

  function addLocalRequest(track: SearchResult) {
    const queuedTrack = toQueuedTrack(track);
    const requestedTrack = { ...queuedTrack, upvotes: 0 };
    const nextRequests = [...requestTracks, requestedTrack];
    setRequestTracks(nextRequests);
    window.localStorage.setItem("bh_youtube_requests", JSON.stringify(nextRequests));
    window.dispatchEvent(new Event("bh-playback-change"));

    let nextPlayQueue = playQueue;
    if (!nextPlayQueue.some((queuedTrack) => queuedTrack.videoId === requestedTrack.videoId)) {
      nextPlayQueue = [...nextPlayQueue, requestedTrack];
      setPlayQueue(nextPlayQueue);
      window.localStorage.setItem("bh_play_queue", JSON.stringify(nextPlayQueue));
    }
    if (!nowPlaying?.videoId) {
      if (!nextPlayQueue.some((track) => track.videoId === queuedTrack.videoId)) {
        nextPlayQueue = [...nextPlayQueue, requestedTrack];
        setPlayQueue(nextPlayQueue);
        window.localStorage.setItem("bh_play_queue", JSON.stringify(nextPlayQueue));
      }
      const nextTrack = queuedTrack;
      window.localStorage.setItem("bh_now_playing", JSON.stringify(nextTrack));
      setNowPlayingId(nextTrack.videoId);
      setNowPlaying(nextTrack);
      setIsPlaying(true);
      window.dispatchEvent(new Event("bh-playback-change"));
    }
  }

  async function runTrackAction(videoId: string, action: () => Promise<void> | void) {
    if (pendingTrackActionRef.current) return;
    pendingTrackActionRef.current = videoId;
    setPendingTrackActionId(videoId);
    try {
      await action();
    } finally {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
      pendingTrackActionRef.current = null;
      setPendingTrackActionId(null);
    }
  }

  function upvoteHiveTrack(videoId: string) {
    void runTrackAction(videoId, async () => {
    if (room) {
      if (canManageQueue) {
        await updateHostState((state) => ({ ...state, requests: (state.requests || []).map((track) => track.videoId === videoId ? { ...track, upvotes: (track.upvotes || 0) + 1 } : track) }));
        return;
      }
      await voteForTrack(videoId);
      return;
    }
    if (!isMasterAccount && masterSettings.queueLocked) {
      setMessage("Hive Queue edits are locked by Omni Control.");
      return;
    }
    const nextPlayQueue = playQueue.map((track) => track.videoId === videoId ? { ...track, upvotes: track.upvotes + 1 } : track);
    setPlayQueue(nextPlayQueue);
    window.localStorage.setItem("bh_play_queue", JSON.stringify(nextPlayQueue));
    }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Could not update the queue."));
  }

  function removeRequest(videoId: string) {
    if (room && canManageQueue) {
      void updateHostState((state) => ({ ...state, requests: (state.requests || []).filter((track) => track.videoId !== videoId) })).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Could not update the queue."));
      return;
    }
    const nextRequests = requestTracks.filter((track) => track.videoId !== videoId);
    setRequestTracks(nextRequests);
    window.localStorage.setItem("bh_youtube_requests", JSON.stringify(nextRequests));
  }

  function moveRequestToHiveQueue(track: RequestedTrack) {
    if (!canPromoteRequests) return;

    if (room) {
      void runTrackAction(track.videoId, () => updateHostState((state) => {
        const requests = state.requests || [];
        const request = requests.find((candidate) => candidate.videoId === track.videoId);
        if (!request) return state;
        const queue = state.queue || [];
        if (queue.some((queuedTrack) => queuedTrack.videoId === request.videoId)) return state;
        return { ...state, requests: requests.filter((candidate) => candidate.videoId !== request.videoId), queue: [...queue, request] };
      })).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Could not add the request to the Hive Queue."));
      return;
    }

    if (playQueue.some((queuedTrack) => queuedTrack.videoId === track.videoId)) return;
    const nextRequests = requestTracks.filter((request) => request.videoId !== track.videoId);
    const nextPlayQueue = [...playQueue, track];
    setRequestTracks(nextRequests);
    setPlayQueue(nextPlayQueue);
    window.localStorage.setItem("bh_youtube_requests", JSON.stringify(nextRequests));
    window.localStorage.setItem("bh_play_queue", JSON.stringify(nextPlayQueue));
    window.dispatchEvent(new Event("bh-playback-change"));
  }

  function addPlayedTrackToHiveQueue(track: QueuedTrack) {
    if (!isMasterAccount) return;
    const hiveTrack: RequestedTrack = { ...track, upvotes: 0 };

    if (room) {
      void runTrackAction(track.videoId, () => updateHostState((state) => {
        const queue = state.queue || [];
        if (queue.some((queuedTrack) => queuedTrack.videoId === track.videoId)) return state;
        return { ...state, queue: [...queue, hiveTrack] };
      })).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Could not add the played track to the Hive Queue."));
      return;
    }

    if (playQueue.some((queuedTrack) => queuedTrack.videoId === track.videoId)) return;
    const nextPlayQueue = [...playQueue, hiveTrack];
    setPlayQueue(nextPlayQueue);
    window.localStorage.setItem("bh_play_queue", JSON.stringify(nextPlayQueue));
    window.dispatchEvent(new Event("bh-playback-change"));
  }

  function handleQueueDragEnd(event: DragEndEvent) {
    if (!isMasterAccount && masterSettings.queueLocked) {
      setMessage("Hive Queue edits are locked by Omni Control.");
      return;
    }
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    if (room && canManageQueue) {
      const activeId = String(active.id);
      const overId = String(over.id);
      const requestIndex = requestTracks.findIndex((track) => `request-${track.videoId}` === activeId);
      if (requestIndex >= 0) {
        if (overId === "hive-queue" || playQueue.some((track) => track.videoId === overId)) {
          if (!canPromoteRequests) {
            setMessage("Only the Omni host can add requests to the Hive Queue.");
            return;
          }
          void runTrackAction(activeId, () => updateHostState((state) => {
            const requests = state.requests || [];
            const request = requests.find((track) => track.videoId === activeId.replace(/^request-/, ""));
            if (!request) return state;
            const queue = state.queue || [];
            if (queue.some((track) => track.videoId === request.videoId)) return { ...state, requests: requests.filter((track) => track.videoId !== request.videoId) };
            const targetIndex = overId === "hive-queue" ? queue.length : queue.findIndex((track) => track.videoId === overId);
            const nextQueue = [...queue];
            nextQueue.splice(targetIndex < 0 ? queue.length : targetIndex, 0, request);
            return { ...state, requests: requests.filter((track) => track.videoId !== request.videoId), queue: nextQueue };
          })).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Could not add the request to the Hive Queue."));
          return;
        }
        const targetIndex = requestTracks.findIndex((track) => `request-${track.videoId}` === overId);
        if (targetIndex >= 0) void updateHostState((state) => ({ ...state, requests: arrayMove(state.requests || [], requestIndex, targetIndex) })).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Could not reorder requests."));
        return;
      }
      const queueIndex = playQueue.findIndex((track) => track.videoId === activeId);
      const targetIndex = playQueue.findIndex((track) => track.videoId === overId);
      if (queueIndex >= 0 && targetIndex >= 0) void updateHostState((state) => ({ ...state, queue: arrayMove(state.queue || [], queueIndex, targetIndex) })).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Could not reorder the Hive Queue."));
      return;
    }

    const requestIndex = requestTracks.findIndex((track) => `request-${track.videoId}` === active.id);
    if (requestIndex >= 0) {
      const requestedTrack = requestTracks[requestIndex];
      const targetHiveIndex = over.id === "hive-queue" ? playQueue.length : playQueue.findIndex((track) => track.videoId === over.id);

      if (isMasterAccount && targetHiveIndex >= 0) {
        const nextRequests = requestTracks.filter((_, index) => index !== requestIndex);
        const nextPlayQueue = [...playQueue];
        if (!nextPlayQueue.some((track) => track.videoId === requestedTrack.videoId)) nextPlayQueue.splice(targetHiveIndex, 0, requestedTrack);
        setRequestTracks(nextRequests);
        setPlayQueue(nextPlayQueue);
        window.localStorage.setItem("bh_youtube_requests", JSON.stringify(nextRequests));
        window.localStorage.setItem("bh_play_queue", JSON.stringify(nextPlayQueue));
        return;
      }

      const targetRequestIndex = requestTracks.findIndex((track) => `request-${track.videoId}` === over.id);
      if (targetRequestIndex < 0) return;
      const nextRequests = arrayMove(requestTracks, requestIndex, targetRequestIndex);
      setRequestTracks(nextRequests);
      window.localStorage.setItem("bh_youtube_requests", JSON.stringify(nextRequests));
      return;
    }

    const hiveIndex = playQueue.findIndex((track) => track.videoId === active.id);
    if (isMasterAccount && hiveIndex >= 0) {
      const targetRequestIndex = over.id === "personal-queue" ? requestTracks.length : requestTracks.findIndex((track) => `request-${track.videoId}` === over.id);
      if (targetRequestIndex < 0) return;

      const hiveTrack = playQueue[hiveIndex];
      const nextPlayQueue = playQueue.filter((_, index) => index !== hiveIndex);
      const nextRequests = [...requestTracks];
      if (!nextRequests.some((track) => track.videoId === hiveTrack.videoId)) nextRequests.splice(targetRequestIndex, 0, hiveTrack);
      setPlayQueue(nextPlayQueue);
      setRequestTracks(nextRequests);
      window.localStorage.setItem("bh_play_queue", JSON.stringify(nextPlayQueue));
      window.localStorage.setItem("bh_youtube_requests", JSON.stringify(nextRequests));
      if (hiveTrack.videoId === nowPlayingId) {
        const nextPlayingTrack = nextPlayQueue[hiveIndex] || nextPlayQueue[0] || null;
        setNowPlaying(nextPlayingTrack);
        setNowPlayingId(nextPlayingTrack?.videoId || null);
        setIsPlaying(nextPlayingTrack !== null);
      }
      window.dispatchEvent(new Event("bh-playback-change"));
      return;
    }

    if (!canManageQueue) return;

    const activeTrackIndex = playQueue.findIndex((track) => track.videoId === nowPlayingId);
    const firstMovableIndex = activeTrackIndex >= 0 ? activeTrackIndex + 1 : 0;
    const oldIndex = playQueue.findIndex((track) => track.videoId === active.id);
    const newIndex = playQueue.findIndex((track) => track.videoId === over.id);
    if (oldIndex < firstMovableIndex || newIndex < firstMovableIndex) return;

    const nextQueue = arrayMove(playQueue, oldIndex, newIndex);
    setPlayQueue(nextQueue);
    window.localStorage.setItem("bh_play_queue", JSON.stringify(nextQueue));
  }

  function handleQueueDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
  }

  function removeTrack(videoId: string) {
    if (!canManageQueue) return;
    if (room) {
      void runTrackAction(videoId, () => updateHostState((state) => {
        const queue = state.queue || [];
        const removedIndex = queue.findIndex((track) => track.videoId === videoId);
        const nextQueue = queue.filter((track) => track.videoId !== videoId);
        const nextTrack = state.nowPlaying?.videoId === videoId ? (queue[removedIndex + 1] || nextQueue[0] || null) : state.nowPlaying;
        return { ...state, queue: nextQueue, nowPlaying: nextTrack, isPlaying: Boolean(nextTrack) && state.isPlaying };
      })).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Could not update the queue."));
      return;
    }
    const nextQueue = playQueue.filter((track) => track.videoId !== videoId);
    setPlayQueue(nextQueue);
    window.localStorage.setItem("bh_play_queue", JSON.stringify(nextQueue));

    if (videoId === nowPlayingId) {
      const removedTrackIndex = playQueue.findIndex((track) => track.videoId === videoId);
      const nextPlayingTrack = playQueue[removedTrackIndex + 1] || nextQueue[0];

      if (nextPlayingTrack) {
        window.localStorage.setItem("bh_now_playing", JSON.stringify(nextPlayingTrack));
        setNowPlayingId(nextPlayingTrack.videoId);
      } else {
        window.localStorage.removeItem("bh_now_playing");
        setNowPlayingId(null);
      }
    }
  }

  function playTrackNow(track: RequestedTrack) {
    if (!canManageQueue) return;
    if (room) {
      void runTrackAction(track.videoId, () => updateHostState((state) => ({ ...state, nowPlaying: track, isPlaying: true }))).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Could not start this track."));
      return;
    }
    setNowPlaying(track);
    setNowPlayingId(track.videoId);
    setIsPlaying(true);
    window.dispatchEvent(new Event("bh-playback-change"));
  }

  function moveTrackToTop(videoId: string) {
    if (!canManageQueue) return;
    if (room) {
      void runTrackAction(videoId, () => updateHostState((state) => {
        const queue = state.queue || [];
        const index = queue.findIndex((track) => track.videoId === videoId);
        return index < 0 ? state : { ...state, queue: arrayMove(queue, index, 0) };
      })).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Could not update the queue."));
      return;
    }
    const trackIndex = playQueue.findIndex((track) => track.videoId === videoId);
    if (trackIndex < 0) return;
    const nextQueue = arrayMove(playQueue, trackIndex, 0);
    setPlayQueue(nextQueue);
    window.localStorage.setItem("bh_play_queue", JSON.stringify(nextQueue));
    window.dispatchEvent(new Event("bh-playback-change"));
  }

  async function searchForTracks(searchQuery: string) {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setMessage("");
    try {
      const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(searchQuery.trim())}`);
      const data = (await response.json()) as { items?: SearchResult[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Search failed.");
      setResults(data.items || []);
      if (!data.items?.length) setMessage("No matching tracks found.");
    } catch (error) {
      setResults([]);
      setMessage(error instanceof Error ? error.message : "Search failed.");
    } finally {
      setIsSearching(false);
    }
  }

  function searchTracks(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void searchForTracks(query);
  }

  async function queueTrack(track: SearchResult) {
    if (!isMasterAccount && masterSettings.requestsPaused) {
      setMessage("Requests are paused by Omni Control.");
      return;
    }
    if (!isMasterAccount && masterSettings.preventDuplicates && requestTracks.some((queuedTrack) => queuedTrack.videoId === track.id.videoId)) {
      setMessage("You have already requested this track.");
      return;
    }
    if (!isMasterAccount && requestTracks.length >= masterSettings.maxRequests) {
      setMessage(`Request limit reached (${masterSettings.maxRequests}).`);
      return;
    }

    if (room) {
      setQueueingId(track.id.videoId);
      try {
        await requestTrack(toQueuedTrack(track));
        setMessage(`Requested “${track.snippet.title}” for the Hive Queue.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not request this track.");
      } finally {
        setQueueingId(null);
      }
      return;
    }

    if (!session) {
      addLocalRequest(track);
      setMessage(`Requested “${track.snippet.title}”. Connect an account only if you want to manage your own playlist.`);
      return;
    }

    addLocalRequest(track);
    setQueueingId(track.id.videoId);
    setMessage("");
    try {
      const response = await fetch("/api/youtube/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: track.id.videoId }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not queue this track.");
      setMessage(`Added “${track.snippet.title}” to your BeatHive Queue.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Could not update your YouTube playlist.";
      setMessage(`Added “${track.snippet.title}” to Your Queue. ${detail}`);
    } finally {
      setQueueingId(null);
    }
  }

  const activeTrackIndex = playQueue.findIndex((track) => track.videoId === nowPlayingId);
  const firstMovableIndex = activeTrackIndex >= 0 ? activeTrackIndex + 1 : 0;
  const movableTrackIds = (isMasterAccount ? playQueue : playQueue.slice(firstMovableIndex)).map((track) => track.videoId);
  const activeDragTrack = activeDragId?.startsWith("request-")
    ? requestTracks.find((track) => `request-${track.videoId}` === activeDragId)
    : playQueue.find((track) => track.videoId === activeDragId);

  if (status === "loading") return null;

  return (
    <main className="min-h-[100dvh] bg-[#111] px-4 py-8 text-white sm:px-6 sm:py-12">
      <section className="mx-auto max-w-2xl">
        <NextLink href="/?home=party" className="mb-6 inline-flex text-2xl font-black text-white transition-colors hover:text-yellow-400 sm:mb-8" aria-label="Return to Beat Hive home">Beat<span className="text-yellow-500">Hive</span></NextLink>
        <div className="mb-6 flex items-center gap-3 sm:mb-8">
          <NextLink href="/?home=party" title="Back to party home" aria-label="Back to party home" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 text-gray-300 transition-colors hover:bg-yellow-500 hover:text-black">
            <ArrowLeft size={20} />
          </NextLink>
          <Music2 className="text-red-500" size={32} />
          <div>
            <h1 className="text-3xl font-black">Request Music</h1>
            <p className="text-sm text-gray-400">Search YouTube or YouTube Music, or paste a video link.</p>
          </div>
        </div>

        <form ref={searchFormRef} onSubmit={searchTracks} className="relative flex gap-2">
          <label className="sr-only" htmlFor="track-search">Search songs</label>
          <input id="track-search" value={query} onChange={(event) => { setQuery(event.target.value); setAreSuggestionsDismissed(false); }} onKeyDown={handleSearchKeyDown} placeholder="Song, artist, or YouTube link" className="min-w-0 flex-1 rounded-lg border border-white/15 bg-[#1b1b1b] px-4 py-3 text-white outline-none placeholder:text-gray-500 focus:border-yellow-500" aria-autocomplete="list" aria-controls="track-suggestions" />
          <button type="submit" disabled={isSearching} className="flex w-12 items-center justify-center rounded-lg bg-yellow-500 text-black hover:bg-yellow-400 disabled:opacity-60" aria-label="Search tracks">
            {isSearching ? <LoaderCircle className="animate-spin" size={20} /> : <Search size={20} />}
          </button>
          {suggestions.length > 0 && <div id="track-suggestions" className="absolute left-0 right-14 top-full z-20 mt-1 overflow-hidden rounded-lg border border-white/10 bg-[#1b1b1b] shadow-xl">{suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => { setQuery(suggestion); setSuggestions([]); setAreSuggestionsDismissed(true); void searchForTracks(suggestion); }} className="block w-full truncate px-4 py-2 text-left text-sm text-gray-300 hover:bg-white/10 hover:text-white">{suggestion}</button>)}</div>}
        </form>

        {message && <p className="mt-4 text-sm text-gray-300" role="status">{message}</p>}

        <section className="mt-6">
          <div className="mb-3 flex items-center gap-2">
            <ListMusic className="text-yellow-500" size={20} />
            <h2 className="font-bold">Queues</h2>
            <button onClick={() => setIsQueueCollapsed((isCollapsed) => !isCollapsed)} className="ml-auto flex h-8 w-8 items-center justify-center rounded bg-white/5 text-gray-300 hover:bg-yellow-500 hover:text-black" aria-label={isQueueCollapsed ? "Expand queue" : "Minimize queue"} title={isQueueCollapsed ? "Expand queue" : "Minimize queue"}>
              {isQueueCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
            </button>
          </div>
          {!isQueueCollapsed && (
            <DndContext sensors={sensors} onDragStart={handleQueueDragStart} onDragCancel={() => setActiveDragId(null)} onDragEnd={(event) => { setActiveDragId(null); handleQueueDragEnd(event); }}><div className="grid gap-6 md:grid-cols-2">
              <section className="min-w-0">
                <div className="relative mb-2 text-center"><h3 className="font-bold">Your Queue Request</h3><span className="absolute right-0 top-0 text-sm text-gray-500">{requestTracks.length}</span></div>
                <PersonalQueueDropZone>{requestTracks.length === 0 ? <p className="p-3 text-sm text-gray-500">Songs you request will appear here.</p> : <SortableContext items={requestTracks.map((track) => `request-${track.videoId}`)} strategy={verticalListSortingStrategy}><div className="space-y-2">{requestTracks.map((track) => <RequestTrackItem key={track.videoId} track={track} canAddToHiveQueue={canPromoteRequests && !playQueue.some((queuedTrack) => queuedTrack.videoId === track.videoId)} pendingAction={pendingTrackActionId !== null} onAddToHiveQueue={moveRequestToHiveQueue} onRemove={removeRequest} />)}</div></SortableContext>}</PersonalQueueDropZone>
              </section>
              <section className="min-w-0">
                <div className="relative mb-2 text-center"><h3 className="font-bold">Hive Queue</h3><span className="absolute right-0 top-0 text-sm text-gray-500">{playQueue.length}</span></div>
                <HiveQueueDropZone>{playQueue.length === 0 ? <p className="p-3 text-sm text-gray-500">Upvoted requests will play here.</p> : <SortableContext items={movableTrackIds} strategy={verticalListSortingStrategy}><div className="space-y-2">{playQueue.map((track, index) => <QueueTrackItem key={track.videoId} track={track} index={index} isPlaying={track.videoId === nowPlayingId} canReorder={canManageQueue && (isMasterAccount || index >= firstMovableIndex)} canRemove={canManageQueue} canControlPlayback={canManageQueue} showUpvoteCount={canManageQueue} pendingAction={pendingTrackActionId !== null} onRemove={removeTrack} onUpvote={upvoteHiveTrack} onPlayNow={playTrackNow} onMoveToTop={moveTrackToTop} />)}</div></SortableContext>}</HiveQueueDropZone>
              </section>
            </div><DragOverlay dropAnimation={null}>{isMasterAccount && activeDragTrack && <DragTrackOverlay track={activeDragTrack} />}</DragOverlay></DndContext>
          )}
        </section>

        <section className="mt-6">
          <div className="mb-2 flex items-center justify-center gap-2"><History className="text-yellow-500" size={18} /><h2 className="font-bold">Played history</h2><span className="text-sm text-gray-500">{playedTracks.length}</span><button onClick={() => setIsHistoryCollapsed((isCollapsed) => !isCollapsed)} className="flex h-8 w-8 items-center justify-center rounded bg-white/5 text-gray-300 hover:bg-yellow-500 hover:text-black" aria-label={isHistoryCollapsed ? "Expand played history" : "Minimize played history"} title={isHistoryCollapsed ? "Expand played history" : "Minimize played history"}>{isHistoryCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}</button></div>
          {!isHistoryCollapsed && <><div className="space-y-2">{[...playedTracks].reverse().slice(0, 10).map((track, index) => <article key={`${track.videoId}-${index}`} className="flex items-center gap-3 rounded-lg bg-[#1b1b1b] p-3"><span className="w-5 text-center text-sm font-bold text-gray-500">{playedTracks.length - index}</span><div className="min-w-0 flex-1"><h3 className="truncate font-bold">{track.title}</h3><p className="truncate text-sm text-gray-400">{track.channelTitle}</p></div>{isMasterAccount && <button onClick={() => addPlayedTrackToHiveQueue(track)} disabled={pendingTrackActionId !== null || playQueue.some((queuedTrack) => queuedTrack.videoId === track.videoId)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-400 hover:text-black disabled:cursor-not-allowed disabled:opacity-40" aria-label={`Add ${track.title} back to Hive Queue`} title="Add back to Hive Queue"><Plus size={18} /></button>}</article>)}</div><p className="mt-3 text-center text-sm text-gray-500">Played songs from Hive Queue will appear here.</p></>}
        </section>

        <div className="mt-6 space-y-2">
          {results.map((track) => (
            <article key={track.id.videoId} className="flex items-center gap-3 rounded-lg bg-[#1b1b1b] p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={track.snippet.thumbnails.medium?.url || track.snippet.thumbnails.default?.url} alt="" className="h-14 w-20 shrink-0 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-bold">{track.snippet.title}</h2>
                <p className="truncate text-sm text-gray-400">{track.snippet.channelTitle}</p>
              </div>
              <button onClick={() => queueTrack(track)} disabled={queueingId !== null || requestTracks.some((queuedTrack) => queuedTrack.videoId === track.id.videoId)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-yellow-500 hover:text-black disabled:opacity-60" aria-label={`Request ${track.snippet.title}`}>
                {queueingId === track.id.videoId ? <LoaderCircle className="animate-spin" size={18} /> : <Plus size={20} />}
              </button>
            </article>
          ))}
        </div>
        {!session && (
          <button onClick={() => signIn("google", { callbackUrl: "/youtube" })} className="mt-8 rounded-lg border border-white/15 px-4 py-2 text-sm font-bold text-gray-200 hover:border-yellow-500 hover:text-white">
            Connect YouTube to manage your playlist
          </button>
        )}
      </section>
    </main>
  );
}
