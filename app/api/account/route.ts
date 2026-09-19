import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { join } from "path";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "../auth/[...nextauth]/route";
import { getSupabaseAdmin } from "../../../lib/supabase/server";

const dataDirectory = join(process.cwd(), ".beat-hive");
const settingsFile = join(dataDirectory, "settings.json");

async function deleteStoredSettings(email: string) {
  try {
    const settings = JSON.parse(await readFile(settingsFile, "utf8")) as Record<string, unknown>;
    delete settings[email];
    await mkdir(dataDirectory, { recursive: true });
    const temporaryFile = `${settingsFile}.${process.pid}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(settings), "utf8");
    await rename(temporaryFile, settingsFile);
  } catch {
    // The account may not have local settings yet.
  }
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Sign in to delete your Beat Hive account." }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const [hostedRooms, deletedParticipants, deletedHostRoles] = await Promise.all([
      supabase.from("hive_rooms").delete().eq("host_email", email),
      supabase.from("hive_room_participants").delete().eq("attendee_email", email),
      supabase.from("hive_room_hosts").delete().eq("email", email),
    ]);
    if (hostedRooms.error || deletedParticipants.error || deletedHostRoles.error) {
      return NextResponse.json({ error: "Could not delete your shared-room data." }, { status: 502 });
    }
  }

  await deleteStoredSettings(email);
  return NextResponse.json({ deleted: true });
}