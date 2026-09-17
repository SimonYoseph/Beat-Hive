import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "../auth/[...nextauth]/route";
import { getSupabaseAdmin } from "../../../lib/supabase/server";

function newRoomCode() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const hostEmail = session?.user?.email;
  if (!hostEmail) return NextResponse.json({ error: "Sign in to create a room." }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Shared rooms are not configured." }, { status: 503 });

  const body = (await request.json()) as { name?: unknown };
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  if (!name) return NextResponse.json({ error: "A room name is required." }, { status: 400 });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = newRoomCode();
    const { data, error } = await supabase.from("hive_rooms").insert({
      code,
      name,
      host_email: hostEmail,
      host_name: session.user?.name || "Hive Host",
    }).select("code, name, host_name, version, state").single();
    if (data) return NextResponse.json({ room: data }, { status: 201 });
    if (!error?.message.includes("duplicate key")) return NextResponse.json({ error: "Could not create room." }, { status: 502 });
  }

  return NextResponse.json({ error: "Could not allocate a room code. Try again." }, { status: 503 });
}