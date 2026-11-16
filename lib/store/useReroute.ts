'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useMapStore, type RouteResult } from './mapStore';
import { usePosition } from './usePosition';
import {
  checkOffRoute,
  canTriggerReroute,
  shouldTrafficReroute,
  getRemainingWaypoints,
  type OffRouteDetectorState,
  type RerouteTripState,
} from '@/lib/mapbox/reroute';
import { getNavigationProgress } from '@/lib/mapbox/navigation';

export interface UseRerouteReturn {
  isRerouting: boolean;
  rerouteCount: number;
}

export function useReroute(): UseRerouteReturn {
  const isNavigating = useMapStore((state) => state.isNavigating);
  const route = useMapStore((state) => state.route);
  const routeMode = useMapStore((state) => state.routeMode);
  const userLocation = useMapStore((state) => state.userLocation);
  const setRoute = useMapStore((state) => state.setRoute);
  const addNotice = useMapStore((state) => state.addNotice);

  const { position, source } = usePosition();

  const [rawIsRerouting, setRawIsRerouting] = useState(false);
  const isRerouting = isNavigating && rawIsRerouting;
  const isReroutingRef = useRef(false);
  const [rerouteCount, setRerouteCount] = useState(0);

  const detectorStateRef = useRef<OffRouteDetectorState>({ consecutiveOffRouteCount: 0 });
  const tripStateRef = useRef<RerouteTripState>({ rerouteCount: 0, lastRerouteTimeMs: null });
  const requestIdRef = useRef(0);

  // Keep latest position in ref updated via effect
  const positionRef = useRef(position);
  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  // Reset trip state when navigation begins or stops
  const prevIsNavigatingRef = useRef(false);
  useEffect(() => {
    if (isNavigating && !prevIsNavigatingRef.current) {
      detectorStateRef.current = { consecutiveOffRouteCount: 0 };
      tripStateRef.current = { rerouteCount: 0, lastRerouteTimeMs: null };
    }
    if (!isNavigating) {
      // Invalidate any in-flight reroute request immediately so late responses are ignored
      requestIdRef.current++;
      isReroutingRef.current = false;
    }
    prevIsNavigatingRef.current = isNavigating;
  }, [isNavigating]);

  const executeReroute = useCallback(
    async (triggerReason: 'off-route' | 'traffic') => {
      if (isReroutingRef.current) return;

      const currentPos = positionRef.current;
      const currentRoute = useMapStore.getState().route;
      const currentRouteMode = useMapStore.getState().routeMode;
      const currentMarkers = useMapStore.getState().markers;

      if (!currentPos || !currentRoute?.geometry) return;

      const reqId = ++requestIdRef.current;
      isReroutingRef.current = true;
      setRawIsRerouting(true);

      if (triggerReason === 'off-route') {
        addNotice('Rerouting: you left the route');
      }

      try {
        let url: string;

        if (currentMarkers.length > 1) {
          const stopCoords = currentMarkers.map((m) => ({
            lng: m.longitude,
            lat: m.latitude,
          }));
          const remaining = getRemainingWaypoints(
            currentRoute.geometry,
            currentPos,
            stopCoords
          );

          if (remaining.length > 1) {
            // Multi-stop waypoint route
            const waypointsStr = [
              `${currentPos.lng},${currentPos.lat}`,
              ...remaining.map((s) => `${s.lng},${s.lat}`),
            ].join(';');
            url = `/api/route?waypoints=${encodeURIComponent(waypointsStr)}&mode=${currentRouteMode}`;
          } else if (remaining.length === 1) {
            url = `/api/route?origin=${currentPos.lng},${currentPos.lat}&destination=${remaining[0].lng},${remaining[0].lat}&mode=${currentRouteMode}`;
          } else {
            const lastCoord =
              currentRoute.geometry.coordinates[currentRoute.geometry.coordinates.length - 1];
            url = `/api/route?origin=${currentPos.lng},${currentPos.lat}&destination=${lastCoord[0]},${lastCoord[1]}&mode=${currentRouteMode}`;
          }
        } else {
          // Single destination route
          const destLng =
            currentMarkers[0]?.longitude ??
            currentRoute.geometry.coordinates[currentRoute.geometry.coordinates.length - 1][0];
          const destLat =
            currentMarkers[0]?.latitude ??
            currentRoute.geometry.coordinates[currentRoute.geometry.coordinates.length - 1][1];
          url = `/api/route?origin=${currentPos.lng},${currentPos.lat}&destination=${destLng},${destLat}&mode=${currentRouteMode}`;
        }

        const res = await fetch(url);
        if (requestIdRef.current !== reqId) return; // Stale response ignored

        if (!res.ok) {
          if (triggerReason === 'off-route') {
            addNotice('Could not find a new route');
          }
          tripStateRef.current.lastRerouteTimeMs = Date.now();
          return;
        }

        const data = await res.json();
        if (requestIdRef.current !== reqId) return;

        if (!data?.route) {
          if (triggerReason === 'off-route') {
            addNotice('Could not find a new route');
          }
          tripStateRef.current.lastRerouteTimeMs = Date.now();
          return;
        }

        const newRoute: RouteResult = data.route;

        if (triggerReason === 'traffic') {
          // Calculate remaining duration on current route
          const navProgress = getNavigationProgress(currentRoute, currentPos);
          const currentRemainingDurationS = navProgress.remainingDurationS;

          const improves = shouldTrafficReroute(
            currentRemainingDurationS,
            newRoute.duration,
            currentRoute.geometry,
            newRoute.geometry
          );

          if (!improves) {
            // Not significant improvement, keep current route
            return;
          }

          const savedMinutes = Math.max(1, Math.round((currentRemainingDurationS - newRoute.duration) / 60));
          addNotice(`Switched route: saves ${savedMinutes} min`);
        }

        // If navigation ended during request, do not apply late route
        if (requestIdRef.current !== reqId || !useMapStore.getState().isNavigating) {
          return;
        }

        // Apply new route
        tripStateRef.current.rerouteCount++;
        tripStateRef.current.lastRerouteTimeMs = Date.now();
        setRerouteCount(tripStateRef.current.rerouteCount);
        detectorStateRef.current = { consecutiveOffRouteCount: 0 };

        // Calling setRoute updates the route in mapStore
        setRoute(newRoute);
      } catch {
        if (requestIdRef.current === reqId) {
          if (triggerReason === 'off-route') {
            addNotice('Could not find a new route');
          }
          tripStateRef.current.lastRerouteTimeMs = Date.now();
        }
      } finally {
        if (requestIdRef.current === reqId) {
          isReroutingRef.current = false;
          setRawIsRerouting(false);
        }
      }
    },
    [addNotice, setRoute]
  );

  // Position listener: run off-route detection on each fix while navigating
  useEffect(() => {
    if (!isNavigating || !route?.geometry || !position) return;
    if (isReroutingRef.current) return;

    const accuracy = source === 'gps' ? userLocation?.accuracy : undefined;
    const check = checkOffRoute(
      { lng: position.lng, lat: position.lat, accuracy },
      route.geometry,
      detectorStateRef.current
    );

    detectorStateRef.current = check.nextState;

    if (check.triggered) {
      const allowedCheck = canTriggerReroute(tripStateRef.current, Date.now());
      if (allowedCheck.allowed) {
        executeReroute('off-route');
      }
    }
  }, [position, isNavigating, route?.geometry, source, userLocation?.accuracy, executeReroute]);

  // Periodic traffic check: while navigating in drive mode, every 60 s check for a faster route
  useEffect(() => {
    if (!isNavigating || routeMode !== 'drive') return;

    const intervalId = setInterval(() => {
      if (isReroutingRef.current) return;
      executeReroute('traffic');
    }, 60000);

    return () => clearInterval(intervalId);
  }, [isNavigating, routeMode, executeReroute]);

  return {
    isRerouting,
    rerouteCount,
  };
}
