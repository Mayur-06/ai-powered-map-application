'use client';

import { useEffect, useRef, useMemo } from 'react';
import { Source, Layer, useMap } from 'react-map-gl/mapbox';
import bbox from '@turf/bbox';
import { useMapStore } from '@/lib/store/mapStore';
import type { RouteResult } from '@/lib/mapbox/directions';
import type { Feature, LineString } from 'geojson';

export default function RouteLayer() {
  const route = useMapStore((state) => state.route);
  const { current: map } = useMap();
  const lastFittedRouteRef = useRef<RouteResult | null>(null);

  useEffect(() => {
    if (!route || !route.geometry || !map) return;
    if (lastFittedRouteRef.current === route) return;
    lastFittedRouteRef.current = route;

    try {
      const geojsonLine: LineString = {
        type: 'LineString',
        coordinates: route.geometry.coordinates,
      };
      const [minLng, minLat, maxLng, maxLat] = bbox(geojsonLine);

      map.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        {
          padding: {
            top: 130, // Clear search bar and top style toggle
            bottom: 220, // Clear DirectionsPanel at the bottom
            left: 50,
            right: 70, // Clear top-right navigation/geolocate controls
          },
          duration: 1000,
          maxZoom: 16,
        }
      );
    } catch (err) {
      console.error('Failed to fit bounds to route:', err);
    }
  }, [route, map]);

  const geojsonData = useMemo<Feature<LineString> | null>(() => {
    if (!route || !route.geometry) return null;
    return {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: route.geometry.coordinates,
      },
    };
  }, [route]);

  if (!geojsonData) {
    return null;
  }

  return (
    <Source id="route-source" type="geojson" data={geojsonData}>
      <Layer
        id="route-casing"
        type="line"
        layout={{
          'line-join': 'round',
          'line-cap': 'round',
        }}
        paint={{
          'line-color': '#1d4ed8',
          'line-width': 8,
          'line-opacity': 0.6,
        }}
      />
      <Layer
        id="route-line"
        type="line"
        layout={{
          'line-join': 'round',
          'line-cap': 'round',
        }}
        paint={{
          'line-color': '#3b82f6',
          'line-width': 5,
          'line-opacity': 0.95,
        }}
      />
    </Source>
  );
}
