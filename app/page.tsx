/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable prefer-const */

"use client";

import React, { useState, useRef, useEffect } from "react";
import NextLink from 'next/link';
import { QRCodeSVG } from "qrcode.react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { 
  Music, 
  ThumbsUp, 
  ListMusic, 
  Speaker, 
  Heart, 
  MessageSquare, 
  Search, 
  QrCode,
  User,
  Globe,
  List,
  X,
  Mail,
  ArrowRight,
  ArrowLeft,
  Headphones,
  Users,
  Settings2,
  Copy,
  Share2,
  EyeOff,
  Link,
  ChevronDown,
  LogOut,
  Pause,
  Play,
  Flame,
  SkipBack,
  SkipForward,
  ShieldAlert,
  Volume1,
} from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import { motion, AnimatePresence, useMotionValue, animate, useTransform } from "framer-motion";
import { usePlayback } from "./playback-provider";
import { useRoom } from "./room-provider";
import { Tutorial } from "./tutorial";

// Mock DJ Data for Genres to display tallies
const GENRE_TALLIES = [
  { name: 'Afrobeats', count: 142 },
  { name: 'Hip Hop', count: 98 },
  { name: 'Amapiano', count: 86 },
  { name: 'R&B', count: 64 },
  { name: 'Pop', count: 45 },
  { name: 'Reggaeton', count: 32 },
  { name: 'Dancehall', count: 28 },
  { name: 'House', count: 19 },
  { name: 'EDM', count: 14 },
  { name: 'Latino', count: 9 },
].sort((a, b) => b.count - a.count);

const HIVE_ITEMS = [
  { id: 'hive', title: "Hive", description: "See everyone in this party", icon: <Users size={32} /> },
  { id: 'request', title: "Request", description: "Search and request a song for the queue", icon: <Search size={36} strokeWidth={2.5} /> },
  { id: 'queue', title: "Queue", description: "View what's coming up next", icon: <ListMusic size={32} /> },
  { id: 'energy', title: "Energy", description: "Tell the Hive Host to bring the heat up or down", icon: <Flame size={32} /> },
  { id: 'upvote', title: "Upvote", description: "Vote for currently queued tracks", icon: <ThumbsUp size={32} /> },
  { id: 'vibes', title: "Vibes", description: "Let the Hive Host know you're feeling the set", icon: <Music size={32} /> },
  { id: 'shoutout', title: "Shoutout", description: "Send a message to the Hive Host", icon: <MessageSquare size={32} /> },
  { id: 'tip', title: "Tip Hive Host", description: "Show some love with a direct tip", icon: <Heart size={32} /> },
];

const MASTER_CONTROL_EMAIL = 'simon97862012@gmail.com';

const TOTAL_TILES = 32; // Exactly 32 panels on a standard soccer ball
const RADIUS = 185; // Perfectly tuned to avoid overlapping with 106px shapes

// Golden Ratio
const PHI = (1 + Math.sqrt(5)) / 2;

// Normalize to uniform sphere surface (soccer ball projection)
const normalize = (x: number, y: number, z: number) => {
  const len = Math.sqrt(x*x + y*y + z*z);
  return { x: (x/len)*RADIUS, y: (y/len)*RADIUS, z: (z/len)*RADIUS };
};

const LAT_LON_SLOTS: {x: number, y: number, z: number}[] = [];

// 12 points from an Icosahedron (The 12 Pentagons on a soccer ball)
[
  [0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI],
  [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0],
  [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]
].forEach(p => LAT_LON_SLOTS.push(normalize(p[0], p[1], p[2])));

// 20 points from a Dodecahedron (The 20 Hexagons on a soccer ball)
[
  [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
  [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
  [0, PHI, 1/PHI], [0, PHI, -1/PHI], [0, -PHI, 1/PHI], [0, -PHI, -1/PHI],
  [1/PHI, 0, PHI], [1/PHI, 0, -PHI], [-1/PHI, 0, PHI], [-1/PHI, 0, -PHI],
  [PHI, 1/PHI, 0], [PHI, -1/PHI, 0], [-PHI, 1/PHI, 0], [-PHI, -1/PHI, 0]
].forEach(p => LAT_LON_SLOTS.push(normalize(p[0], p[1], p[2])));

// Sort slots tightly around absolute front-center so actual app items sit perfectly together
LAT_LON_SLOTS.sort((a, b) => {
  const distA = Math.sqrt(a.x**2 + a.y**2 + (a.z - RADIUS)**2);
  const distB = Math.sqrt(b.x**2 + b.y**2 + (b.z - RADIUS)**2);
  return distA - distB;
});

const assignedActionIds: string[] = [];
const ALL_ITEMS = LAT_LON_SLOTS.slice(0, TOTAL_TILES).map((slot, index) => {
  const neighboringActions = new Set(
    LAT_LON_SLOTS.slice(0, index).flatMap((neighbor, neighborIndex) =>
      Math.hypot(slot.x - neighbor.x, slot.y - neighbor.y, slot.z - neighbor.z) < 135 ? [assignedActionIds[neighborIndex]] : []
    )
  );
  const availableActions = HIVE_ITEMS.filter((item) => !neighboringActions.has(item.id));
  const action = availableActions[index % availableActions.length] || HIVE_ITEMS[index % HIVE_ITEMS.length];
  assignedActionIds.push(action.id);
  return { ...action, id: `${action.id}-${index}`, isBlank: false };
});

const HIVE_ITEMS_3D = ALL_ITEMS.map((item, i) => {
  const slot = LAT_LON_SLOTS[i];
  return { 
    ...item, 
    baseX: slot.x, 
    baseY: slot.y, 
    baseZ: slot.z 
  };
});

// A pure mathematical rigid-body 3D Euler rotation function 
const rotate3D = (point: { baseX: number, baseY: number, baseZ: number; [key: string]: any }, rotX: number, rotY: number) => {
  // Rotate around X-axis (Pitch / Up & Down)
  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
  const y1 = point.baseY * cosX - point.baseZ * sinX;
  const z1 = point.baseY * sinX + point.baseZ * cosX;
  
  // Rotate around Y-axis (Yaw / Left & Right)
  const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
  const x2 = point.baseX * cosY + z1 * sinY;
  const z2 = -point.baseX * sinY + z1 * cosY;
  
  return { x: x2, y: y1, z: z2 };
};

// Calculates the closest absolute rotation angles, preventing the sphere from "unwinding" backwards to snap
const getNearestAngle = (current: number, target: number) => {
  let diff = (target - current) % (2 * Math.PI);
  if (diff < -Math.PI) diff += 2 * Math.PI;
  if (diff > Math.PI) diff -= 2 * Math.PI;
  return current + diff;
};

// Calculate exact target rotation angles (rotX, rotY) to bring any item to (0, 0, RADIUS) facing straight on
const getTargetAnglesForItem = (item: { baseX: number; baseY: number; baseZ: number }) => {
  const targetX = Math.atan2(item.baseY, item.baseZ);
  const z1 = Math.sqrt(item.baseY ** 2 + item.baseZ ** 2);
  const targetY = -Math.atan2(item.baseX, z1);
  return { targetX, targetY };
};

// Start the math with the exact required rotation to have the first item facing direct Front-Center
const initAngles = getTargetAnglesForItem(HIVE_ITEMS_3D[0]);
const initTargetX = initAngles.targetX;
const initTargetY = initAngles.targetY;

// A reusable hook to persist state to localStorage and sync between tabs
function usePersistedState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(defaultValue);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item !== null) {
        setState(JSON.parse(item));
      }
    } catch (e) {
      console.error("Error reading localStorage", e);
    } finally {
      setHasLoaded(true);
    }
  }, [key]);

  useEffect(() => {
    if (!hasLoaded) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {
      console.error("Error setting localStorage", e);
    }
  }, [hasLoaded, key, state]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          if (e.newValue !== null) {
            setState(JSON.parse(e.newValue));
          }
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [key]);

  return [state, setState];
}

type NowPlayingTrack = {
  videoId?: string;
  title: string;
  channelTitle: string;
  thumbnail?: string;
};

type YoutubeSearchResult = {
  id: { videoId?: string };
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails: { medium?: { url: string }; default?: { url: string } };
  };
};

type SyncedSettings = {
  userRole?: 'none' | 'dj' | 'guest';
  hasAccess?: boolean;
  viewMode?: 'globe' | 'list';
  musicSource?: 'spotify' | 'apple' | 'youtube' | null;
  isAnonymousDJ?: boolean;
  customIcon?: string | null;
  energyPreference?: 'up' | 'down' | null;
  selectedVibe?: string | null;
  lastShoutout?: string | null;
  tipTotal?: number;
};

type PartyHistoryEntry = { code: string; name: string; occurredAt: string; joinedAt?: string };
type PartyHistory = { hosted: PartyHistoryEntry[]; attended: PartyHistoryEntry[] };

function PartyHistorySection({ history, isLoading }: { history: PartyHistory | null; isLoading: boolean }) {
  const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
  const renderParties = (parties: PartyHistoryEntry[], emptyLabel: string) => {
    if (isLoading) return <p className="text-xs text-gray-500">Loading...</p>;
    if (parties.length === 0) return <p className="text-xs text-gray-500">{emptyLabel}</p>;
    return <ul className="space-y-2">{parties.slice(0, 4).map((party) => <li key={`${party.code}-${party.joinedAt || party.occurredAt}`} className="min-w-0"><p className="truncate text-xs font-bold text-white">{party.name}</p><p className="mt-0.5 text-[11px] text-gray-500">{formatDate(party.joinedAt || party.occurredAt)}</p></li>)}</ul>;
  };

  return <section className="border border-white/10 bg-[#111] p-4">
    <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400">Party History</h3>
    <div className="mt-4 grid grid-cols-2 gap-4">
      <div className="min-w-0"><p className="mb-2 text-xs font-bold text-yellow-500">Hosted</p>{renderParties(history?.hosted || [], 'No hosted parties yet.')}</div>
      <div className="min-w-0"><p className="mb-2 text-xs font-bold text-yellow-500">Attended</p>{renderParties(history?.attended || [], 'No attended parties yet.')}</div>
    </div>
  </section>;
}

// Main Entry Component
export default function BeatHiveApp() {
  const { data: session } = useSession();
  const authProvider = (session as (typeof session & { provider?: string }) | null)?.provider;
  const { nowPlaying, isPlaying, setNowPlaying, setIsPlaying } = usePlayback();
  const { room: sharedRoom, createRoom } = useRoom();
  const userEmail = session?.user?.email;
    // YouTube search state
      // Removed unused YouTube search state variables
  const [isClient, setIsClient] = useState(false);
  const isFindingVibeTrack = useRef(false);

  // Always force scroll to top on exact mounting of the main component
  useEffect(() => {
    setIsClient(true);
    window.scrollTo(0, 0);
  }, []);

  const [isAuthenticated, setIsAuthenticated] = usePersistedState('bh_isAuthenticated', false);

  useEffect(() => {
    if (session) {
      setIsAuthenticated(true);
    }
  }, [session, setIsAuthenticated]);

  const [userRole, setUserRole] = usePersistedState<'none' | 'dj' | 'guest'>('bh_userRole', 'none');
  const [hasAccess, setHasAccess] = usePersistedState('bh_hasAccess', false); // Guest room access
  
  // App navigation state
  const [viewMode, setViewMode] = usePersistedState<'globe' | 'list'>('bh_viewMode', 'globe');
  const [showSettings, setShowSettings] = usePersistedState('bh_showSettings', false);
  const [partyHistory, setPartyHistory] = useState<PartyHistory | null>(null);
  const [isPartyHistoryLoading, setIsPartyHistoryLoading] = useState(false);
  const [showMusicSources, setShowMusicSources] = useState(false);
  const [musicSource, setMusicSource] = usePersistedState<'spotify' | 'apple' | 'youtube' | null>('bh_musicSource', null);
  const [customIcon, setCustomIcon] = usePersistedState<string | null>('bh_customIcon', null);
  const profileImage = customIcon ?? session?.user?.image ?? null;
  const customIconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (authProvider === 'google' && musicSource === null) setMusicSource('youtube');
  }, [authProvider, musicSource, setMusicSource]);

  useEffect(() => {
    let isCurrent = true;
    if (!userEmail) {
      setPartyHistory(null);
      setIsPartyHistoryLoading(false);
      return () => { isCurrent = false; };
    }

    setIsPartyHistoryLoading(true);
    void fetch('/api/profile/history').then(async (response) => {
      if (!response.ok) return null;
      return response.json() as Promise<PartyHistory>;
    }).then((history) => {
      if (isCurrent && history) setPartyHistory(history);
    }).catch(() => {
      if (isCurrent) setPartyHistory(null);
    }).finally(() => {
      if (isCurrent) setIsPartyHistoryLoading(false);
    });

    return () => { isCurrent = false; };
  }, [userEmail]);

  // DJ State
  const [djRoomActive, setDjRoomActive] = usePersistedState('bh_djRoomActive', false);
  const [hostSetupRequested, setHostSetupRequested] = useState(false);
  const [isPartyCreator, setIsPartyCreator] = usePersistedState('bh_isPartyCreator', false);
  const [isMasterControlEnabled, setIsMasterControlEnabled] = usePersistedState('bh_masterControlEnabled', true);
  const [isAnonymousDJ, setIsAnonymousDJ] = usePersistedState('bh_isAnonymousDJ', false);
  const [energyPreference, setEnergyPreference] = usePersistedState<'up' | 'down' | null>('bh_energyPreference', null);
  const [selectedVibe, setSelectedVibe] = usePersistedState<string | null>('bh_selectedVibe', null);
  const [lastShoutout, setLastShoutout] = usePersistedState<string | null>('bh_lastShoutout', null);
  const [tipTotal, setTipTotal] = usePersistedState('bh_tipTotal', 0);
  const [djPreviewingGuest, setDjPreviewingGuest] = usePersistedState('bh_djPreviewingGuest', false);
  const [djQrExpanded, setDjQrExpanded] = usePersistedState('bh_djQrExpanded', false);
  const [roomName, setRoomName] = usePersistedState('bh_roomName', '');
  const [coHostInput, setCoHostInput] = useState('');
  const [openingVibe, setOpeningVibe] = useState('');
  const [roomCode, setRoomCode] = usePersistedState('bh_roomCode', '');
  const [joinedRoom, setJoinedRoom] = usePersistedState<{ code: string; hostName: string; hostEmail: string; roomName: string } | null>('bh_joinedRoom', null);
  const [shareStatus, setShareStatus] = useState('');
  const [showEndSessionConfirm, setShowEndSessionConfirm] = useState(false);
  const [newRequestCount, setNewRequestCount] = useState(0);
  const [viewedRequestIds, setViewedRequestIds] = usePersistedState<string[]>('bh_viewedRequestIds', []);
  // Guest State
  const [qrExpanded, setQrExpanded] = usePersistedState('bh_qrExpanded', false);
  const [isQrScanning, setIsQrScanning] = useState(false);
  const [qrScanError, setQrScanError] = useState('');
  const [remoteSettingsLoaded, setRemoteSettingsLoaded] = useState(false);

  useEffect(() => {
    const showTutorialActions = () => setViewMode('list');
    window.addEventListener('bh-tutorial-guest-open', showTutorialActions);
    return () => window.removeEventListener('bh-tutorial-guest-open', showTutorialActions);
  }, [setViewMode]);

  useEffect(() => {
    const feedback = sharedRoom?.state.feedback;
    if (!feedback) return;
    if (feedback.energyPreference === 'up' || feedback.energyPreference === 'down') setEnergyPreference(feedback.energyPreference);
    if (typeof feedback.selectedVibe === 'string') setSelectedVibe(feedback.selectedVibe);
    if (typeof feedback.lastShoutout === 'string') setLastShoutout(feedback.lastShoutout);
    if (typeof feedback.tipTotal === 'number') setTipTotal(feedback.tipTotal);
  }, [sharedRoom, setEnergyPreference, setLastShoutout, setSelectedVibe, setTipTotal]);

  useEffect(() => {
    const syncMasterControl = () => {
      try {
        setIsMasterControlEnabled(JSON.parse(window.localStorage.getItem('bh_masterControlEnabled') || 'true') as boolean);
      } catch {
        setIsMasterControlEnabled(true);
      }
    };
    window.addEventListener('bh-master-control-change', syncMasterControl);
    return () => window.removeEventListener('bh-master-control-change', syncMasterControl);
  }, [setIsMasterControlEnabled]);

  useEffect(() => {
    const loadRequestCount = () => {
      try {
        const requests = JSON.parse(window.localStorage.getItem('bh_youtube_requests') || '[]') as Array<{ videoId?: string }>;
        setNewRequestCount(requests.filter((request) => request.videoId && !viewedRequestIds.includes(request.videoId)).length);
      } catch {
        setNewRequestCount(0);
      }
    };
    loadRequestCount();
    window.addEventListener('storage', loadRequestCount);
    window.addEventListener('bh-playback-change', loadRequestCount);
    return () => {
      window.removeEventListener('storage', loadRequestCount);
      window.removeEventListener('bh-playback-change', loadRequestCount);
    };
  }, [viewedRequestIds]);

  const acknowledgeRequests = () => {
    try {
      const requests = JSON.parse(window.localStorage.getItem('bh_youtube_requests') || '[]') as Array<{ videoId?: string }>;
      setViewedRequestIds(requests.flatMap((request) => request.videoId ? [request.videoId] : []));
    } catch {
      setViewedRequestIds([]);
    }
  };

  useEffect(() => {
    let isCurrent = true;

    async function loadRemoteSettings() {
      if (!userEmail) {
        setRemoteSettingsLoaded(true);
        return;
      }

      setRemoteSettingsLoaded(false);
      try {
        const response = await fetch('/api/settings');
        if (!response.ok) return;
        const { settings } = (await response.json()) as { settings: SyncedSettings };
        if (!isCurrent) return;

        if (settings.userRole) setUserRole(settings.userRole);
        if (typeof settings.hasAccess === 'boolean') setHasAccess(settings.hasAccess);
        if (settings.viewMode) setViewMode(settings.viewMode);
        if (settings.musicSource !== undefined) setMusicSource(settings.musicSource);
        if (typeof settings.isAnonymousDJ === 'boolean') setIsAnonymousDJ(settings.isAnonymousDJ);
        if (settings.customIcon !== undefined) setCustomIcon(settings.customIcon);
        if (settings.energyPreference !== undefined) setEnergyPreference(settings.energyPreference);
        if (settings.selectedVibe !== undefined) setSelectedVibe(settings.selectedVibe);
        if (settings.lastShoutout !== undefined) setLastShoutout(settings.lastShoutout);
        if (typeof settings.tipTotal === 'number') setTipTotal(settings.tipTotal);
      } catch {
        // Local storage remains available when the settings store cannot be reached.
      } finally {
        if (isCurrent) setRemoteSettingsLoaded(true);
      }
    }

    void loadRemoteSettings();
    return () => { isCurrent = false; };
  }, [userEmail]);

  useEffect(() => {
    if (!userEmail || !remoteSettingsLoaded) return;

    const timeout = window.setTimeout(() => {
      void fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: { userRole, hasAccess, viewMode, musicSource, isAnonymousDJ, customIcon, energyPreference, selectedVibe, lastShoutout, tipTotal },
        }),
      });
    }, 400);

    return () => window.clearTimeout(timeout);
  }, [customIcon, energyPreference, hasAccess, isAnonymousDJ, lastShoutout, musicSource, remoteSettingsLoaded, selectedVibe, tipTotal, userEmail, userRole, viewMode]);

  if (!isClient) return null; // Prevent hydration flash on first render

  const handleSignIn = () => {
    setIsAuthenticated(true);
    window.scrollTo(0, 0);
  };

  const returnToSignIn = () => {
    window.localStorage.removeItem('bh_isAuthenticated');
    window.localStorage.removeItem('bh_userRole');
    window.localStorage.removeItem('bh_djRoomActive');
    setIsAuthenticated(false);
    setUserRole('none');
    setDjRoomActive(false);
    window.scrollTo(0, 0);
  };

  const handleSelectRole = (role: 'dj' | 'guest') => {
    if (role === 'dj' && !userEmail) {
      returnToSignIn();
      return;
    }
    setHostSetupRequested(role === 'dj');
    setUserRole(role);
    window.scrollTo(0, 0);
  };

  const handleStartDJRoom = async () => {
    if (!userEmail) {
      returnToSignIn();
      return;
    }
    try {
      const coHostEmails = coHostInput.split(/[\n,]/).map((email) => email.trim()).filter(Boolean);
      let starterQueue: { videoId: string; title: string; channelTitle: string; thumbnail?: string }[] = [];
      if (openingVibe) {
        const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(`${openingVibe} party music`)}`);
        if (response.ok) {
          const { items } = (await response.json()) as { items?: YoutubeSearchResult[] };
          starterQueue = (items || []).flatMap((item) => item.id.videoId ? [{ videoId: item.id.videoId, title: item.snippet.title, channelTitle: item.snippet.channelTitle, thumbnail: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url }] : []).slice(0, 5);
        }
      }
      const room = await createRoom(roomName, coHostEmails, starterQueue);
      setRoomCode(room.code);
      setRoomName(room.name);
      setIsPartyCreator(true);
      setDjRoomActive(true);
      window.dispatchEvent(new Event('bh-host-session-change'));
      window.scrollTo(0, 0);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not create a shared room.');
    }
  };

  const roomLink = (sharedRoom?.code || roomCode) && typeof window !== 'undefined'
    ? `${window.location.origin}/join?${new URLSearchParams({ room: sharedRoom?.code || roomCode }).toString()}`
    : '';

  const copyRoomLink = async () => {
    if (!roomLink) return;
    await navigator.clipboard.writeText(roomLink);
    setShareStatus('Room link copied');
    window.setTimeout(() => setShareStatus(''), 2000);
  };

  const shareRoomLink = async () => {
    if (!roomLink) return;
    if (navigator.share) {
      await navigator.share({ title: roomName, text: `Join ${roomName} on Beat Hive`, url: roomLink });
      return;
    }
    await copyRoomLink();
  };

  const handleScanAccess = () => {
    setHasAccess(true);
    window.scrollTo(0, 0);
  };

  const handleQrScan = (detectedCodes: Array<{ rawValue: string }>) => {
    const scannedValue = detectedCodes[0]?.rawValue;
    if (!scannedValue) return;

    try {
      const scannedUrl = new URL(scannedValue);
      const room = scannedUrl.searchParams.get('room');
      if (!room) throw new Error();
      setIsQrScanning(false);
      window.location.assign(`/join?${new URLSearchParams({ room }).toString()}`);
    } catch {
      setQrScanError('This is not a valid Beat Hive room code.');
    }
  };

  const replayTutorial = (role: 'host' | 'guest', phase: 'setup' | 'session' = 'setup') => {
    window.dispatchEvent(new CustomEvent('bh-replay-tutorial', { detail: { role, phase } }));
  };

  const endSession = () => {
    if (userRole !== 'dj') return;
    setShowEndSessionConfirm(false);
    setDjQrExpanded(false);
    setDjPreviewingGuest(false);
    setDjRoomActive(false);
    setHostSetupRequested(false);
    setIsPartyCreator(false);
    setIsPlaying(false);
    window.dispatchEvent(new Event('bh-host-session-change'));
    window.scrollTo(0, 0);
  };

  const leaveSession = () => {
    window.localStorage.removeItem('bh_joinedRoomCode');
    window.localStorage.removeItem('bh_roomCode');
    window.localStorage.removeItem('bh_roomName');
    window.localStorage.removeItem('bh_masterSettings');
    setJoinedRoom(null);
    setHasAccess(false);
    setQrExpanded(false);
    window.location.assign('/');
  };

  const recordPlayedTrack = () => {
    if (!nowPlaying?.videoId) return;

    try {
      const history = JSON.parse(window.localStorage.getItem('bh_play_history') || '[]') as NowPlayingTrack[];
      if (history.at(-1)?.videoId === nowPlaying.videoId) return;
      window.localStorage.setItem('bh_play_history', JSON.stringify([...history, nowPlaying].slice(-50)));
    } catch {
      window.localStorage.setItem('bh_play_history', JSON.stringify([nowPlaying]));
    }
  };

  const handleNextTrack = () => {
    if (!isMasterController) return;
    try {
      const queue = JSON.parse(window.localStorage.getItem('bh_play_queue') || '[]') as NowPlayingTrack[];
      const currentIndex = queue.findIndex((track) => track.videoId === nowPlaying?.videoId);
      const nextTrack = queue[currentIndex + 1];
      if (!nextTrack) return;

      window.localStorage.setItem('bh_now_playing', JSON.stringify(nextTrack));
      setNowPlaying(nextTrack);
      setIsPlaying(true);
    } catch {
      // Keep the current track active if the queue cannot be read.
    }
  };

  const handlePreviousTrack = () => {
    if (!isMasterController) return;
    try {
      const queue = JSON.parse(window.localStorage.getItem('bh_play_queue') || '[]') as NowPlayingTrack[];
      const currentIndex = queue.findIndex((track) => track.videoId === nowPlaying?.videoId);
      const history = JSON.parse(window.localStorage.getItem('bh_play_history') || '[]') as NowPlayingTrack[];
      const previousTrack = currentIndex > 0 ? queue[currentIndex - 1] : history.filter((track) => track.videoId !== nowPlaying?.videoId).at(-1);
      if (!previousTrack) return;

      window.localStorage.setItem('bh_now_playing', JSON.stringify(previousTrack));
      setNowPlaying(previousTrack);
      setIsPlaying(true);
    } catch {
      // Keep the current track active if playback history cannot be read.
    }
  };

  const handleTrackEnded = async () => {
    try {
      const queue = JSON.parse(window.localStorage.getItem('bh_play_queue') || '[]') as NowPlayingTrack[];
      const currentIndex = queue.findIndex((track) => track.videoId === nowPlaying?.videoId);
      const nextTrack = queue[currentIndex + 1];
      if (nextTrack) {
        window.localStorage.setItem('bh_now_playing', JSON.stringify(nextTrack));
        setNowPlaying(nextTrack);
        return;
      }

      const requests = JSON.parse(window.localStorage.getItem('bh_youtube_requests') || '[]') as Array<NowPlayingTrack & { upvotes?: number }>;
      const promotedRequest = requests
        .filter((track) => (track.upvotes || 0) > 0 && !queue.some((queuedTrack) => queuedTrack.videoId === track.videoId))
        .sort((firstTrack, secondTrack) => (secondTrack.upvotes || 0) - (firstTrack.upvotes || 0))[0];
      if (promotedRequest) {
        const nextQueue = [...queue, promotedRequest];
        window.localStorage.setItem('bh_play_queue', JSON.stringify(nextQueue));
        window.localStorage.setItem('bh_now_playing', JSON.stringify(promotedRequest));
        setNowPlaying(promotedRequest);
        setIsPlaying(true);
        return;
      }

      if (currentIndex < 0 || isFindingVibeTrack.current) {
        setIsPlaying(false);
        return;
      }

      isFindingVibeTrack.current = true;
      const recentTracks = queue.slice(Math.max(0, currentIndex - 1), currentIndex + 1);
      const vibeQuery = recentTracks.map((track) => `${track.title} ${track.channelTitle}`).join(' ');
      const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(vibeQuery)}`);
      const data = (await response.json()) as { items?: YoutubeSearchResult[] };
      const recommendation = data.items?.find((track) => track.id.videoId && !queue.some((queuedTrack) => queuedTrack.videoId === track.id.videoId));
      if (!recommendation?.id.videoId) {
        setIsPlaying(false);
        return;
      }

      const nextVibeTrack: NowPlayingTrack = {
        videoId: recommendation.id.videoId,
        title: recommendation.snippet.title,
        channelTitle: recommendation.snippet.channelTitle,
        thumbnail: recommendation.snippet.thumbnails.medium?.url || recommendation.snippet.thumbnails.default?.url,
      };
      const nextQueue = [...queue, nextVibeTrack];
      window.localStorage.setItem('bh_play_queue', JSON.stringify(nextQueue));
      window.localStorage.setItem('bh_now_playing', JSON.stringify(nextVibeTrack));
      setNowPlaying(nextVibeTrack);
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    } finally {
      isFindingVibeTrack.current = false;
    }
  };

  const handleCustomIconUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Choose an image file for your icon.');
      return;
    }

    if (file.size > 1024 * 1024) {
      alert('Choose an image smaller than 1 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const imageData = reader.result as string;
      try {
        window.localStorage.setItem('bh_customIcon', JSON.stringify(imageData));
        setCustomIcon(imageData);
      } catch {
        alert('Your browser could not save this image. Try a smaller file.');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAppleMusicAuth = async () => {
    try {
      const wk = window as any;
      
      // If the SDK script isn't somehow loaded yet
      if (!wk.MusicKit) {
        console.error("MusicKit not loaded");
        // Fallback visual mock if scripts fail
        setMusicSource(musicSource === 'apple' ? null : 'apple');
        return;
      }
      
      // Initialize if not already initialized
      let music = wk.MusicKit.getInstance();
      if (!music) {
        // You MUST replace this 'test-token' with a real JWT signed by your Apple Developer account key
        music = await wk.MusicKit.configure({
          developerToken: process.env.NEXT_PUBLIC_APPLE_DEV_TOKEN || 'test-token',
          app: {
            name: 'BeatHive',
            build: '1.0.0'
          }
        });
      }

      if (music.isAuthorized) {
        // User wants to disconnect
        await music.unauthorize();
        setMusicSource(null);
      } else {
        // Triggers the real Apple Music browser / iOS modal login popup
        const result = await music.authorize();
        if (result) {
          setMusicSource('apple');
        }
      }
    } catch (error) {
      console.error("Apple Music connection failed:", error);
      alert("Apple Music connection requires a valid Apple Developer Token configured in your environment.");
      // For development let's still just mock it if it errors out from a bad token
      setMusicSource(musicSource === 'apple' ? null : 'apple');
    }
  };

  // State 1: User needs to Sign In / Create Account
  const isUserLoggedIn = isAuthenticated || Boolean(session);
  const hostProfileSettings = showSettings && (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10002] flex items-end bg-black/80 p-4 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-labelledby="host-profile-title">
        <motion.section initial={{ y: 32, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 32, opacity: 0 }} className="w-full max-w-md rounded-xl border border-white/10 bg-[#1a1a1a] p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="host-profile-title" className="text-2xl font-black text-white">Profile</h2>
              <p className="mt-1 text-sm text-gray-400">Your host and guest views use the same image.</p>
            </div>
            <button type="button" onClick={() => setShowSettings(false)} aria-label="Close profile settings" className="rounded-full p-2 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"><X size={20} /></button>
          </div>
          <div className="mt-6 flex items-center gap-4">
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center bg-gradient-to-br from-yellow-400 to-yellow-500 [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)]">
              {profileImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profileImage} alt="Your profile" className="absolute inset-0 h-full w-full object-cover" />
              ) : <User size={22} className="text-black" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">{session?.user?.name || userEmail || 'Beat Hive account'}</p>
              <p className="mt-1 text-xs text-gray-500">Upload a custom image or use your account photo.</p>
            </div>
          </div>
          <div className="mt-6"><PartyHistorySection history={partyHistory} isLoading={isPartyHistoryLoading} /></div>
          <input ref={customIconInputRef} type="file" accept="image/*" className="hidden" onChange={handleCustomIconUpload} />
          <div className="mt-6 flex gap-3">
            <button type="button" onClick={() => customIconInputRef.current?.click()} className="flex-1 rounded-lg bg-yellow-500 py-3 text-sm font-bold text-black transition-colors hover:bg-yellow-400">Upload image</button>
            {customIcon && <button type="button" onClick={() => setCustomIcon(null)} className="flex-1 rounded-lg border border-white/15 py-3 text-sm font-bold text-white transition-colors hover:bg-white/10">Use account photo</button>}
          </div>
        </motion.section>
      </motion.div>
    </AnimatePresence>
  );
  if (!isUserLoggedIn) {
    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-center p-6 text-center bg-[#111] overflow-hidden relative">
        {/* Background ambient light */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-yellow-500/10 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="max-w-md w-full flex flex-col items-center z-10">
          <div className="w-24 h-24 mb-8 bg-gradient-to-br from-yellow-400 to-amber-600 relative flex items-center justify-center shape-octagon shadow-[0_0_50px_rgba(245,158,11,0.3)]">
            <div className="shape-octagon-inner bg-[#111] m-1 absolute inset-1 flex items-center justify-center z-0"></div>
            <Music size={36} className="text-yellow-500 z-10" />
          </div>
          
          <div className="space-y-3 mb-12">
            <h1 className="text-5xl font-black tracking-tight text-white">
              Beat<span className="text-yellow-500">Hive</span>
            </h1>
            <p className="text-gray-400 font-medium text-lg max-w-[280px] mx-auto">
              Join the crowd. Control the music. Tip the Hive Host.
            </p>
          </div>

          <div className="w-full space-y-4">
            <button
              onClick={() => signIn('google', { callbackUrl: '/' })}
              className="w-full py-4 px-6 bg-white hover:bg-gray-100 text-[#111] font-bold text-lg rounded-xl flex items-center justify-center gap-3 transition-transform active:scale-95 shadow-lg"
            >
              <svg viewBox="0 0 24 24" width="24" height="24" className="shrink-0" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-[#333]"></div>
              <span className="flex-shrink-0 mx-4 text-[#666] text-sm font-semibold uppercase tracking-wider">or</span>
              <div className="flex-grow border-t border-[#333]"></div>
            </div>

            <button
              onClick={handleSignIn}
              className="w-full py-4 px-6 bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-white font-bold text-lg rounded-xl flex items-center justify-center gap-3 transition-transform active:scale-95"
            >
              <Mail size={22} className="text-gray-400" />
              Sign up with Email
            </button>
          </div>
          
          <p className="mt-8 text-xs text-gray-500 max-w-[280px] mx-auto leading-relaxed">
            By continuing, you agree to BeatHive&apos;s <NextLink href="/terms" className="underline decoration-gray-600 underline-offset-2 hover:text-white transition-colors">Terms of Service</NextLink> and <NextLink href="/privacy" className="underline decoration-gray-600 underline-offset-2 hover:text-white transition-colors">Privacy Policy</NextLink>.
          </p>
        </div>
      </main>
    );
  }

  // State 2: Select Role (DJ vs Guest)
  if (userRole === 'none' || (userRole === 'dj' && !djRoomActive && !hostSetupRequested)) {
    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-center p-6 text-center bg-[#111] relative">
        <button
          onClick={async () => {
            setIsAuthenticated(false);
            if (session) {
              await signOut({ redirect: false });
            }
            window.scrollTo(0, 0);
          }}
          className="absolute top-6 left-6 p-2 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors flex items-center gap-2"
          aria-label="Go back"
        >
          <ArrowLeft size={20} />
          <span className="text-sm font-medium pr-1">Back</span>
        </button>

        <div className="max-w-md w-full flex flex-col items-center space-y-6">
          <h2 className="text-3xl font-black tracking-tight text-white mb-2">
            Who are you today?
          </h2>
          
          <button
            onClick={() => handleSelectRole('dj')}
            className="w-full bg-[#1a1a1a] hover:bg-[#222] border border-yellow-500/30 p-6 rounded-3xl flex items-center gap-6 group transition-all"
          >
            <div className="w-16 h-16 rounded-2xl bg-yellow-500/10 text-yellow-500 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
               <Headphones size={32} />
            </div>
            <div className="text-left flex-1">
              <h3 className="text-xl font-bold text-white mb-1">Host a Room</h3>
              <p className="text-sm text-gray-400">I am the Hive Host or event organizer</p>
            </div>
            <ArrowRight className="text-gray-600 group-hover:text-yellow-500 transition-colors" />
          </button>

          <button
            onClick={() => handleSelectRole('guest')}
            className="w-full bg-[#1a1a1a] hover:bg-[#222] border border-white/5 p-6 rounded-3xl flex items-center gap-6 group transition-all"
          >
            <div className="w-16 h-16 rounded-2xl bg-white/5 text-gray-300 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
               <Users size={32} />
            </div>
            <div className="text-left flex-1">
              <h3 className="text-xl font-bold text-white mb-1">Join the Crowd</h3>
              <p className="text-sm text-gray-400">I want to request and interact</p>
            </div>
            <ArrowRight className="text-gray-600 group-hover:text-white transition-colors" />
          </button>
        </div>
      </main>
    );
  }

  const isMasterAccount = userEmail?.toLowerCase() === MASTER_CONTROL_EMAIL;
  const isMasterController = userRole === 'dj' && isMasterAccount && isMasterControlEnabled;

  // State 3A: DJ Mode (Room Setup & Dashboard)
  if (userRole === 'dj') {
    if (!djRoomActive) {
      return (
        <main className="min-h-[100dvh] flex flex-col items-center justify-center p-6 text-center bg-[#111]">
          <div className="max-w-md w-full bg-[#1a1a1a] p-8 rounded-3xl border border-white/5 shadow-2xl relative">
            <button onClick={() => { setHostSetupRequested(false); setUserRole('none'); }} className="absolute top-6 left-6 text-gray-500 hover:text-white">
              <X size={20} />
            </button>
            <button type="button" onClick={() => setShowSettings(true)} aria-label="Open profile settings" className="absolute right-6 top-6 flex h-10 w-10 items-center justify-center bg-gradient-to-br from-yellow-400 to-yellow-500 text-black [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)]">
              {profileImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profileImage} alt="Your profile" className="absolute inset-0 h-full w-full object-cover" />
              ) : <User size={18} />}
            </button>
            <div className="w-16 h-16 bg-yellow-500/10 text-yellow-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <Settings2 size={28} />
            </div>
            <h2 className="text-2xl font-black text-white mb-2">Create Session</h2>
            <p className="text-sm text-gray-400 mb-8">Configure your event settings</p>
            
            <div className="space-y-4 mb-8 text-left">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider pl-1">Room Name</label>
                <input data-tutorial-target="host-room-name" type="text" value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="e.g. Friday Night Live" className="w-full bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-500" />
              </div>
              
              <div className="bg-[#111] border border-white/10 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-white flex items-center gap-2">
                    <EyeOff size={16} className="text-gray-400" /> Anonymous Hive Host
                  </h4>
                  <p className="text-xs text-gray-500 mt-1">Hide your identity from the crowd</p>
                </div>
                <button data-tutorial-target="host-anonymous-toggle"
                  onClick={() => setIsAnonymousDJ(!isAnonymousDJ)}
                  className={`w-12 h-6 rounded-full transition-colors relative flex items-center px-1 ${isAnonymousDJ ? 'bg-yellow-500' : 'bg-gray-700'}`}
                >
                  <motion.div 
                    layout
                    className="w-4 h-4 bg-white rounded-full"
                    animate={{ x: isAnonymousDJ ? 24 : 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                </button>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider pl-1" htmlFor="co-host-emails">Additional Hive Hosts</label>
                <input id="co-host-emails" type="text" value={coHostInput} onChange={(event) => setCoHostInput(event.target.value)} placeholder="host@example.com, cohost@example.com" className="w-full bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-500" />
                <p className="text-xs text-gray-500">Optional. Add up to 10 signed-in accounts.</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider pl-1" htmlFor="opening-vibe">Opening Vibe</label>
                <select id="opening-vibe" value={openingVibe} onChange={(event) => setOpeningVibe(event.target.value)} className="w-full bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-500">
                  <option value="">Start with an empty queue</option>
                  {GENRE_TALLIES.map((genre) => <option key={genre.name} value={genre.name}>{genre.name}</option>)}
                </select>
                <p className="text-xs text-gray-500">Choose a genre to add up to five opening tracks.</p>
              </div>
            </div>

            <button data-tutorial-target="host-start-party"
              onClick={handleStartDJRoom}
              className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-lg rounded-xl transition-all shadow-lg shadow-yellow-500/20"
            >
              Start Party
            </button>
          </div>
          {hostProfileSettings}
          <Tutorial role="host" />
        </main>
      );
    }

    // Active DJ Dashboard
    if (!djPreviewingGuest) {
      return (
        <main className="min-h-[100dvh] flex flex-col p-6 bg-[#111]">
          <div className="max-w-md w-full mx-auto flex flex-col h-full space-y-6">
            <header className="flex items-center justify-between mt-4">
              <div>
                <h1 className="text-2xl font-black text-white flex items-center gap-2">
                  Live Dashboard <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                </h1>
                <p className="text-sm text-yellow-500 font-medium mb-2">Room: {roomName}</p>
                <button 
                  onClick={() => setIsAnonymousDJ(!isAnonymousDJ)}
                  className={`inline-flex items-center gap-2 text-[10px] px-2.5 py-1.5 rounded-md font-bold uppercase tracking-widest transition-all ${
                    isAnonymousDJ 
                      ? 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20' 
                      : 'bg-white/5 text-gray-400 hover:bg-white/10'
                  }`}
                >
                  <EyeOff size={12} />
                  {isAnonymousDJ ? 'Incognito Mode On' : 'Incognito Mode Off'}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setShowSettings(true)} title="Open profile settings" aria-label="Open profile settings" className="relative flex h-10 w-10 items-center justify-center overflow-hidden bg-gradient-to-br from-yellow-400 to-yellow-500 text-black [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)]">
                  {profileImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profileImage} alt="Your profile" className="absolute inset-0 h-full w-full object-cover" />
                  ) : <User size={18} />}
                </button>
                <button data-tutorial-target="host-end-session-trigger" onClick={() => setShowEndSessionConfirm(true)} title="End session" aria-label="End session" className="w-10 h-10 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>
            </header>

            <button data-tutorial-target="host-switch-to-hive"
              onClick={() => setDjPreviewingGuest(true)}
              className="w-full rounded-xl border-4 border-red-400 bg-yellow-500 py-3.5 font-black text-black shadow-[0_0_0_5px_rgba(248,113,113,.25),0_12px_30px_rgba(245,158,11,.22)] transition-all hover:bg-yellow-400 active:scale-[.98] flex items-center justify-center gap-2"
            >
              <ShieldAlert size={19} />
              Switch to Hive View
            </button>

            {isMasterAccount && <NextLink href="/youtube" className="w-full bg-[#1a1a1a] hover:bg-[#222] border border-white/10 text-white py-3 rounded-xl flex items-center justify-center gap-2 font-bold transition-colors">
              <ListMusic size={18} className="text-yellow-500" />
              Manage Hive Queue
            </NextLink>}

            <div className="bg-white rounded-3xl p-6 flex flex-col items-center justify-center relative overflow-hidden shadow-xl">
             <button data-tutorial-target="host-share-qr"
                onClick={() => setDjQrExpanded(!djQrExpanded)} 
                className="w-full flex items-center justify-between"
             >
                <div className="flex items-center gap-2">
                  <QrCode size={20} className="text-black" />
                  <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Let Crowd Scan</p>
                </div>
                <div className={`transform transition-transform text-black ${djQrExpanded ? 'rotate-180' : ''}`}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
             </button>

             <AnimatePresence initial={false}>
                {djQrExpanded && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="w-full overflow-hidden origin-top"
                  >
                    <div className="w-full flex flex-col items-center pt-6">
                      <div className="w-48 h-48 bg-white rounded-2xl border-4 border-gray-200 flex items-center justify-center mb-4 shrink-0 shadow-inner">
                        {roomLink && <QRCodeSVG value={roomLink} size={160} level="M" includeMargin />}
                      </div>
                      <p className="mb-3 text-center text-xs font-medium text-gray-500">Scan to join {roomName}</p>
                      <div className="w-full bg-gray-50 rounded-xl p-3 border border-gray-200 shadow-sm">
                        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center"><button onClick={() => void copyRoomLink()} title="Copy Hive link" className="flex h-8 w-full items-center justify-center gap-1 rounded bg-gray-200 px-2 text-xs font-bold text-gray-700 hover:bg-gray-300 sm:w-auto"><Copy size={14} />Copy Hive Link</button><button onClick={() => void shareRoomLink()} title="Send Hive invite" className="flex h-8 w-full items-center justify-center gap-1 rounded bg-yellow-500 px-2 text-xs font-bold text-black hover:bg-yellow-400 sm:w-auto"><Share2 size={14} />Send Hive Invite</button></div>
                      </div>
                      {shareStatus && <p className="mt-2 text-xs font-bold text-yellow-700" role="status">{shareStatus}</p>}
                    </div>
                  </motion.div>
                )}
             </AnimatePresence>
          </div>

          <div className="grid grid-cols-2 gap-4 flex-1">
             <NextLink data-tutorial-target="host-manage-queue" href="/youtube" onClick={acknowledgeRequests} className="bg-[#1a1a1a] rounded-2xl p-4 border border-white/5 flex flex-col transition-colors hover:border-yellow-500/50">
                <Search className="text-yellow-500 mb-2" size={24} />
               <span className="text-3xl font-black text-white">{newRequestCount}</span>
                <span className="text-sm text-gray-400 font-medium">New Hive Queue Requests</span>
             </NextLink>
             <div className="bg-[#1a1a1a] rounded-2xl p-4 border border-white/5 flex flex-col">
                <Speaker className="text-orange-500 mb-2" size={24} />
               <span className="text-3xl font-black text-white">{energyPreference === 'up' ? 'High' : energyPreference === 'down' ? 'Low' : 'Steady'}</span>
               <span className="text-sm text-gray-400 font-medium">Crowd Energy</span>
             </div>
             <div className="bg-[#1a1a1a] rounded-2xl p-4 border border-white/5 flex flex-col col-span-2">
                <Heart className="text-pink-500 mb-2" size={24} />
                <div className="flex items-end gap-2 text-white">
                  <span className="text-xl font-bold text-gray-400">$</span>
                  <span className="text-3xl font-black">45.00</span>
                </div>
                <span className="text-sm text-gray-400 font-medium">Tips Collected</span>
             </div>
          </div>
        </div>
          {hostProfileSettings}
          <Tutorial role="host" phase="session" />
          <AnimatePresence>
            {showEndSessionConfirm && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[10001] flex items-end bg-black/80 p-4 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-labelledby="end-session-title">
              <motion.section initial={{ y: 32, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 32, opacity: 0 }} className="w-full max-w-md rounded-xl border border-red-500/50 bg-[#1a1a1a] p-6 shadow-2xl">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-red-400"><ShieldAlert size={24} /></div>
                <h2 id="end-session-title" className="mt-5 text-2xl font-black text-white">End this session?</h2>
                <p className="mt-2 text-sm leading-6 text-gray-300">This stops the live party and removes your host controls. Guests will no longer be able to use this session.</p>
                <div className="mt-6 flex gap-3">
                  <button type="button" onClick={() => setShowEndSessionConfirm(false)} className="flex-1 rounded-lg border border-white/15 py-3 text-sm font-bold text-white hover:bg-white/10">Keep session live</button>
                  <button data-tutorial-target="host-end-session" type="button" onClick={endSession} className="flex-1 rounded-lg bg-red-500 py-3 text-sm font-black text-white hover:bg-red-400">End session</button>
                </div>
              </motion.section>
            </motion.div>}
          </AnimatePresence>
      </main>
      );
    }
  }

  // State 3B: Guest flow - scan QR
  if (userRole === 'guest' && !hasAccess && !isMasterController) {
    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-center p-6 text-center bg-[#111]">
        <div className="max-w-md w-full flex flex-col items-center space-y-8 bg-[#1a1a1a] p-8 rounded-3xl shadow-2xl border border-yellow-500/20 relative">
          <button onClick={() => setUserRole('none')} className="absolute top-6 left-6 text-gray-500 hover:text-white">
            <X size={20} />
          </button>
          <div className="w-24 h-24 bg-yellow-500/10 text-yellow-500 rounded-full flex items-center justify-center mb-2 mt-4">
             <QrCode size={48} strokeWidth={1.5} />
          </div>
          
          <div className="space-y-4">
            <h2 className="text-3xl font-black tracking-tight text-white mb-2">
              Join the Room
            </h2>
            <p className="text-gray-400 font-medium text-base leading-relaxed">
              You are logged in! Now scan the Hive Host&apos;s venue QR code to join the live session and take control.
            </p>
          </div>

          <div className="space-y-4 w-full relative">
            <AnimatePresence mode="popLayout" initial={false}>
              {!qrExpanded ? (
                <motion.button
                  key="scan-btn"
                  initial={{ opacity: 0, height: 0, y: -10 }}
                  animate={{ opacity: 1, height: "auto", y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -10 }}
                  transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
                  onClick={() => { setQrExpanded(true); setIsQrScanning(true); setQrScanError(''); }}
                  className="w-full py-4 px-6 bg-yellow-500 mb-4 hover:bg-yellow-400 text-black font-bold text-xl rounded-xl flex items-center justify-center gap-3 active:scale-95 shadow-lg shadow-yellow-500/20 origin-top"
                >
                  <QrCode size={24} />
                  Scan QR
                </motion.button>
              ) : (
                <motion.div
                  key="scan-view"
                  initial={{ opacity: 0, height: 0, y: -10 }}
                  animate={{ opacity: 1, height: "auto", y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -10 }}
                  transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
                  className="w-full flex flex-col gap-4 overflow-hidden origin-top mb-4"
                >
                  {isQrScanning && <div className="overflow-hidden rounded-xl border border-yellow-500/40 bg-black"><Scanner onScan={handleQrScan} onError={() => setQrScanError('Camera access is unavailable. Enter the room link instead.')} constraints={{ facingMode: 'environment' }} formats={['qr_code']} sound={false} classNames={{ container: 'w-full', video: 'w-full' }} /></div>}
                  {qrScanError && <p className="text-sm text-red-400" role="alert">{qrScanError}</p>}
                  <NextLink href="/join" className="w-full py-4 px-6 bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-white font-bold text-lg rounded-xl flex items-center justify-center gap-3 transition-transform active:scale-95"><Link size={22} className="text-gray-400" />Enter Room Link</NextLink>
                  <button
                    onClick={() => { setIsQrScanning(false); setQrExpanded(false); }}
                    className="w-full py-2 px-6 bg-transparent text-gray-400 font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-all hover:text-white"
                  >
                    Cancel
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-[#333]"></div>
              <span className="flex-shrink-0 mx-4 text-[#666] text-sm font-semibold uppercase tracking-wider">or</span>
              <div className="flex-grow border-t border-[#333]"></div>
            </div>
            <NextLink
              href="/join"
              className="w-full py-4 px-6 bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-white font-bold text-lg rounded-xl flex items-center justify-center gap-3 transition-transform active:scale-95"
            >
              <Link size={22} className="text-gray-400" />
              Enter Room Link
            </NextLink>
          </div>
        </div>
      </main>
    );
  }

  const canSwitchRole = Boolean(userEmail);

  const hasPreviousTrack = (() => {
    try {
      const queue = JSON.parse(window.localStorage.getItem('bh_play_queue') || '[]') as NowPlayingTrack[];
      const currentIndex = queue.findIndex((track) => track.videoId === nowPlaying?.videoId);
      if (currentIndex > 0) return true;
      const history = JSON.parse(window.localStorage.getItem('bh_play_history') || '[]') as NowPlayingTrack[];
      return history.some((track) => track.videoId !== nowPlaying?.videoId);
    } catch {
      return false;
    }
  })();

  const hasNextQueuedTrack = (() => {
    try {
      const queue = JSON.parse(window.localStorage.getItem('bh_play_queue') || '[]') as NowPlayingTrack[];
      const currentIndex = queue.findIndex((track) => track.videoId === nowPlaying?.videoId);
      return currentIndex >= 0 && currentIndex < queue.length - 1;
    } catch {
      return false;
    }
  })();

  // State 3: Main App Interface
  return (
    <main className="min-h-[100dvh] flex flex-col font-sans overflow-hidden pt-4 pb-20 bg-[#111]">
      <div className="w-full max-w-md mx-auto relative px-4 flex flex-col h-full">
        
        {/* Header Area with Top Navigation */}
        <div className="relative w-full flex items-center justify-center mb-4 mt-2">
          {/* Top Left Settings Button */}
          {!showSettings && (
            <button
              onClick={() => setShowSettings(true)}
              className="absolute left-2 z-50 h-10 w-10 bg-gradient-to-br from-yellow-400 to-yellow-500 hover:from-yellow-300 hover:to-yellow-400 transition-all duration-300 flex items-center justify-center [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)] shadow-lg shadow-yellow-500/30 active:scale-95 sm:left-8 sm:h-14 sm:w-14"
              aria-label="Open profile settings"
            >
              {profileImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profileImage} alt="Your profile" className="absolute inset-0 h-full w-full object-cover shape-octagon" />
              ) : (
                <User size={20} className="text-black" />
              )}
            </button>
          )}

          {/* Centered Brand Header */}
          <header className="text-center">
            <h1 className="text-3xl font-black mb-1 text-white flex items-center justify-center gap-2">
              Beat<span className="text-yellow-500">Hive</span>
            </h1>
            <p className="text-xs text-yellow-500/80 uppercase tracking-widest font-bold">Live Queue Control</p>
          </header>
        </div>

        {userRole === 'guest' && joinedRoom && <div className="mb-4 flex items-center justify-center gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-3 py-2 text-center text-xs text-yellow-100"><span className="h-2 w-2 shrink-0 rounded-full bg-yellow-500" />Connected to {joinedRoom.hostName}&apos;s room: {joinedRoom.roomName}</div>}

        {/* Currently Playing Card */}
        {nowPlaying && <div className="bg-[#1a1a1a] rounded-2xl p-4 mb-4 border border-white/5 relative overflow-hidden shadow-xl drop-shadow-2xl z-10 shrink-0 w-full mx-auto">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-600 via-yellow-400 to-yellow-600"></div>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 bg-[#222] rounded-lg shadow-lg relative overflow-hidden shrink-0 border border-white/10">
              {/* Using a standard img tag for simplicity in this pure client component or we could also use Next/Image */}
              <img 
                src={nowPlaying.thumbnail || "/images/asake-happiness.jpg"}
                alt={`${nowPlaying.title} cover art`}
                className="w-full h-full object-cover" 
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] text-gray-500 font-bold mb-0.5 uppercase tracking-widest flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                Now Playing
              </p>
              <h2 className="font-bold text-sm leading-tight text-white truncate">{nowPlaying.title}</h2>
              <p className="text-[10px] text-yellow-500 font-semibold truncate mt-0.5">{nowPlaying.channelTitle}</p>
            </div>
            {isMasterController && <>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={handlePreviousTrack}
                disabled={!hasPreviousTrack}
                title="Play previous song"
                aria-label="Play previous song"
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-gray-200 hover:bg-yellow-500 hover:text-black transition-colors shrink-0 disabled:bg-[#222] disabled:text-gray-600 disabled:cursor-not-allowed"
              >
                <SkipBack size={14} fill="currentColor" />
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => setIsPlaying(!isPlaying)}
                disabled={!nowPlaying?.videoId}
                title={nowPlaying?.videoId ? (isPlaying ? 'Pause track' : 'Play track') : 'Add a queued song to play it'}
                aria-label={nowPlaying?.videoId ? (isPlaying ? 'Pause track' : 'Play track') : 'Add a queued song to play it'}
                className="w-8 h-8 rounded-full bg-yellow-500 flex items-center justify-center text-black hover:bg-yellow-400 transition-colors shrink-0 disabled:bg-[#222] disabled:text-gray-600 disabled:cursor-not-allowed"
              >
                {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={handleNextTrack}
                disabled={!hasNextQueuedTrack}
                title="Play next queued song"
                aria-label="Play next queued song"
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-gray-200 hover:bg-yellow-500 hover:text-black transition-colors shrink-0 disabled:bg-[#222] disabled:text-gray-600 disabled:cursor-not-allowed"
              >
                <SkipForward size={14} fill="currentColor" />
              </motion.button>
            </>}
          </div>
        </div>}

        {/* View Toggle */}
        <div data-tutorial-target="guest-view-toggle" className="mx-auto mb-8 mt-4 flex shrink-0 items-center gap-2">
          <div className="flex bg-[#1a1a1a] rounded-xl p-1 border border-white/5 w-48 relative overflow-hidden">
            <motion.div
              layout
              className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-[#2a2a2a] rounded-lg shadow-md border border-white/5 z-0"
              initial={false}
              animate={{
                x: viewMode === 'globe' ? 0 : '100%',
                left: '4px'
              }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
            <button
              onClick={() => setViewMode('globe')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 relative z-10 text-sm font-semibold transition-colors ${viewMode === 'globe' ? 'text-yellow-500' : 'text-gray-500 hover:text-gray-300'}`}
            >
              <Globe size={16} /> Globe
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 relative z-10 text-sm font-semibold transition-colors ${viewMode === 'list' ? 'text-yellow-500' : 'text-gray-500 hover:text-gray-300'}`}
            >
              <List size={16} /> List
            </button>
          </div>
          <NextLink data-tutorial-target="guest-queue-link" href="/youtube" title="View your queue" aria-label="View your queue" className="flex h-12 w-12 items-center justify-center rounded-xl border border-yellow-500/30 bg-yellow-500/10 text-yellow-500 transition-colors hover:bg-yellow-500 hover:text-black">
            <ListMusic size={20} />
          </NextLink>
        </div>

        {userRole === 'dj' && djPreviewingGuest && (
          <div className="flex justify-center mb-8 shrink-0 relative z-20">
            <button 
              onClick={() => setDjPreviewingGuest(false)}
              className="w-full max-w-xs rounded-xl border-4 border-red-400 bg-yellow-500 px-5 py-3 font-black text-sm text-black shadow-[0_0_0_5px_rgba(248,113,113,.25),0_12px_30px_rgba(245,158,11,.22)] flex items-center justify-center gap-2 transition-all hover:bg-yellow-400 active:scale-[.98]"
            >
              <ShieldAlert size={17} />
              Return to Hive Host View
            </button>
          </div>
        )}

        {/* Conditional View Rendering */}
        {viewMode === 'globe' ? (
          <SphereCarousel userRole={userRole} energyPreference={energyPreference} onEnergyChange={setEnergyPreference} selectedVibe={selectedVibe} onVibeChange={setSelectedVibe} lastShoutout={lastShoutout} onShoutout={setLastShoutout} tipTotal={tipTotal} onTip={(amount) => setTipTotal((total) => total + amount)} />
        ) : (
          <ActionList userRole={userRole} energyPreference={energyPreference} onEnergyChange={setEnergyPreference} selectedVibe={selectedVibe} onVibeChange={setSelectedVibe} lastShoutout={lastShoutout} onShoutout={setLastShoutout} tipTotal={tipTotal} onTip={(amount) => setTipTotal((total) => total + amount)} />
        )}

      </div>

      {userRole === 'guest' && <Tutorial role="guest" />}

      {/* Settings Modal Layer using AnimatePresence */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 isolate flex items-end sm:items-center justify-center bg-[#111] p-4 pb-0 sm:pb-4"
            style={{ zIndex: 9999 }}
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-md max-h-[calc(100dvh-1rem)] overflow-y-auto bg-[#1a1a1a] border-t border-x sm:border border-white/10 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl relative"
            >
              <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-6 sm:hidden" />
              
              <button 
                onClick={() => setShowSettings(false)}
                className="absolute top-6 right-6 p-2 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 transition-colors"
              >
                <X size={20} />
              </button>

              <h2 className="text-2xl font-black text-white mb-6">Settings</h2>

              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3">Your Icon</h3>
                  <div className="flex flex-col gap-3 bg-[#111] p-4 rounded-xl border border-white/10 md:flex-row md:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="w-12 h-14 shrink-0 relative flex items-center justify-center">
                        <div className="absolute inset-0 bg-gradient-to-br from-yellow-400 to-yellow-500 shape-octagon" />
                        {profileImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={profileImage} alt="Your profile preview" className="absolute inset-0 h-full w-full object-cover shape-octagon" />
                        ) : (
                          <User size={20} className="relative z-10 text-black" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">Profile icon</p>
                        <p className="text-xs text-gray-500 mt-0.5">JPG, PNG, or GIF up to 1 MB</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <input ref={customIconInputRef} type="file" accept="image/*" className="hidden" onChange={handleCustomIconUpload} />
                      <button onClick={() => customIconInputRef.current?.click()} className="shrink-0 rounded-lg bg-yellow-500 px-3 py-2 text-sm font-bold text-black hover:bg-yellow-400">
                        Upload
                      </button>
                      {customIcon && (
                        <button onClick={() => setCustomIcon(null)} className="shrink-0 text-sm font-bold text-gray-400 hover:text-white" aria-label="Remove custom icon">
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-4"><PartyHistorySection history={partyHistory} isLoading={isPartyHistoryLoading} /></div>
                  {session && (
                    <button
                      onClick={() => {
                        try { localStorage.removeItem('bh_isAuthenticated'); } catch {}
                        signOut({ callbackUrl: '/' });
                      }}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-yellow-500/30 bg-[#111] px-4 py-3 text-sm font-bold text-yellow-500 transition-colors hover:bg-yellow-500 hover:text-black"
                    >
                      <LogOut size={17} /> Sign out
                    </button>
                  )}
                  <button type="button" onClick={() => replayTutorial(userRole === 'dj' ? 'host' : 'guest', userRole === 'dj' && djRoomActive ? 'session' : 'setup')} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-[#111] px-4 py-3 text-sm font-bold text-gray-200 transition-colors hover:border-yellow-500/50 hover:text-yellow-500">
                    <Play size={16} fill="currentColor" /> Replay {userRole === 'dj' ? 'Hive Host' : 'Hive User'} Tutorial
                  </button>
                  {userRole === 'guest' && joinedRoom && <button type="button" onClick={leaveSession} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300 transition-colors hover:bg-red-500 hover:text-white">
                    <LogOut size={16} /> Leave session
                  </button>}
                </div>
                {canSwitchRole && <div>
                  <h3 className="mb-3 text-sm font-bold uppercase tracking-widest text-gray-400">Use Beat Hive As</h3>
                  <div className="grid grid-cols-2 rounded-xl border border-white/10 bg-[#111] p-1">
                    <button onClick={() => { setUserRole('guest'); setHasAccess(false); setShowSettings(false); }} className={`flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold transition-colors ${userRole === 'guest' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-white'}`} aria-pressed={userRole === 'guest'}>
                      <User size={17} /> Guest
                    </button>
                    <button onClick={() => { setHostSetupRequested(true); setUserRole('dj'); setDjRoomActive(false); setIsPartyCreator(false); setShowSettings(false); }} className={`flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold transition-colors ${userRole === 'dj' ? 'bg-yellow-500 text-black' : 'text-gray-500 hover:text-yellow-500'}`} aria-pressed={userRole === 'dj'}>
                      <Headphones size={17} /> Hive Host
                    </button>
                  </div>
                </div>}
                <div>
                  <button onClick={() => setShowMusicSources(!showMusicSources)} className="w-full flex items-center justify-between rounded-xl bg-[#111] p-4 text-left border border-white/10 text-white hover:border-yellow-500/50 transition-colors">
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-widest">Music Source</h3>
                      <p className="text-xs text-gray-500 mt-1">{musicSource ? `${musicSource[0].toUpperCase()}${musicSource.slice(1)} connected` : 'Choose a streaming service'}</p>
                    </div>
                    <ChevronDown size={20} className={`text-yellow-500 transition-transform ${showMusicSources ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence initial={false}>
                    {showMusicSources && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="grid grid-cols-1 gap-3 overflow-hidden pt-3"
                      >
                                        <button 
                                          onClick={async () => {
                                            if (session) {
                                              setMusicSource('youtube');
                                              window.location.href = '/youtube';
                                            } else if (musicSource !== 'youtube') {
                                              await signIn('google', { callbackUrl: '/youtube' });
                                              setMusicSource('youtube');
                                            } else {
                                              window.location.href = '/youtube';
                                            }
                                          }}
                                          className={`
                                            w-full p-4 rounded-xl flex items-center justify-between border transition-all
                                            ${musicSource === 'youtube' 
                                              ? 'bg-[#FF0000]/10 border-[#FF0000] text-white shadow-[0_0_20px_rgba(255,0,0,0.15)]' 
                                              : 'bg-[#111] border-white/10 text-gray-400 hover:border-white/20'
                                            }
                                          `}
                                        >
                                          <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-[#FF0000] flex items-center justify-center p-2 text-white">
                                               {/* YouTube logo SVG */}
                                               <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M23.498 6.186a2.998 2.998 0 0 0-2.112-2.112C19.1 3.5 12 3.5 12 3.5s-7.1 0-9.386.574A2.998 2.998 0 0 0 .502 6.186C0 8.472 0 12 0 12s0 3.528.502 5.814a2.998 2.998 0 0 0 2.112 2.112C4.9 20.5 12 20.5 12 20.5s7.1 0 9.386-.574a2.998 2.998 0 0 0 2.112-2.112C24 15.528 24 12 24 12s0-3.528-.502-5.814zM9.545 15.568V8.432l6.545 3.568-6.545 3.568z"/></svg>
                                            </div>
                                            <span className="font-bold text-lg">YouTube</span>
                                          </div>
                                          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-white/5 border border-white/10">
                                            {musicSource === 'youtube' ? 'Connected' : 'Connect'}
                                          </span>
                                        </button>
                    <button 
                      onClick={() => {
                        if (session) {
                          try { localStorage.removeItem('bh_isAuthenticated'); } catch {}
                          signOut({ callbackUrl: '/' });
                          setMusicSource(null);
                        } else {
                          signIn('spotify', { callbackUrl: '/' });
                          setMusicSource('spotify');
                        }
                      }}
                      className={`
                        w-full p-4 rounded-xl flex items-center justify-between border transition-all
                        ${session  
                          ? 'bg-[#1DB954]/10 border-[#1DB954] text-white shadow-[0_0_20px_rgba(29,185,84,0.15)]' 
                          : 'bg-[#111] border-white/10 text-gray-400 hover:border-white/20'
                        }
                      `}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#1DB954] flex items-center justify-center p-2 text-black">
                           {/* Using a simple custom SVG for Spotify so we don't need external libraries */}
                           <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                             <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.48-1.02.659-1.56.3z" />
                           </svg>
                        </div>
                        <span className="font-bold text-lg">Spotify</span>
                      </div>
                      <span className="text-xs font-semibold px-3 py-1 rounded-full bg-white/5 border border-white/10">
                        {session ? 'Connected' : 'Connect'}
                      </span>
                    </button>

                    <button 
                      onClick={handleAppleMusicAuth}
                      className={`
                        w-full p-4 rounded-xl flex items-center justify-between border transition-all
                        ${musicSource === 'apple' 
                          ? 'bg-[#FA243C]/10 border-[#FA243C] text-white shadow-[0_0_20px_rgba(250,36,60,0.15)]' 
                          : 'bg-[#111] border-white/10 text-gray-400 hover:border-white/20'
                        }
                      `}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FA243C] to-[#F13360] flex items-center justify-center p-2 text-white">
                           <Music size={20} className="fill-white" />
                        </div>
                        <span className="font-bold text-lg">Apple Music</span>
                      </div>
                      <span className="text-xs font-semibold px-3 py-1 rounded-full bg-white/5 border border-white/10">
                        {musicSource === 'apple' ? 'Connected' : 'Connect'}
                      </span>
                    </button>

                    <button
                      onClick={() => {
                        if (session) {
                          try { localStorage.removeItem('bh_isAuthenticated'); } catch {}
                          signOut({ callbackUrl: '/' });
                        } else {
                          signIn('google', { callbackUrl: '/' });
                        }
                      }}
                      className={`
                        w-full p-4 rounded-xl flex items-center justify-between border transition-all
                        ${session ? 'bg-[#4285F4]/10 border-[#4285F4] text-white' : 'bg-[#111] border-white/10 text-gray-400 hover:border-white/20'}
                      `}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#4285F4] flex items-center justify-center p-2 text-white">
                          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M21.35 11.1h-9.18v2.92h5.26c-.23 1.47-1.43 4.32-5.26 4.32-3.17 0-5.75-2.61-5.75-5.82s2.58-5.82 5.75-5.82c1.79 0 3.01.76 3.7 1.42l2.52-2.43C16.91 3.12 14.75 2 12 2 6.48 2 2 6.58 2 12s4.48 10 10 10c5.75 0 9.78-4.02 9.78-9.68 0-.65-.07-1.2-.43-1.52z"/></svg>
                        </div>
                        <span className="font-bold text-lg">Google</span>
                      </div>
                      <span className="text-xs font-semibold px-3 py-1 rounded-full bg-white/5 border border-white/10">
                        {session ? 'Sign out' : 'Sign in'}
                      </span>
                    </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </main>
  );
}

function EnergyControls({ energyPreference, onEnergyChange }: { energyPreference: 'up' | 'down' | null; onEnergyChange: React.Dispatch<React.SetStateAction<'up' | 'down' | null>> }) {
  const selectEnergy = (preference: 'up' | 'down') => onEnergyChange((currentPreference) => currentPreference === preference ? null : preference);

  return (
    <div className="flex gap-2 pt-1">
      <button type="button" onClick={(event) => { event.stopPropagation(); selectEnergy('up'); }} aria-pressed={energyPreference === 'up'} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-bold transition-colors ${energyPreference === 'up' ? 'bg-yellow-500 text-black' : 'bg-white/5 text-gray-200 hover:bg-yellow-500 hover:text-black'}`}>
        <Flame size={18} /> Raise energy
      </button>
      <button type="button" onClick={(event) => { event.stopPropagation(); selectEnergy('down'); }} aria-pressed={energyPreference === 'down'} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-bold transition-colors ${energyPreference === 'down' ? 'bg-sky-400 text-black' : 'bg-white/5 text-gray-200 hover:bg-sky-400 hover:text-black'}`}>
        <Volume1 size={18} /> Ease it down
      </button>
    </div>
  );
}

type ActionControlsProps = {
  actionId: string;
  userRole: string;
  energyPreference: 'up' | 'down' | null;
  onEnergyChange: React.Dispatch<React.SetStateAction<'up' | 'down' | null>>;
  selectedVibe: string | null;
  onVibeChange: React.Dispatch<React.SetStateAction<string | null>>;
  lastShoutout: string | null;
  onShoutout: React.Dispatch<React.SetStateAction<string | null>>;
  tipTotal: number;
  onTip: (amount: number) => void;
};

function ActionControls({ actionId, userRole, energyPreference, onEnergyChange, selectedVibe, onVibeChange, lastShoutout, onShoutout, tipTotal, onTip }: ActionControlsProps) {
  const [shoutoutDraft, setShoutoutDraft] = useState('');
  const { room, sendFeedback } = useRoom();
  const syncFeedback = (feedback: Record<string, unknown>) => {
    if (room) void sendFeedback(feedback).catch(() => undefined);
  };

  if (actionId === 'hive') return <NextLink href="/hive" className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-yellow-500 px-4 py-3 font-bold text-black hover:bg-yellow-400"><Users size={18} /> Enter the Hive</NextLink>;
  if (actionId === 'request') return <NextLink href="/youtube" className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-yellow-500 px-4 py-3 font-bold text-black hover:bg-yellow-400"><Search size={18} /> Find a track</NextLink>;
  if (actionId === 'queue' || actionId === 'upvote') return <NextLink href="/youtube" className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-yellow-500 px-4 py-3 font-bold text-black hover:bg-yellow-400">{actionId === 'upvote' ? <ThumbsUp size={18} /> : <ListMusic size={18} />}{actionId === 'upvote' ? ' Vote on requests' : ' View your queue'}</NextLink>;
  if (actionId === 'energy') return <EnergyControls energyPreference={energyPreference} onEnergyChange={(update) => { onEnergyChange(update); const nextValue = typeof update === 'function' ? update(energyPreference) : update; syncFeedback({ energyPreference: nextValue }); }} />;
  if (actionId === 'vibes') return <div className="flex flex-wrap gap-2 pt-1">{GENRE_TALLIES.map((genre) => <button key={genre.name} type="button" onClick={(event) => { event.stopPropagation(); const nextValue = selectedVibe === genre.name ? null : genre.name; onVibeChange(nextValue); syncFeedback({ selectedVibe: nextValue }); }} aria-pressed={selectedVibe === genre.name} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${selectedVibe === genre.name ? 'bg-yellow-500 text-black' : 'bg-white/5 text-gray-200 hover:bg-yellow-500 hover:text-black'}`}><span>{genre.name}</span>{userRole === 'dj' && <span className="text-[10px] opacity-70">{genre.count}</span>}</button>)}</div>;
  if (actionId === 'shoutout') return <form className="space-y-2 pt-1" onSubmit={(event) => { event.preventDefault(); const message = shoutoutDraft.trim(); if (!message) return; onShoutout(message); syncFeedback({ lastShoutout: message }); setShoutoutDraft(''); }}><label className="sr-only" htmlFor="shoutout-message">Message for the Hive Host</label><textarea id="shoutout-message" value={shoutoutDraft} onChange={(event) => setShoutoutDraft(event.target.value)} onClick={(event) => event.stopPropagation()} maxLength={180} placeholder="Send a message to the Hive Host" className="min-h-20 w-full resize-none rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white outline-none placeholder:text-gray-500 focus:border-yellow-500" /><button type="submit" className="flex w-full items-center justify-center gap-2 rounded-lg bg-yellow-500 px-4 py-3 text-sm font-bold text-black hover:bg-yellow-400"><MessageSquare size={17} /> Send shoutout</button>{lastShoutout && <p className="text-center text-xs text-gray-400">Last sent: {lastShoutout}</p>}</form>;
  if (actionId === 'tip') return <div className="space-y-2 pt-1"><div className="grid grid-cols-3 gap-2">{[2, 5, 10].map((amount) => <button key={amount} type="button" onClick={(event) => { event.stopPropagation(); onTip(amount); syncFeedback({ tipTotal: tipTotal + amount }); }} className="rounded-lg bg-white/5 px-3 py-3 text-sm font-bold text-gray-100 hover:bg-pink-500 hover:text-white">${amount}</button>)}</div><p className="text-center text-xs text-gray-400">Support recorded: ${tipTotal.toFixed(2)}. Payments require a connected payment provider.</p></div>;
  return null;
}

function ActionList({ userRole, energyPreference, onEnergyChange, selectedVibe, onVibeChange, lastShoutout, onShoutout, tipTotal, onTip }: Omit<ActionControlsProps, 'actionId'>) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3 w-full max-w-md mx-auto flex-1 overflow-y-auto pb-6 scrollbar-hide stylish-scrollbar">
      {HIVE_ITEMS.map((item, i) => (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          key={item.id}
          data-tutorial-target={item.id === 'request' ? 'guest-request-action' : item.id === 'hive' ? 'guest-hive-action' : item.id === 'upvote' ? 'guest-upvote-action' : item.id === 'energy' ? 'guest-feedback-action' : undefined}
          className="bg-[#1a1a1a] border border-[#333] hover:border-yellow-500/50 transition-colors p-4 rounded-2xl flex flex-col gap-4 cursor-pointer group"
          onClick={() => item.id === 'hive' ? window.location.assign('/hive') : setExpandedId(expandedId === item.id ? null : item.id)}
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 shrink-0 flex items-center justify-center text-gray-400 group-hover:text-black transition-all relative">
              <div className="shape-octagon bg-[#222] group-hover:bg-gradient-to-br group-hover:from-yellow-400 group-hover:to-amber-600 shadow-md" />
              <div className="shape-octagon-inner bg-[#161616] group-hover:bg-transparent transition-colors z-0"></div>
              <div className="relative z-10 scale-[0.6]">{item.icon}</div>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-white group-hover:text-yellow-500 transition-colors mb-1">{item.title}</h3>
              <p className="text-sm text-gray-400 leading-tight">{item.description}</p>
            </div>
          </div>
          
          <AnimatePresence>
            {expandedId === item.id && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <ActionControls actionId={item.id} userRole={userRole} energyPreference={energyPreference} onEnergyChange={onEnergyChange} selectedVibe={selectedVibe} onVibeChange={onVibeChange} lastShoutout={lastShoutout} onShoutout={onShoutout} tipTotal={tipTotal} onTip={onTip} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ))}
    </div>
  );
}

function SphereCarousel({ userRole, energyPreference, onEnergyChange, selectedVibe, onVibeChange, lastShoutout, onShoutout, tipTotal, onTip }: Omit<ActionControlsProps, 'actionId'>) {
  const rotX = useMotionValue(initTargetX);
  const rotY = useMotionValue(initTargetY);
  
  const [activeId, setActiveId] = useState(ALL_ITEMS[0].id);
  const [globeScale, setGlobeScale] = useState(1);

  const isDragging = useRef(false);
  const isSnapping = useRef(false);
  const dragDistance = useRef(0);
  const dragThreshold = useRef(12);
  const didDragRef = useRef(false);
  const prevTouch = useRef<{ x: number; y: number } | null>(null);
  const velocity = useRef({ x: 0, y: 0 });
  const lastTime = useRef(0);
  const lastMoveTime = useRef(0);
  const animFrameRef = useRef<number | null>(null);

  const stopInertia = () => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  };

  const startInertia = () => {
    let previousFrame = performance.now();
    const continueMotion = (now: number) => {
      const elapsed = Math.min(32, now - previousFrame);
      previousFrame = now;
      if (Math.hypot(velocity.current.x, velocity.current.y) < 0.00015) {
        stopInertia();
        return;
      }

      const VERTICAL_LIMIT = Math.PI / 2.2;
      rotX.set(Math.max(-VERTICAL_LIMIT, Math.min(VERTICAL_LIMIT, rotX.get() + velocity.current.y * elapsed)));
      rotY.set(rotY.get() + velocity.current.x * elapsed);
      velocity.current = { x: velocity.current.x * 0.91, y: velocity.current.y * 0.91 };
      animFrameRef.current = requestAnimationFrame(continueMotion);
    };
    animFrameRef.current = requestAnimationFrame(continueMotion);
  };

  useEffect(() => {
    return () => stopInertia();
  }, []);

  useEffect(() => {
    const updateGlobeScale = () => setGlobeScale(window.innerWidth < 640 ? 0.72 : 1);
    updateGlobeScale();
    window.addEventListener('resize', updateGlobeScale);
    return () => window.removeEventListener('resize', updateGlobeScale);
  }, []);

  const snapToItem = (item: any) => {
    stopInertia();
    rotX.stop();
    rotY.stop();
    isSnapping.current = true;
    setActiveId(item.id);
    const { targetX, targetY } = getTargetAnglesForItem(item);
    
    let doneX = false;
    let doneY = false;
    const onDone = () => {
      if (doneX && doneY) {
        isSnapping.current = false;
      }
    };

    animate(rotX, getNearestAngle(rotX.get(), targetX), { 
      type: 'spring', 
      stiffness: 280, 
      damping: 28,
      mass: 0.9,
      onComplete: () => { doneX = true; onDone(); }
    });
    animate(rotY, getNearestAngle(rotY.get(), targetY), { 
      type: 'spring', 
      stiffness: 280, 
      damping: 28,
      mass: 0.9,
      onComplete: () => { doneY = true; onDone(); }
    });
  };

  const snapToClosest = () => {
    let maxZ = -Infinity;
    let closestItem: any = null;
    const cx = rotX.get();
    const cy = rotY.get();

    HIVE_ITEMS_3D.forEach(item => {
      if (item.isBlank) return;
      const p = rotate3D(item, cx, cy);
      if (p.z > maxZ) {
        maxZ = p.z;
        closestItem = item;
      }
    });

    if (closestItem) {
      snapToItem(closestItem);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    stopInertia();
    rotX.stop();
    rotY.stop();
    isSnapping.current = false;
    isDragging.current = true;
    dragDistance.current = 0;
    dragThreshold.current = e.pointerType === 'touch' ? 12 : 8;
    didDragRef.current = false;
    prevTouch.current = { x: e.clientX, y: e.clientY };
    lastTime.current = performance.now();
    lastMoveTime.current = performance.now();
    velocity.current = { x: 0, y: 0 };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current || !prevTouch.current) return;
    
    const now = performance.now();
    const dt = Math.max(1, now - lastTime.current);
    const dx = e.clientX - prevTouch.current.x;
    const dy = e.clientY - prevTouch.current.y;
    
    dragDistance.current += Math.hypot(dx, dy);
    if (dragDistance.current >= dragThreshold.current) didDragRef.current = true;

    // Keep the smaller mobile globe responsive to the same finger movement.
    const SENSITIVITY = 1 / (185 * globeScale);
    const dRotY = dx * SENSITIVITY;
    const dRotX = -dy * SENSITIVITY;

    const VERTICAL_LIMIT = Math.PI / 2.2;
    const newRotX = Math.max(-VERTICAL_LIMIT, Math.min(VERTICAL_LIMIT, rotX.get() + dRotX));
    const newRotY = rotY.get() + dRotY;

    rotX.set(newRotX);
    rotY.set(newRotY);

    // Filtered velocity calculation (rad / ms)
    const instVelX = dRotY / dt;
    const instVelY = dRotX / dt;
    velocity.current = {
      x: velocity.current.x * 0.3 + instVelX * 0.7,
      y: velocity.current.y * 0.3 + instVelY * 0.7
    };

    prevTouch.current = { x: e.clientX, y: e.clientY };
    lastTime.current = now;
    lastMoveTime.current = now;

  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    prevTouch.current = null;

    try {
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {}

    if (didDragRef.current) {
      startInertia();
      return;
    }

    velocity.current = { x: 0, y: 0 };
    if (!didDragRef.current) {
      const targetElement = document.elementFromPoint(e.clientX, e.clientY);
      const itemElement = targetElement?.closest<HTMLElement>("[data-item-id]");
      const clickedId = itemElement?.dataset.itemId;
      const clickedItem = HIVE_ITEMS_3D.find((item) => item.id === clickedId);
      if (clickedItem) {
        handleClickItem(clickedItem);
        didDragRef.current = true;
      }
    }
  };

  const handleClickItem = (item: any) => {
    if (item.id.replace(/-\d+$/, '') === 'hive') {
      window.location.assign('/hive');
      return;
    }
    snapToItem(item);
  };

  const activeItem = ALL_ITEMS.find(item => item.id === activeId) || ALL_ITEMS[0];

  return (
    <div className="relative mx-auto mt-2 flex w-full max-w-[420px] flex-1 flex-col items-center justify-start">
      {/* Universal Drag Container allowing all axes */}
      <div 
        className="relative h-[300px] w-full shrink-0 select-none overflow-hidden sm:h-[380px]"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ perspective: "1000px", transformStyle: "preserve-3d", touchAction: 'none', WebkitTapHighlightColor: 'transparent' }}
      >
        {/* Aesthetic Apple-Maps-style Globe bounds wrapping the clustered shapes */}
        <div style={{ width: `${330 * globeScale}px`, height: `${330 * globeScale}px` }} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/5 bg-gradient-to-tr from-yellow-500/10 to-transparent shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_40px_rgba(0,0,0,0.5)] pointer-events-none">
        </div>
        {HIVE_ITEMS_3D.map((item) => (
          <SphereItem key={item.id} item={item} rotX={rotX} rotY={rotY} globeScale={globeScale} isActive={activeId === item.id} />
        ))}
      </div>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-[#555] sm:mt-3">Drag freely • Tap to Snap</p>

      {/* Dynamic Selected Action Details */}
      <div className="relative z-0 mt-3 min-h-[80px] w-full px-4 pb-12 text-center sm:mt-6">
        <AnimatePresence mode="wait">
            <motion.div
              key={activeId}
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -8 }}
              transition={{ duration: 0.15 }}
            >
              <h3 className="text-2xl font-black text-yellow-500 mb-1 tracking-tight">{activeItem.title}</h3>
              <p className="text-sm font-medium text-gray-300 mb-3 px-4">{activeItem.description}</p>
              
              <ActionControls actionId={activeItem.id.replace(/-\d+$/, '')} userRole={userRole} energyPreference={energyPreference} onEnergyChange={onEnergyChange} selectedVibe={selectedVibe} onVibeChange={onVibeChange} lastShoutout={lastShoutout} onShoutout={onShoutout} tipTotal={tipTotal} onTip={onTip} />
            </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// Binds native Framer DOM outputs avoiding lag and hiding non-view side/back items
function SphereItem({ item, rotX, rotY, globeScale, isActive }: any) {
  const transformData = useTransform([rotX, rotY], ([rx, ry]: number[]) => {
    const p = rotate3D(item, rx, ry);
    const zVal = p.z;
    
    // Strict front-facing horizon mask so off-view/side/back elements are cleanly removed
    const isVisible = zVal >= 60;
    const opacityVal = zVal < 60 ? 0 : zVal < 120 ? (zVal - 60) / 60 : 1;
    const perspectiveScale = 0.78 + 0.22 * ((Math.max(0, zVal) + RADIUS) / (2 * RADIUS));
    const scaleVal = (isActive ? 1.15 : 1.0) * perspectiveScale * globeScale;
    
    const distXZ = Math.sqrt(p.x * p.x + p.z * p.z);
    const rotYDeg = Math.atan2(p.x, Math.max(1, p.z)) * (180 / Math.PI);
    const rotXDeg = -Math.atan2(p.y, distXZ) * (180 / Math.PI);
    const zIndexVal = Math.round(zVal + RADIUS) + (isActive ? 1000 : 0);

    return {
      x: p.x * globeScale,
      y: p.y * globeScale,
      z: zVal,
      scale: scaleVal,
      opacity: opacityVal,
      zIndex: zIndexVal,
      rotateX: rotXDeg,
      rotateY: rotYDeg,
      visibility: isVisible ? 'visible' : 'hidden',
      pointerEvents: opacityVal > 0.4 ? 'auto' : 'none'
    };
  });

  const x = useTransform(transformData, (d) => d.x);
  const y = useTransform(transformData, (d) => d.y);
  const z = useTransform(transformData, (d) => d.z);
  const scale = useTransform(transformData, (d) => d.scale);
  const opacity = useTransform(transformData, (d) => d.opacity);
  const zIndex = useTransform(transformData, (d) => d.zIndex);
  const rotateX = useTransform(transformData, (d) => d.rotateX);
  const rotateY = useTransform(transformData, (d) => d.rotateY);
  const visibility = useTransform(transformData, (d) => d.visibility);
  const pointerEvents = useTransform(transformData, (d) => d.pointerEvents as any);

  return (
    <motion.div
      data-item-id={item.id}
      style={{ 
        x, y, z, scale, opacity, zIndex, 
        rotateX, rotateY,
        visibility,
        pointerEvents,
        marginLeft: '-53px', marginTop: '-53px' 
      }}
      className={`absolute left-1/2 top-1/2 select-none ${item.isBlank ? 'pointer-events-none' : 'cursor-pointer'}`}
    >
      <HiveButton title={item.title} icon={item.icon} featured={isActive} isBlank={item.isBlank} />
    </motion.div>
  );
}

function HiveButton({ title, icon, featured = false, isBlank = false }: { title: string; icon: React.ReactNode; featured?: boolean; isBlank?: boolean; }) {
  return (
    <div
      className={`
        w-[106px] h-[106px] 
        flex flex-col items-center justify-center 
        ${isBlank ? '' : 'cursor-pointer group'}
        transition-all duration-300
        relative
      `}
    >
      {/* Background Hexagon Container */}
      <div className={`
        shape-octagon 
        transition-colors duration-300 ease-out
        ${featured 
          ? 'bg-gradient-to-br from-yellow-400 to-amber-600 shadow-[0_0_40px_rgba(245,158,11,0.6)]' 
          : isBlank 
            ? 'bg-[#151515] border border-[#222]' 
            : 'bg-[#1a1a1a] border border-[#333] group-hover:bg-[#222]'
        }
      `}>
        {!featured && (
          <div className={`shape-octagon-inner transition-colors ${isBlank ? 'bg-[#111]' : 'bg-[#161616] group-hover:bg-[#202020]'}`}></div>
        )}
      </div>
      
      {/* Content wrapper */}
      {!isBlank && (
        <div className={`
          relative z-10 flex flex-col items-center justify-center gap-1
          ${featured ? 'text-[#111]' : 'text-gray-400 group-hover:text-yellow-500 transition-colors'}
        `}>
          {icon}
          <span className={`text-[11px] font-bold tracking-tight uppercase leading-none ${featured ? 'text-black font-black' : 'text-gray-400'}`}>
            {title}
          </span>
        </div>
      )}
    </div>
  );
}