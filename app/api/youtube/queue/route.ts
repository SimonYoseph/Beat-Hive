import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "../../auth/[...nextauth]/route";

const QUEUE_TITLE = "BeatHive Queue";
const QUEUE_DESCRIPTION = "Tracks queued from BeatHive.";

type YouTubeError = {
  error?: {
    message?: string;
  };
};

async function youtubeRequest<T>(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<{ data?: T; error?: string; status?: number }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`https://www.googleapis.com/youtube/v3${path}`, {
        ...init,
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          ...init?.headers,
        },
      });

      const data = (await response.json()) as T & YouTubeError;
      if (response.ok) return { data };

      const error = data.error?.message || "YouTube could not update your queue.";
      if (attempt === 0 && error.toLowerCase().includes("operation was aborted")) continue;
      return { error, status: response.status };
    } catch {
      if (attempt === 1) return { error: "Could not reach YouTube. Please try again." };
    }
  }

  return { error: "YouTube could not update your queue." };
}

function errorResponse(error: string | undefined, status?: number) {
  if (status === 401 || status === 403) {
    return NextResponse.json(
      { error: "Your YouTube permission has expired. Reconnect YouTube Music, then try again." },
      { status: 401 },
    );
  }

  return NextResponse.json({ error: error || "YouTube could not update your queue." }, { status: 502 });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const accessToken = (session as typeof session & { accessToken?: string } | null)?.accessToken;

  if (!accessToken) {
    return NextResponse.json(
      { error: "Reconnect your YouTube Music account to queue tracks." },
      { status: 401 },
    );
  }

  const { videoId } = (await request.json()) as { videoId?: string };
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: "A valid YouTube video is required." }, { status: 400 });
  }

  const playlists = await youtubeRequest<{ items?: Array<{ id: string; snippet: { title: string } }> }>(
    "/playlists?part=snippet&mine=true&maxResults=50",
    accessToken,
  );
  if (!playlists.data) {
    return errorResponse(playlists.error, playlists.status);
  }

  let playlistId = playlists.data.items?.find((playlist) => playlist.snippet.title === QUEUE_TITLE)?.id;
  if (!playlistId) {
    const createdPlaylist = await youtubeRequest<{ id: string }>("/playlists?part=snippet,status", accessToken, {
      method: "POST",
      body: JSON.stringify({
        snippet: { title: QUEUE_TITLE, description: QUEUE_DESCRIPTION },
        status: { privacyStatus: "private" },
      }),
    });
    if (!createdPlaylist.data) {
      return errorResponse(createdPlaylist.error, createdPlaylist.status);
    }
    playlistId = createdPlaylist.data.id;
  }

  const queuedTrack = await youtubeRequest<{ id: string }>("/playlistItems?part=snippet", accessToken, {
    method: "POST",
    body: JSON.stringify({
      snippet: {
        playlistId,
        resourceId: { kind: "youtube#video", videoId },
      },
    }),
  });
  if (!queuedTrack.data) {
    return errorResponse(queuedTrack.error, queuedTrack.status);
  }

  return NextResponse.json({ playlistId, queueItemId: queuedTrack.data.id }, { status: 201 });
}