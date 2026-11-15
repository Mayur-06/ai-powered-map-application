import { tool } from 'ai';
import { z } from 'zod';
import distance from '@turf/distance';
import { createServerClient } from '@/lib/supabase/server';
import { getDirections, type RouteMode } from '@/lib/mapbox/directions';
import { INITIAL_VIEW_STATE } from '@/lib/store/mapStore';
import type { UserPrefs } from '@/lib/prefs';
import type { CategoryId } from '@/lib/categories';

export interface ToolContext {
  userLocation: { lng: number; lat: number } | null;
  bounds: { west: number; south: number; east: number; north: number } | null;
  prefs?: UserPrefs | null;
}

const CATEGORY_VALUES = [
  'cafe',
  'restaurant',
  'pharmacy',
  'bank_atm',
  'fuel',
  'park',
  'hospital',
  'shopping',
] as const;

const CATEGORY_INTEREST_LABELS: Record<string, string> = {
  cafe: 'cafes',
  restaurant: 'restaurants',
  pharmacy: 'pharmacies',
  bank_atm: 'banks and ATMs',
  fuel: 'fuel stations',
  park: 'parks',
  hospital: 'hospitals',
  shopping: 'shopping',
};

function parsePointGeom(geom: unknown): { lng: number; lat: number } | null {
  if (!geom) return null;
  if (typeof geom === 'object' && geom !== null && 'coordinates' in geom) {
    const coords = (geom as { coordinates: unknown }).coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (!Number.isNaN(lng) && !Number.isNaN(lat)) {
        return { lng, lat };
      }
    }
  }
  if (typeof geom === 'string') {
    try {
      const buf = Buffer.from(geom, 'hex');
      // EWKB with SRID (length >= 25, 0x20 flag at byte 4)
      if (buf.length >= 25 && (buf[4] & 0x20)) {
        return {
          lng: buf.readDoubleLE(9),
          lat: buf.readDoubleLE(17),
        };
      }
      if (buf.length >= 21) {
        return {
          lng: buf.readDoubleLE(5),
          lat: buf.readDoubleLE(13),
        };
      }
    } catch {
      return null;
    }
  }
  return null;
}

const searchPlacesInputSchema = z.object({
  category: z
    .enum(CATEGORY_VALUES)
    .optional()
    .describe('Filter places by category: cafe, restaurant, pharmacy, bank_atm, fuel, park, hospital, or shopping. Leave empty to search across all categories or for general recommendations.'),
  query: z
    .string()
    .max(60, 'Keyword query must be at most 60 characters')
    .optional()
    .describe('Optional keyword to filter places by name (case-insensitive substring match, max 60 characters)'),
  radiusM: z
    .number()
    .min(100)
    .max(10000)
    .default(3000)
    .optional()
    .describe('Search radius in meters around the center location (default 3000, maximum 10000)'),
});

const getRouteInputSchema = z.object({
  poiId: z
    .string()
    .uuid('Destination must be a valid POI UUID from searchPlaces')
    .describe('The unique UUID of the destination place, selected from searchPlaces results'),
  mode: z
    .enum(['drive', 'walk', 'cycle'])
    .optional()
    .describe('Travel mode: drive, walk, or cycle (optional; defaults to user preferred transport or drive)'),
});

const mapControlInputSchema = z.object({
  action: z
    .enum([
      'flyTo',
      'setStyle',
      'showOnlyCategory',
      'showAllCategories',
      'hideCategory',
      'showCategory',
    ])
    .describe(
      'Map control action to perform: "flyTo" to move camera, "setStyle" to switch map style, "showOnlyCategory" to show only one category and hide all others (e.g. "show only parks" -> showOnlyCategory), "showAllCategories" to show all categories, "hideCategory" to hide a category, or "showCategory" to show a specific category'
    ),
  lng: z
    .number()
    .min(-180)
    .max(180)
    .optional()
    .describe('Target longitude for flyTo (-180 to 180)'),
  lat: z
    .number()
    .min(-90)
    .max(90)
    .optional()
    .describe('Target latitude for flyTo (-90 to 90)'),
  zoom: z
    .number()
    .min(0)
    .max(22)
    .optional()
    .describe('Target zoom level for flyTo (0 to 22)'),
  style: z
    .enum(['light', 'dark'])
    .optional()
    .describe('Base map style for setStyle: "light" or "dark"'),
  category: z
    .enum(CATEGORY_VALUES)
    .optional()
    .describe('Category identifier for showOnlyCategory, hideCategory, or showCategory (e.g. "park", "hospital", "pharmacy")'),
});

const getUserContextInputSchema = z
  .object({})
  .describe('Retrieve the user current coordinates, active map bounds, and saved user preferences');

const summarizeReviewsInputSchema = z.object({
  poiId: z
    .string()
    .uuid('Destination must be a valid POI UUID from a searchPlaces result')
    .describe('The unique UUID of the place from a searchPlaces result to summarize reviews for'),
});

const poiSummarySchema = z.object({
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  bestFor: z.array(z.string()),
  vibe: z.string(),
  sentimentScore: z.number(),
});

type GetRouteInput = z.infer<typeof getRouteInputSchema>;

interface PoiRpcRow {
  id: string;
  name: string;
  category: string;
  lng: number;
  lat: number;
  rating: number | null;
}

export function createTools(context: ToolContext) {
  return {
    searchPlaces: tool({
      description:
        'Search for nearby places in Greater Noida by category and/or keyword within a given radius.',
      inputSchema: searchPlacesInputSchema,
      execute: async (input) => {
        try {
          let center: { lng: number; lat: number };
          let centerUsed: 'userLocation' | 'boundsCenter' | 'greaterNoidaDefault';

          if (context?.userLocation) {
            center = context.userLocation;
            centerUsed = 'userLocation';
          } else if (context?.bounds) {
            center = {
              lng: (context.bounds.west + context.bounds.east) / 2,
              lat: (context.bounds.south + context.bounds.north) / 2,
            };
            centerUsed = 'boundsCenter';
          } else {
            center = {
              lng: INITIAL_VIEW_STATE.longitude,
              lat: INITIAL_VIEW_STATE.latitude,
            };
            centerUsed = 'greaterNoidaDefault';
          }

          const radius = Math.min(Math.max(input.radiusM ?? 3000, 100), 10000);
          const supabase = createServerClient();

          const { data, error } = await supabase.rpc('nearby_pois', {
            p_lat: center.lat,
            p_lng: center.lng,
            p_radius_m: radius,
            p_category: input.category ?? null,
          });

          if (error) {
            return { error: `Database search failed: ${error.message}` };
          }

          let rows: PoiRpcRow[] = Array.isArray(data) ? data : [];

          if (input.query && input.query.trim().length > 0) {
            const q = input.query.trim().toLowerCase();
            rows = rows.filter(
              (r) => r.name && r.name.toLowerCase().includes(q)
            );
          }

          const preferredCategories = new Set(context?.prefs?.interests ?? []);
          const shouldBoostInterests = !input.category && preferredCategories.size > 0;

          const placesWithDistance = rows.map((r) => {
            const dist = distance([center.lng, center.lat], [r.lng, r.lat], {
              units: 'meters',
            });
            const distRounded = Math.round(dist);
            const isPreferred = preferredCategories.has(r.category as CategoryId);

            // Deterministic ranking rule:
            // If user preferences exist and no specific category filter was provided,
            // places matching the user's preferred interest categories are boosted for ordering
            // by treating them as 30% closer (score = dist * 0.7). Real distance (distanceM) is preserved.
            const score = shouldBoostInterests && isPreferred ? dist * 0.7 : dist;

            let reason: string | undefined;
            if (shouldBoostInterests && isPreferred) {
              const interestLabel = CATEGORY_INTEREST_LABELS[r.category] || r.category;
              reason = `Matches your interest in ${interestLabel}`;
            }

            return {
              id: r.id,
              name: r.name,
              category: r.category,
              rating: typeof r.rating === 'number' ? r.rating : null,
              distanceM: distRounded,
              score,
              lng: r.lng,
              lat: r.lat,
              ...(reason ? { reason } : {}),
            };
          });

          placesWithDistance.sort((a, b) => a.score - b.score);
          const places = placesWithDistance
            .slice(0, 8)
            .map((item) => ({
              id: item.id,
              name: item.name,
              category: item.category,
              rating: item.rating,
              distanceM: item.distanceM,
              lng: item.lng,
              lat: item.lat,
              ...(item.reason ? { reason: item.reason } : {}),
            }));

          if (places.length === 0) {
            return {
              places: [],
              centerUsed,
              note: 'No places found matching your criteria in this area.',
            };
          }

          return {
            places,
            centerUsed,
          };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Failed to search places';
          return { error: msg };
        }
      },
    }),

    getRoute: tool({
      description:
        'Get navigation route from the user current location to a place returned by searchPlaces.',
      inputSchema: getRouteInputSchema,
      execute: async (input: GetRouteInput) => {
        try {
          if (!context?.userLocation) {
            return { error: 'no_user_location' };
          }

          const supabase = createServerClient();
          const { data: poi, error: poiError } = await supabase
            .from('pois')
            .select('id, name, geom')
            .eq('id', input.poiId)
            .maybeSingle();

          if (poiError || !poi) {
            return { error: 'poi_not_found' };
          }

          const coords = parsePointGeom(poi.geom);
          if (!coords) {
            return { error: 'invalid_poi_location' };
          }

          const routeMode: RouteMode = input.mode ?? context?.prefs?.transport ?? 'drive';
          const route = await getDirections({
            origin: context.userLocation,
            destination: coords,
            mode: routeMode,
          });

          if (!route) {
            return { error: 'no_route_found' };
          }

          return {
            destination: {
              id: poi.id,
              name: poi.name,
              lng: coords.lng,
              lat: coords.lat,
            },
            distanceM: Math.round(route.distance),
            durationS: Math.round(route.duration),
            mode: routeMode,
            geometry: route.geometry,
            steps: route.steps,
          };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Failed to calculate route';
          return { error: msg };
        }
      },
      toModelOutput: ({ output }) => {
        if ('destination' in output && output.destination) {
          return {
            type: 'json',
            value: {
              destination: {
                id: output.destination.id,
                name: output.destination.name,
              },
              distanceM: output.distanceM,
              durationS: output.durationS,
              mode: output.mode,
            },
          };
        }
        return {
          type: 'json',
          value: {
            error: 'error' in output ? output.error : 'Route calculation failed',
          },
        };
      },
    }),

    mapControl: tool({
      description:
        'Control map camera (flyTo), map style (setStyle), or category POI visibility: showOnlyCategory (e.g. "show only parks"), showAllCategories, hideCategory, or showCategory.',
      inputSchema: mapControlInputSchema,
      execute: async (input) => {
        try {
          if (input.action === 'flyTo') {
            if (typeof input.lng !== 'number' || typeof input.lat !== 'number') {
              return { error: 'flyTo action requires valid lng and lat numbers' };
            }
            return {
              ok: true,
              action: 'flyTo' as const,
              lng: input.lng,
              lat: input.lat,
              ...(typeof input.zoom === 'number' ? { zoom: input.zoom } : {}),
            };
          }

          if (input.action === 'setStyle') {
            if (!input.style || (input.style !== 'light' && input.style !== 'dark')) {
              return { error: 'setStyle action requires style to be "light" or "dark"' };
            }
            return {
              ok: true,
              action: 'setStyle' as const,
              style: input.style,
            };
          }

          if (input.action === 'showOnlyCategory') {
            if (!input.category) {
              return { error: 'showOnlyCategory action requires a category' };
            }
            return {
              ok: true,
              action: 'showOnlyCategory' as const,
              category: input.category,
            };
          }

          if (input.action === 'showAllCategories') {
            return {
              ok: true,
              action: 'showAllCategories' as const,
            };
          }

          if (input.action === 'hideCategory') {
            if (!input.category) {
              return { error: 'hideCategory action requires a category' };
            }
            return {
              ok: true,
              action: 'hideCategory' as const,
              category: input.category,
            };
          }

          if (input.action === 'showCategory') {
            if (!input.category) {
              return { error: 'showCategory action requires a category' };
            }
            return {
              ok: true,
              action: 'showCategory' as const,
              category: input.category,
            };
          }

          return { error: `Unsupported mapControl action: ${(input as { action: string }).action}` };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Failed to execute mapControl';
          return { error: msg };
        }
      },
    }),

    getUserContext: tool({
      description:
        'Retrieve the user current coordinates, active map bounds, and saved user preferences.',
      inputSchema: getUserContextInputSchema,
      execute: async () => {
        try {
          return {
            userLocation: context?.userLocation ?? null,
            bounds: context?.bounds ?? null,
            preferences: context?.prefs ?? null,
          };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Failed to get user context';
          return { error: msg };
        }
      },
    }),

    summarizeReviews: tool({
      description:
        'Retrieve the stored review summary (pros, cons, bestFor, vibe, sentiment) for a place by its POI ID.',
      inputSchema: summarizeReviewsInputSchema,
      execute: async (input) => {
        try {
          const supabase = createServerClient();
          const { data, error } = await supabase
            .from('pois')
            .select('name, summary')
            .eq('id', input.poiId)
            .maybeSingle();

          if (error) {
            return { error: `Failed to fetch review summary: ${error.message}` };
          }

          if (!data) {
            return { error: 'Place not found' };
          }

          const summaryParsed = poiSummarySchema.safeParse(data.summary);
          if (!summaryParsed.success || !summaryParsed.data) {
            return {
              name: data.name,
              summary: null,
              note: 'No summary available yet',
            };
          }

          return {
            name: data.name,
            summary: summaryParsed.data,
          };
        } catch (err: unknown) {
          const msg =
            err instanceof Error ? err.message : 'Failed to retrieve review summary';
          return { error: msg };
        }
      },
    }),
  };
}
