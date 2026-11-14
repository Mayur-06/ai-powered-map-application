'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Source, Layer, useMap } from 'react-map-gl/mapbox';
import distance from '@turf/distance';
import type { FeatureCollection, Point } from 'geojson';
import type { MapMouseEvent } from 'mapbox-gl';
import { useMapStore } from '@/lib/store/mapStore';
import { CATEGORIES } from '@/lib/categories';
import { createBrowserClient } from '@/lib/supabase/client';

export default function PoiLayer() {
  const { current: map } = useMap();
  const pois = useMapStore((state) => state.pois);
  const setPois = useMapStore((state) => state.setPois);
  const hiddenCategories = useMapStore((state) => state.hiddenCategories);
  const selectedPoi = useMapStore((state) => state.selectedPoi);
  const mapStyle = useMapStore((state) => state.mapStyle);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const reqCounterRef = useRef(0);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch POIs in viewport using nearby_pois RPC
  const fetchNearbyPois = useCallback(async () => {
    if (!map) return;

    const zoom = map.getZoom();
    if (zoom < 10) {
      return;
    }

    const center = map.getCenter();
    const bounds = map.getBounds();
    const ne = bounds.getNorthEast();

    const dist = distance([center.lng, center.lat], [ne.lng, ne.lat], {
      units: 'meters',
    });
    const radiusM = Math.round(Math.min(15000, Math.max(500, dist)));

    const thisReq = ++reqCounterRef.current;

    try {
      const supabase = createBrowserClient();
      const { data, error } = await supabase.rpc('nearby_pois', {
        p_lat: center.lat,
        p_lng: center.lng,
        p_radius_m: radiusM,
        p_category: null,
      });

      if (thisReq !== reqCounterRef.current) return; // Ignore stale response

      if (error) {
        // Non-blocking quiet message
        setErrorMessage(error.message);
        return;
      }

      setErrorMessage(null);
      if (Array.isArray(data)) {
        setPois(
          data.map((item: {
            id: string;
            name: string;
            category: string;
            lng: number;
            lat: number;
            rating: number | null;
          }) => ({
            id: item.id,
            name: item.name,
            category: item.category,
            lng: item.lng,
            lat: item.lat,
            rating: item.rating != null ? Number(item.rating) : null,
          }))
        );
      }
    } catch (err: unknown) {
      if (thisReq !== reqCounterRef.current) return;
      const msg = err instanceof Error ? err.message : 'Failed to fetch places';
      setErrorMessage(msg);
    }
  }, [map, setPois]);

  // Debounced listener on moveend
  useEffect(() => {
    if (!map) return;

    const onMoveEnd = () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        fetchNearbyPois();
      }, 400);
    };

    map.on('moveend', onMoveEnd);

    // Initial fetch when map is loaded
    if (map.loaded()) {
      onMoveEnd();
    } else {
      map.once('load', onMoveEnd);
    }

    return () => {
      map.off('moveend', onMoveEnd);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [map, fetchNearbyPois]);

  // Click & hover interactions on clusters and unclustered POIs
  useEffect(() => {
    if (!map) return;

    const onClusterClick = (e: MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ['clusters', 'cluster-count'],
      });
      if (!features.length) return;
      const cluster = features[0];
      const clusterId = cluster.properties?.cluster_id;
      const point = cluster.geometry as Point;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const source = map.getSource('pois-source') as any;

      if (source && typeof source.getClusterExpansionZoom === 'function') {
        source.getClusterExpansionZoom(clusterId, (err: Error | null, zoom: number) => {
          if (err || zoom == null) return;
          map.easeTo({
            center: point.coordinates as [number, number],
            zoom,
            duration: 500,
          });
        });
      }
    };

    const onPoiClick = (e: MapMouseEvent) => {
      if (useMapStore.getState().isNavigating) return;
      const features = map.queryRenderedFeatures(e.point, {
        layers: ['unclustered-pois'],
      });
      if (!features.length) return;
      const poiFeature = features[0];
      const props = poiFeature.properties;
      if (!props) return;
      const coords = (poiFeature.geometry as Point).coordinates;

      useMapStore.getState().setSelectedPoi({
        id: String(props.id),
        name: String(props.name),
        category: String(props.category),
        lng: props.lng != null ? Number(props.lng) : coords[0],
        lat: props.lat != null ? Number(props.lat) : coords[1],
        rating: props.rating != null ? Number(props.rating) : null,
      });
    };

    const setPointer = () => {
      map.getCanvas().style.cursor = 'pointer';
    };

    const resetCursor = () => {
      map.getCanvas().style.cursor = '';
    };

    const bindInteractions = () => {
      map.on('click', 'clusters', onClusterClick);
      map.on('click', 'cluster-count', onClusterClick);
      map.on('click', 'unclustered-pois', onPoiClick);
      map.on('mouseenter', 'clusters', setPointer);
      map.on('mouseleave', 'clusters', resetCursor);
      map.on('mouseenter', 'cluster-count', setPointer);
      map.on('mouseleave', 'cluster-count', resetCursor);
      map.on('mouseenter', 'unclustered-pois', setPointer);
      map.on('mouseleave', 'unclustered-pois', resetCursor);
    };

    const unbindInteractions = () => {
      map.off('click', 'clusters', onClusterClick);
      map.off('click', 'cluster-count', onClusterClick);
      map.off('click', 'unclustered-pois', onPoiClick);
      map.off('mouseenter', 'clusters', setPointer);
      map.off('mouseleave', 'clusters', resetCursor);
      map.off('mouseenter', 'cluster-count', setPointer);
      map.off('mouseleave', 'cluster-count', resetCursor);
      map.off('mouseenter', 'unclustered-pois', setPointer);
      map.off('mouseleave', 'unclustered-pois', resetCursor);
      map.getCanvas().style.cursor = '';
    };

    bindInteractions();
    map.on('style.load', bindInteractions);

    return () => {
      unbindInteractions();
      map.off('style.load', bindInteractions);
    };
  }, [map, mapStyle]);

  // GeoJSON data filtered by hiddenCategories
  const geojsonData = useMemo<FeatureCollection<Point>>(() => {
    const visiblePois = pois.filter((poi) => !hiddenCategories.includes(poi.category));
    return {
      type: 'FeatureCollection',
      features: visiblePois.map((poi) => ({
        type: 'Feature',
        id: poi.id,
        properties: {
          id: poi.id,
          name: poi.name,
          category: poi.category,
          rating: poi.rating,
          lng: poi.lng,
          lat: poi.lat,
        },
        geometry: {
          type: 'Point',
          coordinates: [poi.lng, poi.lat],
        },
      })),
    };
  }, [pois, hiddenCategories]);

  // Category color match expression built from lib/categories.ts
  const categoryColorMatch = useMemo(() => {
    return [
      'match',
      ['get', 'category'],
      ...CATEGORIES.flatMap((c) => [c.id, c.color]),
      '#64748b', // fallback color
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any;
  }, []);

  const selectedId = selectedPoi?.id ?? '';

  return (
    <>
      <Source
        id="pois-source"
        type="geojson"
        data={geojsonData}
        cluster={true}
        clusterMaxZoom={14}
        clusterRadius={50}
      >
        {/* Layer 1: Cluster circles */}
        <Layer
          id="clusters"
          type="circle"
          filter={['has', 'point_count']}
          paint={{
            'circle-color': [
              'step',
              ['get', 'point_count'],
              '#3b82f6',
              10,
              '#6366f1',
              30,
              '#8b5cf6',
              100,
              '#ec4899',
            ],
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              18,
              10,
              22,
              30,
              28,
              100,
              34,
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.9,
          }}
        />

        {/* Layer 2: Cluster count label */}
        <Layer
          id="cluster-count"
          type="symbol"
          filter={['has', 'point_count']}
          layout={{
            'text-field': ['get', 'point_count_abbreviated'],
            'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
            'text-size': 12,
          }}
          paint={{
            'text-color': '#ffffff',
          }}
        />

        {/* Layer 3: Unclustered points */}
        <Layer
          id="unclustered-pois"
          type="circle"
          filter={['!', ['has', 'point_count']]}
          layout={{
            'circle-sort-key': [
              'case',
              ['==', ['get', 'id'], selectedId],
              1,
              0,
            ],
          }}
          paint={{
            'circle-color': categoryColorMatch,
            'circle-radius': [
              'case',
              ['==', ['get', 'id'], selectedId],
              12,
              7,
            ],
            'circle-stroke-width': [
              'case',
              ['==', ['get', 'id'], selectedId],
              3,
              1.5,
            ],
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.95,
          }}
        />
      </Source>

      {/* Non-blocking quiet message on fetch error */}
      {errorMessage && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 rounded-full border border-border/60 bg-background/90 px-3 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur-xs">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          <span className="truncate max-w-[260px]">Places: {errorMessage}</span>
        </div>
      )}
    </>
  );
}
