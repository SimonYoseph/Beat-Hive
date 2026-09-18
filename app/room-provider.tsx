"use client";

import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createContext, ReactNode, useContext, useEffect, useRef, useState } from "react";

import { supabase } from "../lib/supabase/client";

export type RoomTrack = { videoId: string; title: string; channelTitle: string; thumbnail?: string; upvotes?: number };
export type VibeReward = { participantId: string; participantName: string; score: number; fireUntil: string; lastAwardedAt: string };
export type VibeShoutout = { participantName: string; expiresAt: string };
export type RoomState = { requests?: RoomTrack[]; queue?: RoomTrack[]; nowPlaying?: RoomTrack | null; isPlaying?: boolean; settings?: Record<string, unknown>; feedback?: Record<string, unknown>; vibeRewards?: VibeReward[]; vibeShoutout?: VibeShoutout; awardedRequestIds?: string[] };
export type RoomHost = { email: string };
export type SharedRoom = { code: string; name: string; host_email?: string; host_name: string; hosts?: RoomHost[]; isHost?: boolean; wasAlreadyInSession?: boolean; version: number; state: RoomState; updated_at?: string };

type RoomContextValue = {
  room: SharedRoom | null;
  configured: boolean;
  isLoading: boolean;
  refreshRoom: () => Promise<void>;
  createRoom: (name: string, coHostEmails?: string[], starterQueue?: RoomTrack[]) => Promise<SharedRoom>;
  joinRoom: (code: string, displayName: string, isCoHostInvite?: boolean) => Promise<SharedRoom>;
  requestTrack: (track: RoomTrack) => Promise<void>;
  voteForTrack: (videoId: string) => Promise<void>;
  sendFeedback: (feedback: Record<string, unknown>) => Promise<void>;
  updateHostState: (update: (state: RoomState) => RoomState) => Promise<void>;
  manageRoomHost: (email: string, role: "host" | "user") => Promise<void>;
};

const RoomContext = createContext<RoomContextValue | null>(null);

function storedRoomCode() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("bh_joinedRoomCode") || window.localStorage.getItem("bh_roomCode") || "";
}

function applyRoom(room: SharedRoom) {
  const { state } = room;
  window.localStorage.setItem("bh_roomCode", room.code);
  window.localStorage.setItem("bh_roomName", JSON.stringify(room.name));
  window.localStorage.setItem("bh_youtube_requests", JSON.stringify(state.requests || []));
  window.localStorage.setItem("bh_play_queue", JSON.stringify(state.queue || []));
  if (state.nowPlaying) window.localStorage.setItem("bh_now_playing", JSON.stringify(state.nowPlaying));
  else window.localStorage.removeItem("bh_now_playing");
  window.localStorage.setItem("bh_masterSettings", JSON.stringify(state.settings || {}));
  window.dispatchEvent(new Event("bh-playback-change"));
  window.dispatchEvent(new Event("bh-master-settings-change"));
}

async function readError(response: Response) {
  const body = await response.json().catch(() => ({})) as { error?: string };
  return body.error || "Could not update the shared room.";
}

export function RoomProvider({ children }: { children: ReactNode }) {
  const [room, setRoom] = useState<SharedRoom | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const roomCodeRef = useRef("");
  const roomRef = useRef<SharedRoom | null>(null);
  const hostUpdateChainRef = useRef(Promise.resolve());

  const setSharedRoom = (nextRoom: SharedRoom) => {
    const isHost = nextRoom.isHost ?? window.localStorage.getItem("bh_room_access") === "host";
    const roomWithAccess = { ...nextRoom, isHost };
    roomCodeRef.current = roomWithAccess.code;
    roomRef.current = roomWithAccess;
    setRoom(roomWithAccess);
    applyRoom(roomWithAccess);
  };

  const refreshRoom = async () => {
    const code = roomCodeRef.current || storedRoomCode();
    if (!code) {
      setIsLoading(false);
      return;
    }
    const response = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
    if (!response.ok) throw new Error(await readError(response));
    const data = await response.json() as { room: SharedRoom };
    setSharedRoom(data.room);
    setIsLoading(false);
  };

  const createRoom = async (name: string, coHostEmails: string[] = [], starterQueue: RoomTrack[] = []) => {
    const response = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, coHostEmails, starterQueue }) });
    if (!response.ok) throw new Error(await readError(response));
    const data = await response.json() as { room: SharedRoom };
    window.localStorage.setItem("bh_room_access", "host");
    data.room.isHost = true;
    setSharedRoom(data.room);
    return data.room;
  };

  const joinRoom = async (code: string, displayName: string, isCoHostInvite = false) => {
    const response = await fetch(`/api/rooms/${encodeURIComponent(code)}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName, isCoHostInvite }) });
    if (!response.ok) throw new Error(await readError(response));
    const data = await response.json() as { room: SharedRoom };
    window.localStorage.setItem("bh_joinedRoomCode", data.room.code);
    window.localStorage.setItem("bh_room_access", data.room.isHost ? "host" : "guest");
    setSharedRoom(data.room);
    return data.room;
  };

  const dispatchAction = async (body: Record<string, unknown>) => {
    const code = roomCodeRef.current || storedRoomCode();
    if (!code) throw new Error("Join a shared room first.");
    const response = await fetch(`/api/rooms/${encodeURIComponent(code)}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(await readError(response));
    const data = await response.json() as { room: SharedRoom };
    setSharedRoom(data.room);
  };

  const updateHostState = (update: (state: RoomState) => RoomState) => {
    const request = hostUpdateChainRef.current.then(async () => {
      const currentRoom = roomRef.current;
      if (!currentRoom) throw new Error("Start or join a shared room first.");
      const state = update(currentRoom.state);
      const response = await fetch(`/api/rooms/${encodeURIComponent(currentRoom.code)}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "host-state", version: currentRoom.version, state }) });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json() as { room: SharedRoom };
      setSharedRoom(data.room);
    });
    hostUpdateChainRef.current = request.catch(() => undefined);
    return request;
  };

  const manageRoomHost = async (email: string, role: "host" | "user") => {
    const currentRoom = room;
    if (!currentRoom) throw new Error("Join a shared room first.");
    const response = await fetch(`/api/rooms/${encodeURIComponent(currentRoom.code)}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "manage-host", email, role }) });
    if (!response.ok) throw new Error(await readError(response));
    await refreshRoom();
  };

  useEffect(() => {
    void refreshRoom().catch(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    const code = roomCodeRef.current || storedRoomCode();
    const client = supabase;
    if (!code || !client) return;
    const channel = client.channel(`hive-room-${code}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "hive_rooms", filter: `code=eq.${code}` }, (payload: RealtimePostgresChangesPayload<{ code: string; name: string; host_name: string; version: number; state: RoomState; updated_at: string }>) => {
      setSharedRoom(payload.new as SharedRoom);
    }).subscribe();
    return () => { void client.removeChannel(channel); };
  }, [room?.code]);

  return <RoomContext.Provider value={{ room, configured: Boolean(supabase), isLoading, refreshRoom, createRoom, joinRoom, requestTrack: (track) => dispatchAction({ action: "request", track }), voteForTrack: (videoId) => dispatchAction({ action: "vote", videoId }), sendFeedback: (feedback) => dispatchAction({ action: "feedback", feedback }), updateHostState, manageRoomHost }}>{children}</RoomContext.Provider>;
}

export function useRoom() {
  const room = useContext(RoomContext);
  if (!room) throw new Error("useRoom must be used within RoomProvider");
  return room;
}