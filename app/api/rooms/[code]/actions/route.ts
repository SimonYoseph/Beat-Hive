import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "../../../auth/[...nextauth]/route";
import { getSupabaseAdmin } from "../../../../../lib/supabase/server";

type Track = { videoId: string; title: string; channelTitle: string; thumbnail?: string; upvotes?: number };
type RoomState = { requests?: Track[]; queue?: Track[]; nowPlaying?: Track | null; isPlaying?: boolean; settings?: Record<string, unknown>; feedback?: Record<string, unknown> };

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

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Shared rooms are not configured." }, { status: 503 });

  const body = (await request.json()) as { action?: unknown; track?: unknown; videoId?: unknown; state?: unknown; version?: unknown; feedback?: unknown };
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
    const state = room.state as RoomState;
    const settings = state.settings || {};
    const requests = state.requests || [];
    if (settings.requestsPaused === true) return NextResponse.json({ error: "Requests are paused by the host." }, { status: 403 });
    if (settings.preventDuplicates !== false && requests.some((request) => request.videoId === track.videoId)) return NextResponse.json({ error: "This track has already been requested." }, { status: 409 });
    if (requests.length >= (typeof settings.maxRequests === "number" ? settings.maxRequests : 20)) return NextResponse.json({ error: "The room request limit has been reached." }, { status: 409 });
    const requestedTrack = { ...track, upvotes: 0 };
    const queue = state.queue || [];
    const shouldStartPlayback = !state.nowPlaying && queue.length === 0;
    const nextState = {
      ...state,
      requests: [...requests, requestedTrack],
      queue: shouldStartPlayback ? [requestedTrack] : queue,
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
  if (session?.user?.email?.toLowerCase() !== room.host_email.toLowerCase()) return NextResponse.json({ error: "Only the room host can control this session." }, { status: 403 });
  if (body.action !== "host-state" || !isHostState(body.state) || typeof body.version !== "number") return NextResponse.json({ error: "Invalid room update." }, { status: 400 });

  const { data, error } = await supabase.rpc("update_hive_room_state", { room_code: code, expected_version: body.version, next_state: body.state });
  if (error) return NextResponse.json({ error: "The room changed. Refresh and try again." }, { status: 409 });
  return NextResponse.json({ room: data });
}