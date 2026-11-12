import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { reverseGeocode } from '@/lib/mapbox/search';

const reverseQuerySchema = z.object({
  lng: z.coerce.number().min(-180, 'Longitude must be >= -180').max(180, 'Longitude must be <= 180'),
  lat: z.coerce.number().min(-90, 'Latitude must be >= -90').max(90, 'Latitude must be <= 90'),
  country: z.string().optional(),
  language: z.string().optional().default('en'),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = reverseQuerySchema.safeParse({
      lng: searchParams.get('lng') ?? undefined,
      lat: searchParams.get('lat') ?? undefined,
      country: searchParams.get('country') ?? undefined,
      language: searchParams.get('language') ?? undefined,
    });

    if (!parsed.success) {
      const errorMessage = parsed.error.issues.map((i) => i.message).join(', ');
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const place = await reverseGeocode(parsed.data);
    if (!place) {
      return NextResponse.json({ error: 'No address found for these coordinates' }, { status: 404 });
    }

    return NextResponse.json({ place });
  } catch (error) {
    console.error('Error in /api/search/reverse:', error);
    const message =
      error instanceof Error && error.message.includes('MAPBOX_SECRET_TOKEN')
        ? 'Mapbox secret token is not configured on the server'
        : 'Failed to reverse geocode location';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

