"use client";

import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, ChevronDown, ChevronUp, History, ListMusic, LoaderCircle, Menu, Music2, Plus, Search, ThumbsUp, Trash2 } from "lucide-react";
import NextLink from "next/link";
import { signIn, useSession } from "next-auth/react";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { usePlayback } from "../playback-provider";

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
  showUpvoteCount: boolean;
  onRemove: (videoId: string) => void;
  onUpvote: (videoId: string) => void;
};

function QueueTrackItem({ track, index, isPlaying, canReorder, showUpvoteCount, onRemove, onUpvote }: QueueTrackItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: track.videoId,
    disabled: !canReorder,
  });

  return (
    <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`flex items-center gap-3 rounded-lg bg-[#1b1b1b] p-3 ${isDragging ? "opacity-40" : ""}`}>
      <span className="w-5 text-center text-sm font-bold text-yellow-500">{index + 1}</span>
      {track.thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={track.thumbnail} alt="" className="h-12 w-16 shrink-0 rounded object-cover" />
      )}
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-bold">{track.title}</h3>
        <p className="truncate text-sm text-gray-400">{track.channelTitle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isPlaying && <span className="text-xs font-bold text-yellow-500">Playing</span>}
        <button onClick={() => onUpvote(track.videoId)} className={`flex h-8 items-center justify-center rounded bg-white/5 text-sm text-gray-300 hover:bg-yellow-500 hover:text-black ${showUpvoteCount ? "gap-1 px-2" : "w-8"}`} aria-label={`Upvote ${track.title}`} title="Upvote">
          <ThumbsUp size={15} /> {showUpvoteCount && track.upvotes}
        </button>
        {canReorder && (
          <button type="button" className="flex h-8 w-8 touch-none cursor-grab items-center justify-center rounded bg-white/5 text-gray-300 hover:bg-yellow-500 hover:text-black active:cursor-grabbing" aria-label={`Drag ${track.title} to reorder`} title="Drag to reorder" {...attributes} {...listeners}>
            <Menu size={18} />
          </button>
        )}
        <button onClick={() => onRemove(track.videoId)} className="flex h-7 w-7 items-center justify-center rounded bg-white/5 text-gray-400 hover:bg-red-500 hover:text-white" aria-label={`Remove ${track.title} from queue`} title="Remove from queue">
          <Trash2 size={14} />
        </button>
      </div>
    </article>
  );
}

export default function YoutubePage() {
  const { data: session, status } = useSession();
  const { setIsPlaying, setNowPlaying } = usePlayback();
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
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const searchFormRef = useRef<HTMLFormElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    setIsHost(window.localStorage.getItem("bh_userRole") === '"dj"');
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

    const activePlayIndex = playQueue.findIndex((track) => track.videoId === nowPlayingId);
    const hasUpcomingTrack = activePlayIndex >= 0 ? activePlayIndex < playQueue.length - 1 : playQueue.length > 0;
    let nextPlayQueue = playQueue;
    if (!hasUpcomingTrack) {
      nextPlayQueue = [...playQueue, { ...queuedTrack, upvotes: 0 }];
      setPlayQueue(nextPlayQueue);
      window.localStorage.setItem("bh_play_queue", JSON.stringify(nextPlayQueue));
    }
    if (!nowPlayingId) {
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

  function upvoteHiveTrack(videoId: string) {
    const nextPlayQueue = playQueue.map((track) => track.videoId === videoId ? { ...track, upvotes: track.upvotes + 1 } : track);
    setPlayQueue(nextPlayQueue);
    window.localStorage.setItem("bh_play_queue", JSON.stringify(nextPlayQueue));
  }

  function removeRequest(videoId: string) {
    const nextRequests = requestTracks.filter((track) => track.videoId !== videoId);
    setRequestTracks(nextRequests);
    window.localStorage.setItem("bh_youtube_requests", JSON.stringify(nextRequests));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeTrackIndex = playQueue.findIndex((track) => track.videoId === nowPlayingId);
    const firstMovableIndex = activeTrackIndex >= 0 ? activeTrackIndex + 1 : 0;
    const oldIndex = playQueue.findIndex((track) => track.videoId === active.id);
    const newIndex = playQueue.findIndex((track) => track.videoId === over.id);
    if (oldIndex < firstMovableIndex || newIndex < firstMovableIndex) return;

    const nextQueue = arrayMove(playQueue, oldIndex, newIndex);
    setPlayQueue(nextQueue);
    window.localStorage.setItem("bh_play_queue", JSON.stringify(nextQueue));
  }

  function removeTrack(videoId: string) {
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
    if (requestTracks.some((queuedTrack) => queuedTrack.videoId === track.id.videoId)) {
      setMessage("You have already requested this track.");
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
  const movableTrackIds = playQueue.slice(firstMovableIndex).map((track) => track.videoId);

  if (status === "loading") return null;

  return (
    <main className="min-h-[100dvh] bg-[#111] px-4 py-12 text-white sm:px-6">
      <section className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center gap-3">
          <NextLink href="/" title="Back to Beat Hive" aria-label="Back to Beat Hive" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 text-gray-300 transition-colors hover:bg-yellow-500 hover:text-black">
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
            <div className="grid gap-6 md:grid-cols-2">
              <section>
                <div className="relative mb-2 text-center"><h3 className="font-bold">Your queue</h3><span className="absolute right-0 top-0 text-sm text-gray-500">{requestTracks.length}</span></div>
                {requestTracks.length === 0 ? <p className="text-sm text-gray-500">Songs you request will appear here.</p> : <div className="space-y-2">{requestTracks.map((track) => <article key={track.videoId} className="flex items-center gap-2 rounded-lg bg-[#1b1b1b] p-3"><div className="min-w-0 flex-1"><h4 className="truncate font-bold">{track.title}</h4><p className="truncate text-sm text-gray-400">{track.channelTitle}</p></div><button onClick={() => removeRequest(track.videoId)} className="flex h-8 w-8 items-center justify-center rounded bg-white/5 text-gray-400 hover:bg-red-500 hover:text-white" aria-label={`Remove ${track.title} from requests`} title="Remove request"><Trash2 size={14} /></button></article>)}</div>}
              </section>
              <section>
                <div className="relative mb-2 text-center"><h3 className="font-bold">Hive Queue</h3><span className="absolute right-0 top-0 text-sm text-gray-500">{playQueue.length}</span></div>
                {playQueue.length === 0 ? <p className="text-sm text-gray-500">Upvoted requests will play here.</p> : <DndContext sensors={sensors} onDragEnd={handleDragEnd}><SortableContext items={movableTrackIds} strategy={verticalListSortingStrategy}><div className="space-y-2">{playQueue.map((track, index) => <QueueTrackItem key={track.videoId} track={track} index={index} isPlaying={track.videoId === nowPlayingId} canReorder={index >= firstMovableIndex} showUpvoteCount={isHost} onRemove={removeTrack} onUpvote={upvoteHiveTrack} />)}</div></SortableContext></DndContext>}
              </section>
            </div>
          )}
        </section>

        <section className="mt-6">
          <div className="mb-2 flex items-center justify-center gap-2"><History className="text-yellow-500" size={18} /><h2 className="font-bold">Played history</h2><span className="text-sm text-gray-500">{playedTracks.length}</span><button onClick={() => setIsHistoryCollapsed((isCollapsed) => !isCollapsed)} className="flex h-8 w-8 items-center justify-center rounded bg-white/5 text-gray-300 hover:bg-yellow-500 hover:text-black" aria-label={isHistoryCollapsed ? "Expand played history" : "Minimize played history"} title={isHistoryCollapsed ? "Expand played history" : "Minimize played history"}>{isHistoryCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}</button></div>
          {!isHistoryCollapsed && <><div className="space-y-2">{[...playedTracks].reverse().slice(0, 10).map((track, index) => <article key={`${track.videoId}-${index}`} className="flex items-center gap-3 rounded-lg bg-[#1b1b1b] p-3"><span className="w-5 text-center text-sm font-bold text-gray-500">{playedTracks.length - index}</span><div className="min-w-0 flex-1"><h3 className="truncate font-bold">{track.title}</h3><p className="truncate text-sm text-gray-400">{track.channelTitle}</p></div></article>)}</div><p className="mt-3 text-center text-sm text-gray-500">Played songs from Hive Queue will appear here.</p></>}
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
