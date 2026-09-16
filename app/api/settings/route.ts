import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { join } from "path";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "../auth/[...nextauth]/route";

const dataDirectory = join(process.cwd(), ".beat-hive");
const settingsFile = join(dataDirectory, "settings.json");

type Settings = {
  userRole?: "none" | "dj" | "guest";
  hasAccess?: boolean;
  viewMode?: "globe" | "list";
  musicSource?: "spotify" | "apple" | "youtube" | null;
  isAnonymousDJ?: boolean;
  customIcon?: string | null;
  energyPreference?: "up" | "down" | null;
};

type SettingsByUser = Record<string, Settings>;

async function readSettings(): Promise<SettingsByUser> {
  try {
    return JSON.parse(await readFile(settingsFile, "utf8")) as SettingsByUser;
  } catch {
    return {};
  }
}

async function writeSettings(settings: SettingsByUser) {
  await mkdir(dataDirectory, { recursive: true });
  const temporaryFile = `${settingsFile}.${process.pid}.tmp`;
  await writeFile(temporaryFile, JSON.stringify(settings), "utf8");
  await rename(temporaryFile, settingsFile);
}

function sanitizeSettings(value: unknown): Settings {
  if (!value || typeof value !== "object") return {};
  const settings = value as Record<string, unknown>;
  const userRole = settings.userRole;
  const viewMode = settings.viewMode;
  const musicSource = settings.musicSource;
  const customIcon = settings.customIcon;
  const energyPreference = settings.energyPreference;

  return {
    ...(userRole === "none" || userRole === "dj" || userRole === "guest" ? { userRole } : {}),
    ...(typeof settings.hasAccess === "boolean" ? { hasAccess: settings.hasAccess } : {}),
    ...(viewMode === "globe" || viewMode === "list" ? { viewMode } : {}),
    ...(musicSource === "spotify" || musicSource === "apple" || musicSource === "youtube" || musicSource === null ? { musicSource } : {}),
    ...(typeof settings.isAnonymousDJ === "boolean" ? { isAnonymousDJ: settings.isAnonymousDJ } : {}),
    ...(typeof customIcon === "string" && customIcon.length <= 1_500_000 ? { customIcon } : customIcon === null ? { customIcon: null } : {}),
    ...(energyPreference === "up" || energyPreference === "down" || energyPreference === null ? { energyPreference } : {}),
  };
}

async function getUserId() {
  const session = await getServerSession(authOptions);
  return session?.user?.email;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to sync settings." }, { status: 401 });

  const settings = await readSettings();
  return NextResponse.json({ settings: settings[userId] || {} });
}

export async function PUT(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to sync settings." }, { status: 401 });

  const body = (await request.json()) as { settings?: unknown };
  const settings = await readSettings();
  settings[userId] = sanitizeSettings(body.settings);
  await writeSettings(settings);

  return NextResponse.json({ settings: settings[userId] });
}