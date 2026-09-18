"use client";

import { ArrowRight, Disc3, Hexagon, Link as LinkIcon, Music2, QrCode, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { FormEvent, useEffect, useEffectEvent, useState } from "react";

import { useRoom } from "../room-provider";

function readRoomCode(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.searchParams.get("room") || "";
  } catch {
    return value.trim();
  }
}

type JoinedRoom = {
  code: string;
  hostName: string;
  hostEmail: string;
  roomName: string;
};

type CoHostWelcome = { room: JoinedRoom; wasAlreadyInSession: boolean };

export default function JoinRoomPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { joinRoom } = useRoom();
  const joinFromInvite = useEffectEvent(joinRoom);
  const [roomInput, setRoomInput] = useState("");
  const [message, setMessage] = useState("");
  const [isGuest, setIsGuest] = useState(false);
  const [coHostWelcome, setCoHostWelcome] = useState<CoHostWelcome | null>(null);

  function enterRoom(room: JoinedRoom, isHost: boolean) {
    window.localStorage.setItem("bh_joinedRoom", JSON.stringify(room));
    window.localStorage.setItem("bh_joinedRoomCode", room.code);
    window.localStorage.setItem("bh_hasAccess", JSON.stringify(!isHost));
    window.localStorage.setItem("bh_userRole", JSON.stringify(isHost ? "dj" : "guest"));
    window.localStorage.setItem("bh_djRoomActive", JSON.stringify(isHost));
    window.localStorage.setItem("bh_isPartyCreator", JSON.stringify(false));
    router.push("/");
  }

  function handleJoinedRoom(room: Awaited<ReturnType<typeof joinRoom>>) {
    const joinedRoom = { code: room.code, hostName: room.host_name, hostEmail: "", roomName: room.name };
    if (room.isHost) {
      setCoHostWelcome({ room: joinedRoom, wasAlreadyInSession: room.wasAlreadyInSession === true });
      return;
    }
    enterRoom(joinedRoom, false);
  }

  useEffect(() => {
    setIsGuest(window.localStorage.getItem("bh_isAuthenticated") === "true");
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomCode = params.get("room");
    if (!roomCode || (!session && !isGuest)) return;
    void joinFromInvite(roomCode, session?.user?.name?.trim() || "Guest").then((room) => {
      handleJoinedRoom(room);
    }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Could not join this room."));
  }, [isGuest, router, session]);

  function continueAsGuest() {
    window.localStorage.setItem("bh_isAuthenticated", "true");
    setIsGuest(true);
  }

  function continueWithGoogle() {
    void signIn("google", { callbackUrl: window.location.href });
  }

  async function handleJoinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const roomCode = readRoomCode(roomInput);
    if (!roomCode) {
      setMessage("Paste a room link or enter an 8-character room code.");
      return;
    }
    setMessage("");
    try {
      const room = await joinRoom(roomCode, session?.user?.name?.trim() || "Guest");
      handleJoinedRoom(room);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not join this room.");
    }
  }

  const roomCode = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("room") || "";
  const inviteType = typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("invite") || "";
  const isCoHostInvite = inviteType === "cohost";
  const needsIdentity = Boolean(roomCode) && !session && !isGuest;

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#111] px-4 py-8 text-white">
      <section className="w-full max-w-md rounded-2xl border border-yellow-500/20 bg-[#1a1a1a] p-6 shadow-2xl sm:p-8">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-yellow-500/10 text-yellow-500"><QrCode size={28} /></div>
        {needsIdentity ? (
          <div className="space-y-3">
            <div className="mb-8"><h1 className="flex items-center gap-2 text-2xl font-black"><Music2 className="text-yellow-500" />You&apos;re joining the Hive</h1><p className="mt-2 text-sm text-gray-400">Sign in to save your party access, then we&apos;ll join you automatically.</p></div>
            <button type="button" onClick={continueWithGoogle} disabled={status === "loading"} className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 font-bold text-black hover:bg-gray-100 disabled:cursor-wait disabled:opacity-60">Continue with Google <ArrowRight size={18} /></button>
            <button type="button" onClick={continueAsGuest} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#111] py-3 font-bold text-white hover:bg-[#222]">Continue as guest <ArrowRight size={18} /></button>
          </div>
        ) : (
          <>
            <div className="mb-8"><h1 className="flex items-center gap-2 text-2xl font-black"><Music2 className="text-yellow-500" />{isCoHostInvite ? "Co-host Invite" : "Join Beat Hive"}</h1><p className="mt-2 text-sm text-gray-400">{roomCode ? (isCoHostInvite ? "Sign in with your approved host email to open host controls." : "Joining your live music session...") : "Open a shared room link or paste one below to join the live music session."}</p></div>
            {!roomCode && <form onSubmit={handleJoinRoom} className="space-y-3">
              <label className="sr-only" htmlFor="room-link">Room link or code</label>
              <div className="flex rounded-xl border border-white/15 bg-[#111] focus-within:border-yellow-500"><LinkIcon className="m-3 shrink-0 text-gray-500" size={20} /><input id="room-link" value={roomInput} onChange={(event) => setRoomInput(event.target.value)} placeholder="Paste a room link or code" className="min-w-0 flex-1 bg-transparent py-3 pr-3 text-white outline-none placeholder:text-gray-600" /></div>
              <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-500 py-3 font-bold text-black hover:bg-yellow-400">Join Room <ArrowRight size={18} /></button>
            </form>}
            {message && <p className="mt-3 text-sm text-red-400" role="alert">{message}</p>}
          </>
        )}
      </section>
      {coHostWelcome && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[100] flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#0b0b0b] px-5 text-center">
        <motion.div aria-hidden="true" className="absolute left-[12%] top-[14%] text-fuchsia-400" animate={{ rotate: 360, scale: [0.8, 1.2, 0.8] }} transition={{ rotate: { duration: 8, repeat: Infinity, ease: "linear" }, scale: { duration: 2.4, repeat: Infinity } }}><Sparkles size={34} /></motion.div>
        <motion.div aria-hidden="true" className="absolute bottom-[16%] right-[12%] text-cyan-300" animate={{ rotate: -360, y: [0, -18, 0] }} transition={{ rotate: { duration: 10, repeat: Infinity, ease: "linear" }, y: { duration: 2.2, repeat: Infinity } }}><Hexagon size={48} /></motion.div>
        <div className="relative w-full max-w-md">
          <motion.div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full border-4 border-yellow-300 bg-yellow-400 text-black shadow-[0_0_45px_rgba(250,204,21,.55)]" animate={{ rotate: 360 }} transition={{ duration: 5, repeat: Infinity, ease: "linear" }}><Disc3 size={64} /></motion.div>
          <motion.div className="mx-auto -mt-4 flex h-12 w-14 items-center justify-center bg-black text-yellow-400 [clip-path:polygon(50%_0%,100%_25%,100%_75%,50%_100%,0%_75%,0%_25%)]" animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 1.3, repeat: Infinity }}><Hexagon size={30} /></motion.div>
          <p className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-yellow-400">Beat Hive role update</p>
          <h1 className="mt-3 text-4xl font-black text-white">{coHostWelcome.wasAlreadyInSession ? "You are now a Hive Host" : "Welcome, Co-Host"}</h1>
          <p className="mx-auto mt-4 max-w-sm text-base leading-7 text-gray-300">{coHostWelcome.wasAlreadyInSession ? `You are already in ${coHostWelcome.room.roomName}. Your host controls are ready.` : `You have been invited to host ${coHostWelcome.room.roomName}.`}</p>
          <button type="button" onClick={() => { const welcome = coHostWelcome; setCoHostWelcome(null); enterRoom(welcome.room, true); }} className="mt-10 flex w-full items-center justify-center gap-2 rounded-lg bg-yellow-400 py-4 text-lg font-black text-black shadow-[0_10px_30px_rgba(250,204,21,.28)] transition-colors hover:bg-yellow-300">{coHostWelcome.wasAlreadyInSession ? "I am a host now" : "Open host controls"}<ArrowRight size={22} /></button>
        </div>
      </motion.div>}
    </main>
  );
}