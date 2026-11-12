import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { suggest } from '@/lib/mapbox/search';

const suggestQuerySchema = z.object({
  q: z.string().trim().min(2, 'Query must be at least 2 characters long'),
  session_token: z.string().min(1, 'session_token is required'),
  proximity: z.string().optional(),
  country: z.string().optional().default('in'),
  language: z.string().optional().default('en'),
  limit: z.coerce.number().int().min(1).max(20).optional().default(8),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = suggestQuerySchema.safeParse({
      q: searchParams.get('q') ?? undefined,
      session_token: searchParams.get('session_token') ?? undefined,
      proximity: searchParams.get('proximity') ?? undefined,
      country: searchParams.get('country') ?? undefined,
      language: searchParams.get('language') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    });

    if (!parsed.success) {
      const errorMessage = parsed.error.issues.map((i) => i.message).join(', ');
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const suggestions = await suggest(parsed.data);
    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('Error in /api/search/suggest:', error);
    const message =
      error instanceof Error && error.message.includes('MAPBOX_SECRET_TOKEN')
        ? 'Mapbox secret token is not configured on the server'
        : 'Failed to fetch suggestions';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

