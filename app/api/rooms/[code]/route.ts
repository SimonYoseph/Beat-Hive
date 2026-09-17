import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "../../../../lib/supabase/server";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Shared rooms are not configured." }, { status: 503 });

  const { data, error } = await supabase.from("hive_rooms").select("code, name, host_name, version, state, updated_at").eq("code", code.toUpperCase()).single();
  if (error || !data) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  return NextResponse.json({ room: data });
}