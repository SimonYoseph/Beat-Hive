import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "../../../../../lib/supabase/server";

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = rawCode.toUpperCase();
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Shared rooms are not configured." }, { status: 503 });

  const body = (await request.json()) as { displayName?: unknown };
  const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 60) : "Guest";
  const { data: room } = await supabase.from("hive_rooms").select("id, code, name, host_name, version, state").eq("code", code).single();
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  const { data: participant, error } = await supabase.from("hive_room_participants").insert({ room_id: room.id, display_name: displayName || "Guest" }).select("token").single();
  if (error || !participant) return NextResponse.json({ error: "Could not join the room." }, { status: 502 });

  const response = NextResponse.json({ room });
  response.cookies.set(`bh_room_${code}`, participant.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12 });
  return response;
}