const baseUrl = process.env.BEAT_HIVE_BASE_URL;
const roomCode = process.env.BEAT_HIVE_ROOM_CODE;
const attendees = Number(process.env.BEAT_HIVE_ATTENDEES || 300);

if (!baseUrl || !roomCode) {
  throw new Error("Set BEAT_HIVE_BASE_URL and BEAT_HIVE_ROOM_CODE before running this staging-only check.");
}

const trackId = process.env.BEAT_HIVE_TRACK_ID || "load-track-1";

function tally(items) {
  return items.reduce((counts, item) => ({ ...counts, [item]: (counts[item] || 0) + 1 }), {});
}

const base = baseUrl.replace(/\/$/, "");
const startedAt = performance.now();

const joins = await Promise.all(Array.from({ length: attendees }, async (_, index) => {
  const response = await fetch(`${base}/api/rooms/${encodeURIComponent(roomCode)}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName: `Load Guest ${index + 1}` }),
  });
  return { status: response.status, cookie: response.headers.get("set-cookie")?.split(";")[0] };
}));

const joinMs = performance.now() - startedAt;
const votes = await Promise.all(joins.map(async ({ status, cookie }) => {
  if (status !== 200 || !cookie) return "join-failed";
  const response = await fetch(`${base}/api/rooms/${encodeURIComponent(roomCode)}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ action: "vote", videoId: trackId }),
  });
  return response.status;
}));

console.log(JSON.stringify({
  attendees,
  joinMs: Math.round(joinMs),
  totalMs: Math.round(performance.now() - startedAt),
  joins: tally(joins.map(({ status }) => status)),
  votes: tally(votes),
}, null, 2));

if (joins.some(({ status }) => status !== 200) || votes.some((status) => status !== 200)) process.exitCode = 1;