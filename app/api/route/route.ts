import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDirections, getMultiStopRoute, type RouteMode } from '@/lib/mapbox/directions';

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
    .optional()
    .refine((val) => val === undefined || parseCoordinates(val) !== null, {
      message: "origin must be 'lng,lat' with valid range (-180..180, -90..90)",
    }),
  destination: z
    .string()
    .optional()
    .refine((val) => val === undefined || parseCoordinates(val) !== null, {
      message: "destination must be 'lng,lat' with valid range (-180..180, -90..90)",
    }),
  waypoints: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        const parts = val.split(';');
        if (parts.length < 2 || parts.length > 6) return false;
        return parts.every((p) => parseCoordinates(p) !== null);
      },
      { message: 'waypoints must be 2 to 6 semicolon-separated lng,lat pairs' }
    ),
  mode: z.enum(['drive', 'walk', 'cycle']).default('drive'),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = routeQuerySchema.safeParse({
      origin: searchParams.get('origin') ?? undefined,
      destination: searchParams.get('destination') ?? undefined,
      waypoints: searchParams.get('waypoints') ?? undefined,
      mode: (searchParams.get('mode') as RouteMode) ?? undefined,
    });

    if (!parsed.success) {
      const errorMessage = parsed.error.issues.map((i) => i.message).join(', ');
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    if (parsed.data.waypoints) {
      const coords = parsed.data.waypoints
        .split(';')
        .map((p) => parseCoordinates(p)!)
        .filter(Boolean);

      const route = await getMultiStopRoute({
        waypoints: coords,
        mode: parsed.data.mode,
      });

      if (!route) {
        return NextResponse.json(
          { error: 'No route found for waypoints', route: null },
          { status: 404 }
        );
      }

      return NextResponse.json({ route });
    }

    if (parsed.data.origin && parsed.data.destination) {
      const origin = parseCoordinates(parsed.data.origin)!;
      const destination = parseCoordinates(parsed.data.destination)!;

      const route = await getDirections({
        origin,
        destination,
        mode: parsed.data.mode,
      });

      if (!route) {
        return NextResponse.json(
          { error: 'No route found between coordinates', route: null },
          { status: 404 }
        );
      }

      return NextResponse.json({ route });
    }

    return NextResponse.json(
      { error: 'Either waypoints or both origin and destination must be provided' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error in /api/route:', error);
    const message =
      error instanceof Error && error.message.includes('MAPBOX_SECRET_TOKEN')
        ? 'Mapbox secret token is not configured on the server'
        : 'Failed to calculate route';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
