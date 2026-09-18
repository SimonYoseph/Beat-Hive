import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "../../../auth/[...nextauth]/route";
import { getSupabaseAdmin } from "../../../../../lib/supabase/server";

type Requester = { id: string; name: string };
type Track = { videoId: string; title: string; channelTitle: string; thumbnail?: string; upvotes?: number; requestedBy?: Requester };
type VibeReward = { participantId: string; participantName: string; score: number; fireUntil: string; lastAwardedAt: string };
type VibeShoutout = { participantName: string; expiresAt: string };
type RoomState = { requests?: Track[]; queue?: Track[]; nowPlaying?: Track | null; isPlaying?: boolean; settings?: Record<string, unknown>; feedback?: Record<string, unknown>; vibeRewards?: VibeReward[]; vibeShoutout?: VibeShoutout; awardedRequestIds?: string[] };
const MASTER_CONTROL_EMAIL = "simon97862012@gmail.com";

function isTrack(value: unknown): value is Track {
  if (!value || typeof value !== "object") return false;
  const track = value as Record<string, unknown>;
  return typeof track.videoId === "string" && track.videoId.length <= 64 && typeof track.title === "string" && track.title.length <= 300 && typeof track.channelTitle === "string" && track.channelTitle.length <= 200;
}

function isHostState(value: unknown): value is RoomState {
  if (!value || typeof value !== "object") return false;
  const state = value as RoomState;
  return (!state.requests || state.requests.every(isTrack)) && (!state.queue || state.queue.every(isTrack)) && (state.nowPlaying === undefined || state.nowPlaying === null || isTrack(state.nowPlaying)) && (state.settings === undefined || typeof state.settings === "object") && (state.feedback === undefined || typeof state.feedback === "object");
}

function awardVibeRewards(previousState: RoomState, nextState: RoomState) {
  const now = new Date();
  const awardedRequestIds = new Set(previousState.awardedRequestIds || []);
  const rewards = [...(previousState.vibeRewards || [])].filter((reward) => new Date(reward.fireUntil) > now);
  const promotedRequests = (nextState.queue || []).flatMap((queuedTrack) => {
    const request = (previousState.requests || []).find((candidate) => candidate.videoId === queuedTrack.videoId);
    return request?.requestedBy && (request.upvotes || 0) >= 3 ? [request] : [];
  });
  let vibeShoutout = previousState.vibeShoutout && new Date(previousState.vibeShoutout.expiresAt) > now ? previousState.vibeShoutout : undefined;

  for (const request of promotedRequests) {
    const awardId = `${request.requestedBy!.id}:${request.videoId}`;
    if (awardedRequestIds.has(awardId)) continue;
    awardedRequestIds.add(awardId);

    const existingIndex = rewards.findIndex((reward) => reward.participantId === request.requestedBy!.id);
    const existing = existingIndex >= 0 ? rewards[existingIndex] : undefined;
    const score = (existing?.score || 0) + 1;
    const likes = request.upvotes || 0;
    const fireMinutes = Math.min(24 * 60, 60 + (likes - 3) * 15 + Math.min(score, 12) * 5);
    const fireUntil = new Date(Math.max(existing ? new Date(existing.fireUntil).getTime() : 0, now.getTime() + fireMinutes * 60_000)).toISOString();
    const reward: VibeReward = { participantId: request.requestedBy!.id, participantName: request.requestedBy!.name, score, fireUntil, lastAwardedAt: now.toISOString() };
    if (existingIndex >= 0) rewards[existingIndex] = reward;
    else rewards.push(reward);
    vibeShoutout = { participantName: reward.participantName, expiresAt: new Date(now.getTime() + Math.min(5 * 60_000, (90 + likes * 20) * 1_000)).toISOString() };
  }

  return { ...nextState, vibeRewards: rewards, vibeShoutout, awardedRequestIds: [...awardedRequestIds].slice(-200) };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Shared rooms are not configured." }, { status: 503 });

  const body = (await request.json()) as { action?: unknown; track?: unknown; videoId?: unknown; state?: unknown; version?: unknown; feedback?: unknown; email?: unknown; role?: unknown };
  const { data: room } = await supabase.from("hive_rooms").select("id, host_email, version, state").eq("code", code).single();
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  if (body.action === "vote" && typeof body.videoId === "string") {
    const voterToken = request.cookies.get(`bh_room_${code}`)?.value;
    if (!voterToken) return NextResponse.json({ error: "Join this room before voting." }, { status: 401 });
    const { data, error } = await supabase.rpc("upvote_hive_request", { room_code: code, video_id: body.videoId, voter_token: voterToken });
    if (error) return NextResponse.json({ error: error.message.includes("already voted") ? "You already voted for this request." : "Could not register vote." }, { status: 409 });
    return NextResponse.json({ room: data });
  }

  const track = body.track;
  if (body.action === "request" && isTrack(track)) {
    const participantToken = request.cookies.get(`bh_room_${code}`)?.value;
    if (!participantToken) return NextResponse.json({ error: "Join this room before requesting a track." }, { status: 401 });
    const { data: participant } = await supabase.from("hive_room_participants").select("id, display_name").eq("room_id", room.id).eq("token", participantToken).single();
    if (!participant) return NextResponse.json({ error: "Join this room before requesting a track." }, { status: 401 });
    const state = room.state as RoomState;
    const settings = state.settings || {};
    const requests = state.requests || [];
    if (settings.requestsPaused === true) return NextResponse.json({ error: "Requests are paused by the host." }, { status: 403 });
    if (settings.preventDuplicates !== false && requests.some((request) => request.videoId === track.videoId)) return NextResponse.json({ error: "This track has already been requested." }, { status: 409 });
    if (requests.length >= (typeof settings.maxRequests === "number" ? settings.maxRequests : 20)) return NextResponse.json({ error: "The room request limit has been reached." }, { status: 409 });
    const requestedTrack = { ...track, upvotes: 0, requestedBy: { id: participant.id, name: participant.display_name } };
    const queue = state.queue || [];
    const nextQueue = [...queue, requestedTrack];
    const shouldStartPlayback = !state.nowPlaying;
    const nextState = {
      ...state,
      requests: [...requests, requestedTrack],
      queue: nextQueue,
      nowPlaying: shouldStartPlayback ? requestedTrack : state.nowPlaying,
      isPlaying: shouldStartPlayback || state.isPlaying,
    };
    const { data, error } = await supabase.rpc("update_hive_room_state", { room_code: code, expected_version: room.version, next_state: nextState });
    if (error) return NextResponse.json({ error: "The room changed. Refresh and try again." }, { status: 409 });
    return NextResponse.json({ room: data });
  }

  if (body.action === "feedback" && body.feedback && typeof body.feedback === "object") {
    const participantToken = request.cookies.get(`bh_room_${code}`)?.value;
    if (!participantToken) return NextResponse.json({ error: "Join this room before sending feedback." }, { status: 401 });
    const nextState = { ...(room.state as RoomState), feedback: { ...((room.state as RoomState).feedback || {}), ...body.feedback } };
    const { data, error } = await supabase.rpc("update_hive_room_state", { room_code: code, expected_version: room.version, next_state: nextState });
    if (error) return NextResponse.json({ error: "The room changed. Refresh and try again." }, { status: 409 });
    return NextResponse.json({ room: data });
  }

  const session = await getServerSession(authOptions);
  const actorEmail = session?.user?.email?.toLowerCase();
  if (body.action === "manage-host") {
    if (actorEmail !== MASTER_CONTROL_EMAIL) return NextResponse.json({ error: "Only Omni Control can change room roles." }, { status: 403 });
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (body.role !== "host" && body.role !== "user")) return NextResponse.json({ error: "Provide a valid email and role." }, { status: 400 });
    const { error } = body.role === "host"
      ? await supabase.from("hive_room_hosts").upsert({ room_id: room.id, email, added_by_email: actorEmail }, { onConflict: "room_id,email" })
      : await supabase.from("hive_room_hosts").delete().eq("room_id", room.id).eq("email", email);
    if (error) return NextResponse.json({ error: "Could not update this room role." }, { status: 502 });
    const { data: hosts } = await supabase.from("hive_room_hosts").select("email").eq("room_id", room.id).order("created_at");
    return NextResponse.json({ room: { ...room, hosts: hosts || [] } });
  }

  if (!actorEmail) return NextResponse.json({ error: "Only a room host can control this session." }, { status: 403 });
  const { data: hostMembership } = await supabase.from("hive_room_hosts").select("room_id").eq("room_id", room.id).eq("email", actorEmail).maybeSingle();
  if (!hostMembership) return NextResponse.json({ error: "Only a room host can control this session." }, { status: 403 });
  if (body.action !== "host-state" || !isHostState(body.state) || typeof body.version !== "number") return NextResponse.json({ error: "Invalid room update." }, { status: 400 });

  const nextState = awardVibeRewards(room.state as RoomState, body.state);
  const { data, error } = await supabase.rpc("update_hive_room_state", { room_code: code, expected_version: body.version, next_state: nextState });
  if (error) return NextResponse.json({ error: "The room changed. Refresh and try again." }, { status: 409 });
  return NextResponse.json({ room: data });
}