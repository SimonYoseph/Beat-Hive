# Beat Hive

Join the crowd. Control the music. Tip the Host.

## 🚀 Live Demo

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/SimonYoseph/Beat-Hive)

Want to test Beat Hive? Click the button above to deploy it to Vercel in one click, or visit our [live demo](https://beat-hive.vercel.app) (once deployed).

## Getting Started

First, run the development server:

```bash
# Beat Hive

Beat Hive is a live music-request experience for parties and DJ rooms. Guests browse songs, submit requests, and view their queue from their phone; DJs can configure a music source and manage the room.

## Current Functionality

- Google sign-in with a connected YouTube Music account.
- YouTube and YouTube Music song search.
- Direct lookup from pasted `youtube.com`, `music.youtube.com`, or `youtu.be` video links.
- A personal request queue that shows track order, artwork, title, and channel.
- Duplicate-request prevention on the current device.
- Reorder controls for upcoming tracks while the currently playing track remains locked.
- Removal controls for every track; removing the playing track advances to the next request.
- Free in-browser YouTube playback controls for the active queued track, with automatic advance to the next request or a matching YouTube recommendation based on the two most recent tracks.
- A connected account can add selected videos to its private `BeatHive Queue` YouTube playlist.
- Signed-in users' profile icon, music source, role, room access, and view preferences sync through the Beat Hive server.
- DJ and guest entry flows, an interactive action globe, and a list-view alternative.

Open `/youtube` to search, request music, and view the current device's queue. The **Request** and **Queue** actions in the main experience both lead there.

## YouTube Music Setup

Add these variables to `.env.local`:

```bash
GOOGLE_CLIENT_ID=your-google-oauth-client-id
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
NEXTAUTH_SECRET=a-long-random-secret
NEXT_PUBLIC_YOUTUBE_API_KEY=your-youtube-data-api-key
```

Enable the YouTube Data API v3 for the Google Cloud project used by the OAuth client. When connecting, Beat Hive requests `youtube.force-ssl`, which lets the signed-in account create and update its private `BeatHive Queue` playlist. Users who connected before this permission was added must reconnect and approve the updated consent screen.

YouTube does not provide an API for its native YouTube Music playback queue. Beat Hive therefore uses a private YouTube playlist as the connected account's queue.

## Settings Sync

For free local or self-hosted use, Beat Hive stores signed-in account settings in `.beat-hive/settings.json` on the server. Any device signed into the same account and connected to that server receives the saved preferences when it opens the app. The data directory is ignored by git.

This file-backed store requires persistent disk on the host. For serverless deployments, replace it with a managed database or key-value store before relying on cross-device persistence.

## Shared Party Queue Design

The current queue is stored in browser storage, so it is visible on the same device. A shared party queue requires persistent storage and realtime updates, such as Postgres with Supabase Realtime.

Each room should own its requests. A request record should include the room ID, video ID, requester ID, vote total, creation time, state, and the requester’s trust score. The DJ's linked account owns the room playlist; guests never receive its OAuth token.

### Ordering Formula

Rank each eligible request using:

$$
	ext{request score} = \text{upvotes} + 2 \times \text{requester trust} - 0.1 \times \text{age in minutes}
$$

The next track is the highest-scoring eligible request. After one of a guest's tracks plays, apply a short cooldown or temporary score reduction to avoid one person dominating the queue. Increase trust when a guest’s selections receive sustained positive votes; reduce it for skipped or consistently downvoted tracks.

Realtime subscriptions should update the queue, votes, now-playing state, and score order for every guest. The playback controller should append the top-ranked approved track to the DJ-owned YouTube playlist when the current track ends.

## Getting Started

```bash
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000), and the music browser is at [http://localhost:3000/youtube](http://localhost:3000/youtube).
