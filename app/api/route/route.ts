import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDirections, type RouteMode } from '@/lib/mapbox/directions';

function parseCoordinates(str: string): [number, number] | null {
  const parts = str.split(',').map((p) => Number(p.trim()));
  if (parts.length !== 2) return null;
  const [lng, lat] = parts;
  if (Number.isNaN(lng) || Number.isNaN(lat)) return null;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
  return [lng, lat];
}

const routeQuerySchema = z.object({
  origin: z
    .string()
    .min(1, 'origin is required')
    .refine((val) => parseCoordinates(val) !== null, {
      message: "origin must be 'lng,lat' with valid range (-180..180, -90..90)",
    }),
  destination: z
    .string()
    .min(1, 'destination is required')
    .refine((val) => parseCoordinates(val) !== null, {
      message: "destination must be 'lng,lat' with valid range (-180..180, -90..90)",
    }),
  mode: z.enum(['drive', 'walk', 'cycle']).default('drive'),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = routeQuerySchema.safeParse({
      origin: searchParams.get('origin') ?? undefined,
      destination: searchParams.get('destination') ?? undefined,
      mode: (searchParams.get('mode') as RouteMode) ?? undefined,
    });

    if (!parsed.success) {
      const errorMessage = parsed.error.issues.map((i) => i.message).join(', ');
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const origin = parseCoordinates(parsed.data.origin)!;
    const destination = parseCoordinates(parsed.data.destination)!;

    const route = await getDirections({
      origin,
      destination,
      mode: parsed.data.mode,
    });

    if (!route) {
      return NextResponse.json({ error: 'No route found between coordinates', route: null }, { status: 404 });
    }

    return NextResponse.json({ route });
  } catch (error) {
    console.error('Error in /api/route:', error);
    const message =
      error instanceof Error && error.message.includes('MAPBOX_SECRET_TOKEN')
        ? 'Mapbox secret token is not configured on the server'
        : 'Failed to calculate route';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
