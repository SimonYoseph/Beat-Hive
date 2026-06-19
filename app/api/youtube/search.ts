import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q');
  if (!query) {
    return NextResponse.json({ error: 'Missing search query' }, { status: 400 });
  }

  const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(query)}&key=${apiKey}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data.items) {
      return NextResponse.json({ error: 'No results found' }, { status: 404 });
    }
    return NextResponse.json({ items: data.items });
  } catch (error) {
    return NextResponse.json({ error: 'YouTube API error', details: error }, { status: 500 });
  }
}
