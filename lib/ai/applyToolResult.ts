import { useMapStore, type MarkerItem, type RouteResult } from '@/lib/store/mapStore';
import { getMapInstance } from '@/lib/mapRegistry';

export interface CachedPlace {
  id: string;
  name: string;
  category: string;
  lng: number;
  lat: number;
  rating?: number | null;
  distanceM?: number;
}

interface SearchPlacesOutput {
  error?: string;
  places?: CachedPlace[];
  centerUsed?: string;
  note?: string;
}

interface GetRouteOutput {
  error?: string;
  destination?: {
    id?: string;
    name?: string;
    lng?: number;
    lat?: number;
  };
  distanceM?: number;
  durationS?: number;
  mode?: 'drive' | 'walk' | 'cycle';
  geometry?: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  steps?: RouteResult['steps'];
}

interface MapControlOutput {
  error?: string;
  action?:
    | 'flyTo'
    | 'setStyle'
    | 'showOnlyCategory'
    | 'showAllCategories'
    | 'hideCategory'
    | 'showCategory'
    | 'toggleCategory';
  lng?: number;
  lat?: number;
  zoom?: number;
  style?: 'light' | 'dark';
  category?: string;
}

const appliedToolCallIds = new Set<string>();
const recentPlacesCache = new Map<string, CachedPlace>();

export function isToolCallApplied(callId: string): boolean {
  return appliedToolCallIds.has(callId);
}

export function markToolCallApplied(callId: string): void {
  appliedToolCallIds.add(callId);
}

export function clearAppliedToolCalls(): void {
  appliedToolCallIds.clear();
}

export function getCachedPlace(id: string): CachedPlace | undefined {
  return recentPlacesCache.get(id);
}

export async function applyToolResult(toolName: string, output: unknown): Promise<void> {
  if (!output || typeof output !== 'object') {
    return;
  }

  const genericOutput = output as { error?: string };
  if (genericOutput.error) {
    // Tool execution returned an error - do not apply to map
    return;
  }

  switch (toolName) {
    case 'searchPlaces': {
      const out = output as SearchPlacesOutput;
      const places: CachedPlace[] = Array.isArray(out.places) ? out.places : [];

      if (places.length === 0) {
        // If no places, show nothing on the map
        useMapStore.getState().setMarkers([]);
        return;
      }

      // Cache returned places for subsequent route lookups or card interactions
      for (const p of places) {
        if (p.id) {
          recentPlacesCache.set(p.id, p);
        }
      }

      const markers: MarkerItem[] = places.map((p) => ({
        id: p.id,
        longitude: p.lng,
        latitude: p.lat,
        title: p.name,
        category: p.category,
      }));

      useMapStore.getState().setMarkers(markers);

      const map = getMapInstance();
      if (map) {
        if (markers.length === 1) {
          map.flyTo({
            center: [markers[0].longitude, markers[0].latitude],
            zoom: 15,
            duration: 1000,
            essential: true,
          });
        } else if (markers.length > 1) {
          const lngs = markers.map((m) => m.longitude);
          const lats = markers.map((m) => m.latitude);
          const minLng = Math.min(...lngs);
          const maxLng = Math.max(...lngs);
          const minLat = Math.min(...lats);
          const maxLat = Math.max(...lats);

          if (minLng === maxLng && minLat === maxLat) {
            map.flyTo({
              center: [minLng, minLat],
              zoom: 15,
              duration: 1000,
              essential: true,
            });
          } else {
            map.fitBounds(
              [
                [minLng, minLat],
                [maxLng, maxLat],
              ],
              {
                padding: { top: 70, bottom: 70, left: 70, right: 70 },
                maxZoom: 16,
                duration: 1000,
              }
            );
          }
        }
      } else {
        // Fallback to updating viewState if mapInstance not ready
        if (markers.length > 0) {
          useMapStore.getState().updateViewState({
            longitude: markers[0].longitude,
            latitude: markers[0].latitude,
            zoom: 14,
          });
        }
      }
      break;
    }

    case 'getRoute': {
      const out = output as GetRouteOutput;
      const mode = out.mode || 'drive';
      useMapStore.getState().setRouteMode(mode);

      // 1. Determine destination coordinates
      let destLng: number | undefined = out.destination?.lng;
      let destLat: number | undefined = out.destination?.lat;
      let destName: string = out.destination?.name || 'Destination';
      let destCategory: string | undefined = undefined;

      if ((destLng === undefined || destLat === undefined) && out.destination?.id) {
        const cached = recentPlacesCache.get(out.destination.id);
        if (cached) {
          destLng = cached.lng;
          destLat = cached.lat;
          destName = cached.name || destName;
          destCategory = cached.category;
        }
      }

      // 2. Check if full route was delivered in tool output
      if (out.geometry && Array.isArray(out.steps)) {
        const fullRoute: RouteResult = {
          distance: out.distanceM ?? 0,
          duration: out.durationS ?? 0,
          geometry: out.geometry,
          steps: out.steps,
          mode,
        };
        useMapStore.getState().setRoute(fullRoute);
      } else if (destLng !== undefined && destLat !== undefined) {
        // Compact version arrived - fetch full RouteResult through /api/route
        const userLoc = useMapStore.getState().userLocation;
        if (userLoc) {
          try {
            const originStr = `${userLoc.longitude},${userLoc.latitude}`;
            const destStr = `${destLng},${destLat}`;
            const res = await fetch(
              `/api/route?origin=${encodeURIComponent(originStr)}&destination=${encodeURIComponent(destStr)}&mode=${mode}`
            );
            if (res.ok) {
              const data = (await res.json()) as { route?: RouteResult };
              if (data.route) {
                useMapStore.getState().setRoute(data.route);
              }
            }
          } catch (err) {
            console.error('Failed to fetch full route in applyToolResult:', err);
          }
        }
      }

      // 3. Set destination marker on the map
      if (destLng !== undefined && destLat !== undefined) {
        useMapStore.getState().setMarkers([
          {
            id: out.destination?.id || 'route-destination',
            longitude: destLng,
            latitude: destLat,
            title: destName,
            category: destCategory,
          },
        ]);
      }
      break;
    }

    case 'mapControl': {
      const out = output as MapControlOutput;
      if (out.action === 'flyTo') {
        const map = getMapInstance();
        if (typeof out.lng === 'number' && typeof out.lat === 'number') {
          if (map) {
            map.flyTo({
              center: [out.lng, out.lat],
              zoom: typeof out.zoom === 'number' ? out.zoom : 14,
              duration: 1500,
              essential: true,
            });
          } else {
            useMapStore.getState().updateViewState({
              longitude: out.lng,
              latitude: out.lat,
              zoom: typeof out.zoom === 'number' ? out.zoom : 14,
            });
          }
        }
      } else if (out.action === 'setStyle') {
        const styleMode = out.style === 'dark' ? 'dark' : 'streets';
        useMapStore.getState().setMapStyle(styleMode);
      } else if (out.action === 'showOnlyCategory' && out.category) {
        useMapStore.getState().showOnlyCategory(out.category);
      } else if (out.action === 'showAllCategories') {
        useMapStore.getState().showAllCategories();
      } else if (out.action === 'hideCategory' && out.category) {
        const hidden = useMapStore.getState().hiddenCategories;
        if (!hidden.includes(out.category)) {
          useMapStore.getState().toggleCategory(out.category);
        }
      } else if (out.action === 'showCategory' && out.category) {
        const hidden = useMapStore.getState().hiddenCategories;
        if (hidden.includes(out.category)) {
          useMapStore.getState().toggleCategory(out.category);
        }
      } else if (out.action === 'toggleCategory' && out.category) {
        useMapStore.getState().toggleCategory(out.category);
      }
      break;
    }

    case 'getUserContext': {
      // Nothing visible
      break;
    }

    default:
      break;
  }
}
