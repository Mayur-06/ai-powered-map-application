'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useMapStore, type RouteMode } from '@/lib/store/mapStore';
import { Car, Footprints, Bike, Navigation, Loader2, X, AlertCircle } from 'lucide-react';

function formatDistance(metres: number): string {
  const km = metres / 1000;
  return `${km.toFixed(1)} km`;
}

function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) {
    return `${hours} hr`;
  }
  return `${hours} hr ${minutes} min`;
}

const MODES: { id: RouteMode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'drive', label: 'Drive', icon: Car },
  { id: 'walk', label: 'Walk', icon: Footprints },
  { id: 'cycle', label: 'Cycle', icon: Bike },
];

export default function DirectionsPanel() {
  const markers = useMapStore((state) => state.markers);
  const userLocation = useMapStore((state) => state.userLocation);
  const route = useMapStore((state) => state.route);
  const routeMode = useMapStore((state) => state.routeMode);
  const isNavigating = useMapStore((state) => state.isNavigating);
  const setRoute = useMapStore((state) => state.setRoute);
  const clearRoute = useMapStore((state) => state.clearRoute);
  const setRouteMode = useMapStore((state) => state.setRouteMode);
  const startNavigation = useMapStore((state) => state.startNavigation);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Latest marker is the destination
  const destinationMarker = markers.length > 0 ? markers[markers.length - 1] : null;

  // Track destination changes to reset route when a new pin is placed
  const destKey = destinationMarker
    ? `${destinationMarker.longitude.toFixed(5)},${destinationMarker.latitude.toFixed(5)}`
    : '';
  const prevDestKeyRef = useRef(destKey);

  useEffect(() => {
    if (prevDestKeyRef.current !== destKey) {
      prevDestKeyRef.current = destKey;
      clearRoute();
      setErrorMessage(null);
    }
  }, [destKey, clearRoute]);

  const handleFetchRoute = useCallback(
    async (modeToFetch: RouteMode) => {
      if (!destinationMarker) return;

      if (!userLocation || typeof userLocation.longitude !== 'number' || typeof userLocation.latitude !== 'number') {
        setErrorMessage('Please tap the locate button (top-right) to acquire your GPS position first.');
        return;
      }

      setIsLoading(true);
      setErrorMessage(null);

      try {
        const originParam = `${userLocation.longitude},${userLocation.latitude}`;
        const destParam = `${destinationMarker.longitude},${destinationMarker.latitude}`;

        const params = new URLSearchParams({
          origin: originParam,
          destination: destParam,
          mode: modeToFetch,
        });

        const res = await fetch(`/api/route?${params.toString()}`);
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.error || 'Failed to calculate route');
        }

        if (!data.route) {
          throw new Error('No route found between your location and this destination');
        }

        setRoute(data.route);
      } catch (err) {
        console.error('Routing error:', err);
        setErrorMessage(err instanceof Error ? err.message : 'Error fetching directions');
        clearRoute();
      } finally {
        setIsLoading(false);
      }
    },
    [destinationMarker, userLocation, setRoute, clearRoute]
  );

  const handleModeChange = useCallback(
    (newMode: RouteMode) => {
      setRouteMode(newMode);
      // Changing the mode re-requests the route if a route is currently shown or was fetched
      if (route) {
        handleFetchRoute(newMode);
      }
    },
    [route, setRouteMode, handleFetchRoute]
  );

  // Only render when a destination pin exists and not currently navigating
  if (!destinationMarker || isNavigating) {
    return null;
  }

  const destinationTitle = destinationMarker.title || 'Selected Destination';
  const hasGps = Boolean(
    userLocation && typeof userLocation.longitude === 'number' && typeof userLocation.latitude === 'number'
  );

  return (
    <div
      className="absolute bottom-6 left-4 right-4 sm:right-auto sm:w-84 sm:max-w-sm z-20 rounded-xl border border-border bg-background/95 p-4 shadow-xl backdrop-blur-md transition-all"
      style={{
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
      }}
    >
      {/* Header: Destination name and close/clear */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Destination
          </p>
          <h3 className="truncate text-sm font-semibold text-foreground" title={destinationTitle}>
            {destinationTitle}
          </h3>
        </div>
      </div>

      {/* GPS fix warning if user location is absent */}
      {!hasGps && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300 border border-amber-500/20">
          <Navigation className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <span>Tap the locate button in the top-right to set your GPS origin.</span>
        </div>
      )}

      {/* Mode switch (drive / walk / cycle) */}
      <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-muted/50 p-1">
        {MODES.map((m) => {
          const Icon = m.icon;
          const isActive = routeMode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              disabled={isLoading}
              onClick={() => handleModeChange(m.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                isActive
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
              }`}
              aria-label={`Switch to ${m.label} mode`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* Error state */}
      {errorMessage && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive border border-destructive/20">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="flex-1">{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="shrink-0 text-destructive/70 hover:text-destructive cursor-pointer"
            aria-label="Dismiss error"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Actions & Route Details */}
      <div className="mt-3">
        {route ? (
          <div className="space-y-3">
            {/* Route Stats: Distance and ETA */}
            <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 border border-border/50">
              <div>
                <span className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground block">
                  ETA
                </span>
                <span className="text-base font-bold text-foreground">
                  {formatDuration(route.duration)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground block">
                  Distance
                </span>
                <span className="text-base font-bold text-foreground">
                  {formatDistance(route.distance)}
                </span>
              </div>
            </div>

            {/* Route actions: Clear route and Start navigation */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  clearRoute();
                  setErrorMessage(null);
                }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                Clear route
              </button>
              <button
                type="button"
                onClick={() => startNavigation()}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs cursor-pointer"
              >
                <Navigation className="h-3.5 w-3.5" />
                <span>Start</span>
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            disabled={isLoading || !hasGps}
            onClick={() => handleFetchRoute(routeMode)}
            className={`w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-medium text-white transition-colors cursor-pointer ${
              isLoading || !hasGps
                ? 'bg-primary/50 cursor-not-allowed opacity-80'
                : 'bg-primary hover:bg-primary/90 shadow-xs'
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Finding route...</span>
              </>
            ) : (
              <>
                <Navigation className="h-4 w-4" />
                <span>Directions</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
