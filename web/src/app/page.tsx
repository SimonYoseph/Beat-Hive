/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable prefer-const */

"use client";

import React, { useState, useRef, useEffect } from "react";
import NextLink from 'next/link';
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
  Headphones,
  Users,
  Settings2,
  Copy,
  EyeOff,
  Link
} from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import { motion, AnimatePresence, useMotionValue, animate, useTransform } from "framer-motion";

const HIVE_ITEMS = [
  { id: 'request', title: "Request", description: "Search and request a song for the queue", icon: <Search size={36} strokeWidth={2.5} /> },
  { id: 'queue', title: "Queue", description: "View what's coming up next", icon: <ListMusic size={32} /> },
  { id: 'energy', title: "Energy", description: "Tell the DJ to bring the heat up or down", icon: <Speaker size={32} /> },
  { id: 'upvote', title: "Upvote", description: "Vote for currently queued tracks", icon: <ThumbsUp size={32} /> },
  { id: 'vibes', title: "Vibes", description: "Let the DJ know you're feeling the set", icon: <Music size={32} /> },
  { id: 'shoutout', title: "Shoutout", description: "Send a message to the DJ booth", icon: <MessageSquare size={32} /> },
  { id: 'tip', title: "Tip DJ", description: "Show some love with a direct tip", icon: <Heart size={32} /> },
];

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

const ALL_ITEMS = Array.from({ length: TOTAL_TILES }).map((_, i) => {
  // Take the 7 actual icons and repeat them over and over to wrap entirely around the whole ball
  const realItemIndex = i % HIVE_ITEMS.length;
  // Give every single copy a uniquely identifiable ID so React keys don't break
  return { ...HIVE_ITEMS[realItemIndex], id: `${HIVE_ITEMS[realItemIndex].id}-${i}`, isBlank: false };
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

// Start the math with the exact required rotation to have the first item facing direct Front-Center
const initTargetX = Math.atan2(HIVE_ITEMS_3D[0].baseY, Math.sqrt(HIVE_ITEMS_3D[0].baseX**2 + HIVE_ITEMS_3D[0].baseZ**2));
const initTargetY = -Math.atan2(HIVE_ITEMS_3D[0].baseX, HIVE_ITEMS_3D[0].baseZ);

// A reusable hook to persist state to localStorage and sync between tabs
function usePersistedState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(defaultValue);

  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item !== null) {
        setState(JSON.parse(item));
      }
    } catch (e) {
      console.error("Error reading localStorage", e);
    }
  }, [key]);

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {
      console.error("Error setting localStorage", e);
    }
  }, [key, state]);

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

// Main Entry Component
export default function BeatHiveApp() {
  const { data: session } = useSession();
  const [isClient, setIsClient] = useState(false);

  // Always force scroll to top on exact mounting of the main component
  useEffect(() => {
    setIsClient(true);
    window.scrollTo(0, 0);
  }, []);

  const [isAuthenticated, setIsAuthenticated] = usePersistedState('bh_isAuthenticated', false);
  const [userRole, setUserRole] = usePersistedState<'none' | 'dj' | 'guest'>('bh_userRole', 'none');
  const [hasAccess, setHasAccess] = usePersistedState('bh_hasAccess', false); // Guest room access
  
  // App navigation state
  const [viewMode, setViewMode] = usePersistedState<'globe' | 'list'>('bh_viewMode', 'globe');
  const [showSettings, setShowSettings] = usePersistedState('bh_showSettings', false);
  const [musicSource, setMusicSource] = usePersistedState<'spotify' | 'apple' | null>('bh_musicSource', null);

  // DJ State
  const [djRoomActive, setDjRoomActive] = usePersistedState('bh_djRoomActive', false);
  const [isAnonymousDJ, setIsAnonymousDJ] = usePersistedState('bh_isAnonymousDJ', false);
  const [djPreviewingGuest, setDjPreviewingGuest] = usePersistedState('bh_djPreviewingGuest', false);
  const [djQrExpanded, setDjQrExpanded] = usePersistedState('bh_djQrExpanded', false);

  // Guest State
  const [qrExpanded, setQrExpanded] = usePersistedState('bh_qrExpanded', false);

  if (!isClient) return null; // Prevent hydration flash on first render

  const handleSignIn = () => {
    setIsAuthenticated(true);
    window.scrollTo(0, 0);
  };

  const handleSelectRole = (role: 'dj' | 'guest') => {
    setUserRole(role);
    window.scrollTo(0, 0);
  };

  const handleStartDJRoom = () => {
    setDjRoomActive(true);
    window.scrollTo(0, 0);
  };

  const handleScanAccess = () => {
    setHasAccess(true);
    window.scrollTo(0, 0);
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
  if (!isAuthenticated) {
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
              Join the crowd. Control the music. Tip the DJ.
            </p>
          </div>

          <div className="w-full space-y-4">
            <button
              onClick={handleSignIn}
              className="w-full py-4 px-6 bg-white hover:bg-gray-100 text-[#111] font-bold text-lg rounded-xl flex items-center justify-center gap-3 transition-transform active:scale-95 shadow-lg"
            >
              <svg viewBox="0 0 24 24" width="24" height="24" className="shrink-0" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
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
  if (userRole === 'none') {
    return (
      <main className="min-h-[100dvh] flex flex-col items-center justify-center p-6 text-center bg-[#111]">
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
              <p className="text-sm text-gray-400">I am the DJ or event organizer</p>
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

  // State 3A: DJ Mode (Room Setup & Dashboard)
  if (userRole === 'dj') {
    if (!djRoomActive) {
      return (
        <main className="min-h-[100dvh] flex flex-col items-center justify-center p-6 text-center bg-[#111]">
          <div className="max-w-md w-full bg-[#1a1a1a] p-8 rounded-3xl border border-white/5 shadow-2xl relative">
            <button onClick={() => setUserRole('none')} className="absolute top-6 left-6 text-gray-500 hover:text-white">
              <X size={20} />
            </button>
            <div className="w-16 h-16 bg-yellow-500/10 text-yellow-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <Settings2 size={28} />
            </div>
            <h2 className="text-2xl font-black text-white mb-2">Create Session</h2>
            <p className="text-sm text-gray-400 mb-8">Configure your event settings</p>
            
            <div className="space-y-4 mb-8 text-left">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider pl-1">Room Name</label>
                <input type="text" placeholder="e.g. Friday Night Live" className="w-full bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-500" />
              </div>
              
              <div className="bg-[#111] border border-white/10 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-white flex items-center gap-2">
                    <EyeOff size={16} className="text-gray-400" /> Anonymous DJ
                  </h4>
                  <p className="text-xs text-gray-500 mt-1">Hide your identity from the crowd</p>
                </div>
                <button 
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
            </div>

            <button
              onClick={handleStartDJRoom}
              className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-lg rounded-xl transition-all shadow-lg shadow-yellow-500/20"
            >
              Start Party
            </button>
          </div>
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
                <p className="text-sm text-yellow-500 font-medium mb-2">Room: Friday Night Live</p>
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
              <button onClick={() => setDjRoomActive(false)} className="w-10 h-10 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center hover:bg-red-500/20 transition-colors">
                <X size={20} />
              </button>
            </header>

            <button 
              onClick={() => setDjPreviewingGuest(true)}
              className="w-full bg-[#1a1a1a] hover:bg-[#222] border border-yellow-500/30 text-yellow-500 py-3 rounded-xl flex items-center justify-center gap-2 font-bold transition-colors shadow-lg"
            >
              <Users size={18} />
              Switch to Guest View
            </button>

            <div className="bg-white rounded-3xl p-6 flex flex-col items-center justify-center relative overflow-hidden shadow-xl">
             <button 
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
                      <div className="w-48 h-48 bg-gray-100 rounded-2xl border-4 border-gray-200 flex items-center justify-center mb-6 shrink-0 shadow-inner">
                          {/* Fake QR code visualization */}
                          <QrCode size={120} className="text-black drop-shadow-md" />
                      </div>
                      <div className="w-full flex items-center justify-between bg-gray-50 rounded-xl p-3 border border-gray-200 shadow-sm">
                        <span className="font-mono text-gray-600 font-bold tracking-widest text-lg">BH-9X2P</span>
                        <button className="text-gray-400 hover:text-black transition-colors"><Copy size={20} /></button>
                      </div>
                    </div>
                  </motion.div>
                )}
             </AnimatePresence>
          </div>

          <div className="grid grid-cols-2 gap-4 flex-1">
             <div className="bg-[#1a1a1a] rounded-2xl p-4 border border-white/5 flex flex-col">
                <Search className="text-yellow-500 mb-2" size={24} />
                <span className="text-3xl font-black text-white">12</span>
                <span className="text-sm text-gray-400 font-medium">New Requests</span>
             </div>
             <div className="bg-[#1a1a1a] rounded-2xl p-4 border border-white/5 flex flex-col">
                <Speaker className="text-orange-500 mb-2" size={24} />
                <span className="text-3xl font-black text-white">High</span>
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
      </main>
      );
    }
  }

  // State 3B: Guest flow - scan QR
  if (userRole === 'guest' && !hasAccess) {
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
              You are logged in! Now span the DJ&apos;s venue QR code to join the live session and take control.
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
                  onClick={() => setQrExpanded(true)}
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
                  <button
                    onClick={handleScanAccess}
                    className="w-full py-4 px-6 bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-xl rounded-xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg shadow-yellow-500/20"
                  >
                    Simulate Scan
                    <ArrowRight size={24} />
                  </button>
                  <button
                    onClick={() => setQrExpanded(false)}
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
            <button
              onClick={handleScanAccess}
              className="w-full py-4 px-6 bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-white font-bold text-lg rounded-xl flex items-center justify-center gap-3 transition-transform active:scale-95"
            >
              <Link size={22} className="text-gray-400" />
              Enter Room Link
            </button>
          </div>
        </div>
      </main>
    );
  }

  // State 3: Main App Interface
  return (
    <main className="min-h-[100dvh] flex flex-col font-sans overflow-hidden pt-4 pb-20 bg-[#111]">
      <div className="w-full max-w-md mx-auto relative px-4 flex flex-col h-full">
        
        {/* Header Area with Top Navigation */}
        <div className="relative w-full flex items-center justify-center mb-4 mt-2">
          {/* Top Left Settings Button */}
          <button 
            onClick={() => setShowSettings(true)}
            className="absolute left-0 z-50 w-12 h-12 bg-gradient-to-br from-yellow-400 to-yellow-500 hover:from-yellow-300 hover:to-yellow-400 transition-all duration-300 flex items-center justify-center shape-octagon shadow-lg shadow-yellow-500/30 active:scale-95"
          >
            <User size={20} className="text-black" />
          </button>

          {/* Centered Brand Header */}
          <header className="text-center">
            <h1 className="text-3xl font-black mb-1 text-white flex items-center justify-center gap-2">
              Beat<span className="text-yellow-500">Hive</span>
            </h1>
            <p className="text-xs text-yellow-500/80 uppercase tracking-widest font-bold">Live Queue Control</p>
          </header>
        </div>

        {/* Currently Playing Card */}
        <div className="bg-[#1a1a1a] rounded-2xl p-2.5 mb-4 border border-white/5 relative overflow-hidden shadow-xl drop-shadow-2xl z-10 shrink-0 w-[85%] mx-auto">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-600 via-yellow-400 to-yellow-600"></div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-lg flex items-center justify-center shadow-lg relative overflow-hidden shrink-0">
              <Music size={16} className="text-black/80 z-10" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] text-gray-500 font-bold mb-0.5 uppercase tracking-widest flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                Now Playing
              </p>
              <h2 className="font-bold text-sm leading-tight text-white truncate">Losing It</h2>
              <p className="text-[10px] text-yellow-500 font-semibold truncate mt-0.5">FISHER</p>
            </div>
            <motion.button 
              whileTap={{ scale: 0.9 }}
              className="w-8 h-8 rounded-full bg-[#222] flex items-center justify-center text-gray-400 hover:text-white transition-colors shrink-0"
            >
              <Heart size={14} />
            </motion.button>
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex bg-[#1a1a1a] rounded-xl p-1 mb-4 border border-white/5 shrink-0 mx-auto w-48 relative overflow-hidden">
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

        {userRole === 'dj' && djPreviewingGuest && (
          <div className="flex justify-center mb-8 shrink-0 relative z-20">
            <button 
              onClick={() => setDjPreviewingGuest(false)}
              className="bg-yellow-500 hover:bg-yellow-400 text-black px-5 py-2.5 rounded-full font-bold text-sm shadow-[0_10px_30px_rgba(245,158,11,0.3)] flex items-center justify-center gap-2 active:scale-95 transition-all w-48"
            >
              <Settings2 size={16} />
              Return to Dashboard
            </button>
          </div>
        )}

        {/* Conditional View Rendering */}
        {viewMode === 'globe' ? (
          <SphereCarousel />
        ) : (
          <ActionList />
        )}

      </div>

      {/* Settings Modal Layer using AnimatePresence */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4 pb-0 sm:pb-4"
          >
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-md bg-[#1a1a1a] border-t border-x sm:border border-white/10 rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl relative"
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
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3">Music Source</h3>
                  <div className="grid grid-cols-1 gap-3">
                    <button 
                      onClick={() => {
                        if (session) {
                          signOut();
                          setMusicSource(null);
                        } else {
                          signIn('spotify');
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
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5">
                  <div className="flex items-center justify-between text-gray-400 bg-white/5 rounded-xl p-4">
                     <span className="text-sm font-semibold">User ID</span>
                     <span className="text-xs font-mono bg-black rounded p-1.5">USR-8X92</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </main>
  );
}

function ActionList() {
  return (
    <div className="flex flex-col gap-3 w-full max-w-md mx-auto flex-1 overflow-y-auto pb-6 scrollbar-hide stylish-scrollbar">
      {HIVE_ITEMS.map((item, i) => (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          key={item.id}
          className="bg-[#1a1a1a] border border-[#333] hover:border-yellow-500/50 hover:bg-[#222] transition-colors p-4 rounded-2xl flex items-center gap-4 cursor-pointer group"
        >
          <div className="w-14 h-14 shrink-0 bg-[#222] group-hover:bg-gradient-to-br group-hover:from-yellow-400 group-hover:to-amber-600 rounded-xl flex items-center justify-center text-gray-400 group-hover:text-black transition-all shadow-md shape-octagon relative">
            <div className="shape-octagon-inner bg-[#161616] group-hover:bg-transparent transition-colors z-0"></div>
            <div className="relative z-10 scale-[0.6]">{item.icon}</div>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-white group-hover:text-yellow-500 transition-colors mb-1">{item.title}</h3>
            <p className="text-sm text-gray-400 leading-tight">{item.description}</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function SphereCarousel() {
  // Use framer-motion native performance values (0 React state re-renders during dragging!)
  const rotX = useMotionValue(initTargetX);
  const rotY = useMotionValue(initTargetY);
  
  const [activeId, setActiveId] = useState(ALL_ITEMS[0].id);

  const isDragging = useRef(false);
  const dragDistance = useRef(0);
  const prevTouch = useRef<{x: number, y: number} | null>(null);
  const velocity = useRef({ x: 0, y: 0 });
  const lastTime = useRef(Date.now());

  const checkClosestItem = () => {
    let maxZ = -Infinity;
    let closestItem: any = null;
    let cx = rotX.get();
    let cy = rotY.get();

    HIVE_ITEMS_3D.forEach(item => {
       if (item.isBlank) return; 
       
       const p = rotate3D(item, cx, cy);
       if (p.z > maxZ) {
          maxZ = p.z;
          closestItem = item;
       }
    });

    if (closestItem) {
       setActiveId((prev) => prev !== closestItem.id ? closestItem.id : prev);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDragging.current = true;
    dragDistance.current = 0;
    prevTouch.current = { x: e.clientX, y: e.clientY };
    lastTime.current = Date.now();
    velocity.current = { x: 0, y: 0 };
    rotX.stop();
    rotY.stop();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current || !prevTouch.current) return;
    
    const dx = e.clientX - prevTouch.current.x;
    const dy = e.clientY - prevTouch.current.y;
    
    const now = Date.now();
    const dt = now - lastTime.current;
    if (dt > 0) {
      velocity.current = { 
         x: (velocity.current.x + dx / dt) / 2, 
         y: (velocity.current.y + dy / dt) / 2 
      };
    }
    lastTime.current = now;
    
    dragDistance.current += Math.abs(dx) + Math.abs(dy);

    // Apple Maps style: X drag spins left/right (Y axis), Y drag spins up/down (X axis)
    // Decreased sensitivity slightly for more "weighty" globe feel
    rotY.set(rotY.get() + dx * 0.002);
    
    // Vertical rotation needs boundaries so you don't "flip upside down" confusingly
    // We allow standard spinning but restrict full 360 pitch inversions
    const newRotX = rotX.get() - dy * 0.002;
    
    // Lock vertical rotation (pitch) to roughly a 180-degree natural "front face" dome arc
    // so the globe feels like it has a top and bottom pole! 
    const VERTICAL_LIMIT = Math.PI / 2.2; 
    const normalizedRotX = newRotX % (2 * Math.PI);
    let clampedRotX = normalizedRotX;
    
    if (normalizedRotX > VERTICAL_LIMIT && normalizedRotX < Math.PI) clampedRotX = VERTICAL_LIMIT;
    if (normalizedRotX < -VERTICAL_LIMIT && normalizedRotX > -Math.PI) clampedRotX = -VERTICAL_LIMIT;
    
    rotX.set(clampedRotX);
    
    prevTouch.current = { x: e.clientX, y: e.clientY };
    checkClosestItem();
  };

  const snapToItem = (item: any) => {
    const targetX = Math.atan2(item.baseY, Math.sqrt(item.baseX**2 + item.baseZ**2));
    const targetY = -Math.atan2(item.baseX, item.baseZ);
    
    // Snap accurately using physics directly bypassing react state lag
    animate(rotX, getNearestAngle(rotX.get(), targetX), { type: 'spring', stiffness: 260, damping: 24, onUpdate: checkClosestItem });
    animate(rotY, getNearestAngle(rotY.get(), targetY), { type: 'spring', stiffness: 260, damping: 24, onUpdate: checkClosestItem });
  };

  const snapToClosest = () => {
    let maxZ = -Infinity;
    let closestItem: any = null;
    let cx = rotX.get();
    let cy = rotY.get();

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

  const handlePointerUp = () => {
    isDragging.current = false;
    prevTouch.current = null;
    
    let isYDone = false;
    let isXDone = false;
    const checkAndSnap = () => {
      if (isYDone && isXDone) {
        snapToClosest();
      }
    };

    // Calculate natural deceleration targeted locations based on velocity
    if (Math.abs(velocity.current.x) > 0.05 || Math.abs(velocity.current.y) > 0.05) {
      
      // Horizontal Momentum
      animate(rotY, rotY.get() + velocity.current.x * 6, { 
        type: "spring", 
        stiffness: 40,
        damping: 12,
        mass: 1.2,
        onUpdate: checkClosestItem,
        onComplete: () => { isYDone = true; checkAndSnap(); }
      });
      
      // Vertical Momentum with hard limit boundary bounces
      const targetX = rotX.get() - velocity.current.y * 6;
      const VERTICAL_LIMIT = Math.PI / 2.2;
      let finalTargetX = targetX;
      
      // Make the momentum bounce off the poles if you throw it too hard up or down
      if (targetX > VERTICAL_LIMIT) finalTargetX = VERTICAL_LIMIT;
      if (targetX < -VERTICAL_LIMIT) finalTargetX = -VERTICAL_LIMIT;

      animate(rotX, finalTargetX, { 
        type: "spring", 
        stiffness: 40,
        damping: 12,
        mass: 1.2,
        onUpdate: checkClosestItem,
        onComplete: () => { isXDone = true; checkAndSnap(); }
      });
    } else {
      snapToClosest();
    }
  };

  const handleClickItem = (item: any) => {
    if (dragDistance.current < 20) {
       // If cleanly tapped (not swiped over), auto-rotate that item to the front!
       snapToItem(item);
    }
  };

  const activeItem = ALL_ITEMS.find(i => i.id === activeId) || ALL_ITEMS[0];

  return (
    <div className="relative w-full max-w-[420px] mx-auto flex flex-col items-center justify-start flex-1 -mt-2">
      {/* Universal Drag Container allowing all axes */}
      <div 
        className="relative w-full h-[380px] flex items-center justify-center cursor-grab active:cursor-grabbing shrink-0"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ perspective: "1000px", transformStyle: "preserve-3d", touchAction: 'none', WebkitTapHighlightColor: 'transparent' }}
      >
        {/* Aesthetic Apple-Maps-style Globe bounds wrapping the clustered shapes */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[330px] h-[330px] rounded-full bg-gradient-to-tr from-yellow-500/10 to-transparent border border-white/5 shadow-[inset_0_0_20px_rgba(255,255,255,0.05),0_0_40px_rgba(0,0,0,0.5)] pointer-events-none">
        </div>
        {HIVE_ITEMS_3D.map((item) => (
          <SphereItem 
            key={item.id} 
            item={item} 
            rotX={rotX} 
            rotY={rotY} 
            isActive={activeId === item.id} 
            onClick={() => handleClickItem(item)}
          />
        ))}
      </div>

      {/* Dynamic Selected Action Details */}
      <div className="text-center min-h-[80px] relative z-0 mt-4 pb-12 w-full px-4">
        <AnimatePresence mode="wait">
            <motion.div
              key={activeId}
              initial={{ opacity: 0, scale: 0.9, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -15 }}
              transition={{ duration: 0.2 }}
            >
              <h3 className="text-2xl font-black text-yellow-500 mb-1 tracking-tight">{activeItem.title}</h3>
              <p className="text-sm font-medium text-gray-300 mb-3 px-4">{activeItem.description}</p>
              <p className="text-[10px] text-[#555] font-bold tracking-widest uppercase">Drag freely • Tap to Snap</p>
            </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// Binds native Framer DOM outputs avoiding lag
function SphereItem({ item, rotX, rotY, isActive, onClick }: any) {
  const x = useTransform(() => rotate3D(item, rotX.get(), rotY.get()).x);
  const y = useTransform(() => rotate3D(item, rotX.get(), rotY.get()).y);
  
  // Calculate raw Z to use for perspective warping and scaling
  const z = useTransform(() => rotate3D(item, rotX.get(), rotY.get()).z);

  const scale = useTransform(() => {
     return isActive ? 1.15 : 1.0; 
  });
  
  const opacity = useTransform(() => {
     // Aggressive fade mask to hide the edges and only show the front-most cluster
     const currentZ = z.get();
     // If it's physically turning away past a tight radius, immediately cut it
     if (currentZ < 80) return 0;
     // Softly fade in only the icons closely surrounding the front face
     if (currentZ < 150) return ((currentZ - 80) / 70); 
     return 1;
  });
  
  const zIndex = useTransform(() => {
     const currentZ = z.get();
     // Layer objects strictly by their actual Z depth so they never bleed through each other
     return Math.round(currentZ + RADIUS) + (isActive ? 1000 : 0);
  });

  // Calculate true spherical projection rotations so the flat shapes perfectly physically curve
  // along the surface body of the bounding sphere wrapper.
  const rotateY = useTransform(() => { const p = rotate3D(item, rotX.get(), rotY.get()); return Math.atan2(p.x, p.z) * (180 / Math.PI); }); const rotateX = useTransform(() => { const p = rotate3D(item, rotX.get(), rotY.get()); const distXZ = Math.sqrt(p.x*p.x + p.z*p.z); return -Math.atan2(p.y, distXZ) * (180 / Math.PI); });

  return (
    <motion.div
      style={{ 
        x, y, z, scale, opacity, zIndex, 
        rotateX, rotateY,
        marginLeft: '-53px', marginTop: '-53px' 
      }}
      className={`absolute left-1/2 top-1/2 ${item.isBlank ? 'pointer-events-none' : ''}`}
      onClick={item.isBlank ? undefined : onClick}
    >
      <HiveButton title={item.title} icon={item.icon} featured={isActive} isBlank={item.isBlank} />
    </motion.div>
  );
}

function HiveButton({ title, icon, featured = false, isBlank = false }: { title: string; icon: React.ReactNode; featured?: boolean; isBlank?: boolean; }) {
  return (
    <motion.div 
      animate={{ z: featured ? 30 : 0 }}
      whileHover={!isBlank ? { scale: 1.05 } : undefined}
      whileTap={!isBlank ? { scale: 0.95 } : undefined}
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
        transition-colors duration-400 ease-out
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
          <span className={`text-[10px] uppercase tracking-widest transition-opacity duration-300 font-bold ${featured ? 'font-black text-xs text-[#111] opacity-100' : 'opacity-0'}`}>
            {title}
          </span>
        </div>
      )}
    </motion.div>
  );
}