import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { retrieve } from '@/lib/mapbox/search';

const retrieveQuerySchema = z.object({
  id: z.string().min(1, 'Suggestion id is required'),
  session_token: z.string().min(1, 'session_token is required'),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = retrieveQuerySchema.safeParse({
      id: searchParams.get('id') ?? undefined,
      session_token: searchParams.get('session_token') ?? undefined,
    });

    if (!parsed.success) {
      const errorMessage = parsed.error.issues.map((i) => i.message).join(', ');
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const place = await retrieve(parsed.data);
    if (!place) {
      return NextResponse.json({ error: 'Place not found' }, { status: 404 });
    }

    return NextResponse.json({ place });
  } catch (error) {
    console.error('Error in /api/search/retrieve:', error);
    const message =
      error instanceof Error && error.message.includes('MAPBOX_SECRET_TOKEN')
        ? 'Mapbox secret token is not configured on the server'
        : 'Failed to retrieve place details';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

