import { NextRequest, NextResponse } from 'next/server';

function getVideoId(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname === 'youtu.be') return url.pathname.slice(1);
    if (url.hostname.endsWith('youtube.com') || url.hostname.endsWith('youtube-nocookie.com')) {
      return url.searchParams.get('v');
    }
  } catch {
    return null;
  }

  return null;
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q');
  if (!query) {
    return NextResponse.json({ error: 'Missing search query' }, { status: 400 });
  }

  const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
  const videoId = getVideoId(query);
  const url = videoId
    ? `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}&key=${apiKey}`
    : `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(query)}&key=${apiKey}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data.items) {
      return NextResponse.json({ error: 'No results found' }, { status: 404 });
    }
    const items = videoId
      ? data.items.map((item: { id: string; snippet: unknown }) => ({ id: { videoId: item.id }, snippet: item.snippet }))
      : data.items;
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json({ error: 'YouTube API error', details: error }, { status: 500 });
  }
}