import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "../../auth/[...nextauth]/route";
import { getSupabaseAdmin } from "../../../../lib/supabase/server";

type RoomRecord = { code: string; name: string; host_email: string; created_at: string };
type AttendanceRecord = { joined_at: string; hive_rooms: RoomRecord[] };

export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Sign in to view party history." }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Shared rooms are not configured." }, { status: 503 });

  const [hostedResult, attendedResult] = await Promise.all([
    supabase.from("hive_rooms").select("code, name, host_email, created_at").ilike("host_email", email).order("created_at", { ascending: false }).limit(20),
    supabase.from("hive_room_participants").select("joined_at, hive_rooms!inner(code, name, host_email, created_at)").eq("attendee_email", email).order("joined_at", { ascending: false }).limit(50),
  ]);

  if (hostedResult.error || attendedResult.error) return NextResponse.json({ error: "Could not load party history." }, { status: 502 });

  const hosted = (hostedResult.data || []).map((room: RoomRecord) => ({ code: room.code, name: room.name, occurredAt: room.created_at }));
  const attended = (attendedResult.data || []).flatMap((participant: AttendanceRecord) => {
    const room = participant.hive_rooms[0];
    if (!room || room.host_email.toLowerCase() === email) return [];
    return [{ code: room.code, name: room.name, occurredAt: room.created_at, joinedAt: participant.joined_at }];
  });

  return NextResponse.json({ hosted, attended });
}