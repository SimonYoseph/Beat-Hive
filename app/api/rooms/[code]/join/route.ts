import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "../../../auth/[...nextauth]/route";
import { getSupabaseAdmin } from "../../../../../lib/supabase/server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Shared rooms are not configured." }, { status: 503 });

  const body = (await request.json()) as { displayName?: unknown };
  const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 60) : "Guest";
  const attendeeEmail = (await getServerSession(authOptions))?.user?.email?.toLowerCase() || null;
  const { data: room } = await supabase.from("hive_rooms").select("id, code, name, host_email, host_name, version, state, hosts:hive_room_hosts(email)").eq("code", code).single();
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  const { data: existingParticipant } = attendeeEmail
    ? await supabase.from("hive_room_participants").select("id").eq("room_id", room.id).eq("attendee_email", attendeeEmail).maybeSingle()
    : { data: null };

  const { data: participant, error } = await supabase.from("hive_room_participants").insert({ room_id: room.id, display_name: displayName || "Guest", attendee_email: attendeeEmail }).select("token").single();
  if (error || !participant) return NextResponse.json({ error: "Could not join the room." }, { status: 502 });

  const isHost = Boolean(attendeeEmail && (room.host_email.toLowerCase() === attendeeEmail || room.hosts.some((host) => host.email.toLowerCase() === attendeeEmail)));
  const response = NextResponse.json({ room: { ...room, isHost, wasAlreadyInSession: Boolean(existingParticipant) } });
  response.cookies.set(`bh_room_${code}`, participant.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12 });
  return response;
}