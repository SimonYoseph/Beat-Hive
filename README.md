# Beat Hive

Beat Hive is a music-request experience for parties and DJ rooms. Guests can search YouTube, request songs, vote, and follow the play queue from a browser.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The music request page is at `http://localhost:3000/youtube`.

## Shared Hive Sessions

For shared event rooms, create a Supabase project and run [supabase/migrations/20260917230000_shared_hive_rooms.sql](supabase/migrations/20260917230000_shared_hive_rooms.sql) in the Supabase SQL editor. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` and the Vercel project environment. Keep the service-role key server-only.

The room API is available at `/api/rooms`: signed-in hosts create rooms with `POST`, and guests fetch room snapshots with `GET /api/rooms/:code`. The migration enables Supabase Realtime replication for `hive_rooms` and provides atomic state and vote operations.

Deploy the environment variables to Vercel before building the production deployment because `NEXT_PUBLIC_` variables are embedded at build time. After a host creates a staging room, run `BEAT_HIVE_BASE_URL=https://your-staging-url BEAT_HIVE_ROOM_CODE=ROOMCODE npm run stress:room` to check 300 simultaneous room snapshots. Full end-to-end load testing also requires test accounts or an authenticated browser test harness for host mutations and guest vote cookies.

## Music Requests

- Search YouTube or paste a `youtube.com`, `music.youtube.com`, or `youtu.be` link.
- Search titles receive predictive suggestions. Press Tab to accept the first suggestion, or select a suggestion to search immediately.
- Suggestions close after selecting one or clicking outside the search area.
- A request always appears in **Your queue**, including if the optional connected YouTube playlist update fails.

## Queue Behavior

- Selecting a search result queues it as a request in **Your queue**. Duplicate requests are blocked on that device.
- **Your queue** records requested tracks and their upvotes.
- **Hive Queue** is the separate playback queue. Upvoting a request that is not already there adds it to Hive Queue.
- When Hive Queue has no upcoming track, a newly requested song enters it automatically.
- Hive Queue tracks can be reordered by dragging the three-line handle, except for the current track.
- Tracks can be removed from either queue. Removing the active Hive Queue track advances to the next available track.
- The main player supports play, pause, and skip to the next queued track.
- The first song added to an empty Hive Queue starts automatically. When playback has no queued request to continue with, Beat Hive searches for a related YouTube track using the last one or two songs as context.

## Played History

Tracks are recorded in **Played history** only after playback starts. The list can be minimized and keeps the most recent 50 locally.

## YouTube Account Setup

Create `.env.local` with:

```bash
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
NEXTAUTH_SECRET=a-long-random-secret
NEXT_PUBLIC_YOUTUBE_API_KEY=your-youtube-data-api-key
```

Enable YouTube Data API v3 in the associated Google Cloud project. A Google account used with either YouTube or YouTube Music can connect and grant `youtube.force-ssl`, allowing Beat Hive to add selected tracks to a private `BeatHive Queue` YouTube playlist. That playlist is available in the same account's YouTube library; YouTube Music's native play queue is not exposed through a public API.

Local request queuing is independent of the connected playlist: a song stays in **Your queue** even when the playlist update is unavailable or fails.

## Persistence

Queue data and played history are browser-local, so they are available on the same device. Signed-in account settings such as role, view, source, Energy preference, and profile image are stored in `.beat-hive/settings.json` for local/self-hosted setups with persistent disk.

A shared, real-time party queue across different devices requires a database and realtime synchronization service; it is not part of the current local queue implementation.

## Shared Queue Ranking Formula

For a future shared party queue, eligible requests can be ranked by:

$$
\operatorname{requestScore} = \operatorname{upvotes} + 2 \cdot \operatorname{requesterTrust} - 0.1 \cdot \operatorname{ageMinutes}
$$

The highest-scoring eligible request plays next. A short post-play cooldown or temporary score reduction can prevent one requester from dominating the queue.
