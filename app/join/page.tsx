"use client";

import { ArrowRight, Link as LinkIcon, Music2, QrCode } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

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

export default function JoinRoomPage() {
  const router = useRouter();
  const [roomInput, setRoomInput] = useState("");
  const [message, setMessage] = useState("");

  function enterRoom(room: JoinedRoom) {
    window.localStorage.setItem("bh_joinedRoom", JSON.stringify(room));
    window.localStorage.setItem("bh_joinedRoomCode", room.code);
    window.localStorage.setItem("bh_hasAccess", JSON.stringify(true));
    window.localStorage.setItem("bh_userRole", JSON.stringify("guest"));
    router.push("/");
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomCode = params.get("room");
    if (!roomCode) return;
    enterRoom({ code: roomCode, hostName: params.get("host") || "Hive Host", hostEmail: params.get("hostEmail") || "", roomName: params.get("roomName") || "Beat Hive Room" });
  }, [router]);

  function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const roomCode = readRoomCode(roomInput);
    if (!roomCode || !roomInput.includes("?room=")) {
      setMessage("Paste the complete room link shared by your host.");
      return;
    }
    const params = new URL(roomInput).searchParams;
    enterRoom({ code: roomCode, hostName: params.get("host") || "Hive Host", hostEmail: params.get("hostEmail") || "", roomName: params.get("roomName") || "Beat Hive Room" });
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#111] px-4 py-8 text-white">
      <section className="w-full max-w-md rounded-2xl border border-yellow-500/20 bg-[#1a1a1a] p-6 shadow-2xl sm:p-8">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-yellow-500/10 text-yellow-500"><QrCode size={28} /></div>
        <div className="mb-8"><h1 className="flex items-center gap-2 text-2xl font-black"><Music2 className="text-yellow-500" />Join Beat Hive</h1><p className="mt-2 text-sm text-gray-400">Open a shared room link or paste one below to join the live music session.</p></div>
        <form onSubmit={joinRoom} className="space-y-3">
          <label className="sr-only" htmlFor="room-link">Room link or code</label>
          <div className="flex rounded-xl border border-white/15 bg-[#111] focus-within:border-yellow-500"><LinkIcon className="m-3 shrink-0 text-gray-500" size={20} /><input id="room-link" value={roomInput} onChange={(event) => setRoomInput(event.target.value)} placeholder="Paste a room link or code" className="min-w-0 flex-1 bg-transparent py-3 pr-3 text-white outline-none placeholder:text-gray-600" /></div>
          {message && <p className="text-sm text-red-400" role="alert">{message}</p>}
          <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-yellow-500 py-3 font-bold text-black hover:bg-yellow-400">Join Room <ArrowRight size={18} /></button>
        </form>
      </section>
    </main>
  );
}