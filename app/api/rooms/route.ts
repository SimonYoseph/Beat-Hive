import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "../auth/[...nextauth]/route";
import { getSupabaseAdmin } from "../../../lib/supabase/server";

function newRoomCode() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
}

function parseCoHostEmails(value: unknown, hostEmail: string) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((email) => typeof email === "string" ? [email.trim().toLowerCase()] : []))]
    .filter((email) => email !== hostEmail.toLowerCase() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    .slice(0, 10);
}

type StarterTrack = { videoId: string; title: string; channelTitle: string; thumbnail?: string };

function parseStarterQueue(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((track): StarterTrack[] => {
    if (!track || typeof track !== "object") return [];
    const candidate = track as Record<string, unknown>;
    if (typeof candidate.videoId !== "string" || typeof candidate.title !== "string" || typeof candidate.channelTitle !== "string") return [];
    return [{ videoId: candidate.videoId.slice(0, 64), title: candidate.title.slice(0, 300), channelTitle: candidate.channelTitle.slice(0, 200), ...(typeof candidate.thumbnail === "string" ? { thumbnail: candidate.thumbnail.slice(0, 1_000) } : {}) }];
  }).slice(0, 5);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const hostEmail = session?.user?.email;
  if (!hostEmail) return NextResponse.json({ error: "Sign in to create a room." }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Shared rooms are not configured." }, { status: 503 });

  const body = (await request.json()) as { name?: unknown; coHostEmails?: unknown; starterQueue?: unknown };
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  if (!name) return NextResponse.json({ error: "A room name is required." }, { status: 400 });
  const coHostEmails = parseCoHostEmails(body.coHostEmails, hostEmail);
  const starterQueue = parseStarterQueue(body.starterQueue);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = newRoomCode();
    const { data, error } = await supabase.from("hive_rooms").insert({
      code,
      name,
      host_email: hostEmail,
      host_name: session.user?.name || "Hive Host",
      ...(starterQueue.length > 0 ? { state: { requests: [], queue: starterQueue, nowPlaying: starterQueue[0], isPlaying: false, settings: { requestsPaused: false, queueLocked: false, maxRequests: 20, preventDuplicates: true, voteThreshold: 0 } } } : {}),
    }).select("id, code, name, host_email, host_name, version, state").single();
    if (data) {
      const hosts = [hostEmail.toLowerCase(), ...coHostEmails];
      const { error: hostError } = await supabase.from("hive_room_hosts").insert(hosts.map((email) => ({ room_id: data.id, email, added_by_email: hostEmail.toLowerCase() })));
      if (!hostError) return NextResponse.json({ room: { ...data, hosts: hosts.map((email) => ({ email })) } }, { status: 201 });
      await supabase.from("hive_rooms").delete().eq("id", data.id);
      return NextResponse.json({ error: "Could not add room hosts." }, { status: 502 });
    }
    if (!error?.message.includes("duplicate key")) return NextResponse.json({ error: "Could not create room." }, { status: 502 });
  }

  return NextResponse.json({ error: "Could not allocate a room code. Try again." }, { status: 503 });
}