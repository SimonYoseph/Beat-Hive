const baseUrl = process.env.BEAT_HIVE_BASE_URL;
const roomCode = process.env.BEAT_HIVE_ROOM_CODE;
const attendees = Number(process.env.BEAT_HIVE_ATTENDEES || 300);

if (!baseUrl || !roomCode) {
  throw new Error("Set BEAT_HIVE_BASE_URL and BEAT_HIVE_ROOM_CODE before running this staging-only check.");
}

const startedAt = performance.now();
const results = await Promise.all(Array.from({ length: attendees }, async () => {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/rooms/${encodeURIComponent(roomCode)}`);
  return response.status;
}));
const statusCounts = results.reduce((counts, status) => ({
  ...counts,
  [status]: (counts[status] || 0) + 1,
}), {});

console.log(JSON.stringify({ attendees, elapsedMs: Math.round(performance.now() - startedAt), statusCounts }, null, 2));

if (results.some((status) => status !== 200)) process.exitCode = 1;