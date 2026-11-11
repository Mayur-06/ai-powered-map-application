'use client';

import { useState, useCallback } from 'react';
import Map, {
  NavigationControl,
  ScaleControl,
  GeolocateControl,
  type ViewStateChangeEvent,
  type GeolocateResultEvent,
  type GeolocateErrorEvent,
} from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useMapStore, MAPBOX_STYLES } from '@/lib/store/mapStore';
import { Sun, Moon, AlertCircle, X } from 'lucide-react';

export default function MapView() {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  const viewState = useMapStore((state) => state.viewState);
  const setViewState = useMapStore((state) => state.setViewState);
  const mapStyle = useMapStore((state) => state.mapStyle);
  const toggleMapStyle = useMapStore((state) => state.toggleMapStyle);
  const setUserLocation = useMapStore((state) => state.setUserLocation);

  const [locationError, setLocationError] = useState<string | null>(null);

  const handleMove = useCallback(
    (evt: ViewStateChangeEvent) => {
      setViewState(evt.viewState);
    },
    [setViewState]
  );

  const handleGeolocate = useCallback(
    (e: GeolocateResultEvent) => {
      setLocationError(null);
      setUserLocation({
        longitude: e.coords.longitude,
        latitude: e.coords.latitude,
        heading: e.coords.heading ?? null,
        accuracy: e.coords.accuracy ?? null,
      });
    },
    [setUserLocation]
  );

  const handleGeolocateError = useCallback((error: GeolocateErrorEvent) => {
    let message = 'Location permission denied or unavailable.';
    if (error.code === 1) {
      message = 'Location access was denied. Please allow location access in your browser settings.';
    } else if (error.code === 2) {
      message = 'Location is unavailable. Please check your network or GPS connection.';
    } else if (error.code === 3) {
      message = 'Location request timed out. Please try again.';
    } else if (error.message) {
      message = error.message;
    }
    setLocationError(message);
  }, []);

  if (!token) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted/40 p-6">
        <div className="max-w-md rounded-lg border border-destructive/40 bg-background p-6 text-center shadow-lg">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Mapbox Token Missing</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Please define <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">NEXT_PUBLIC_MAPBOX_TOKEN</code> in your environment or <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">.env.local</code> file to display the map.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {/* Light / Dark map style toggle */}
      <div className="absolute top-4 left-4 z-10">
        <button
          type="button"
          onClick={toggleMapStyle}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-md backdrop-blur-sm hover:bg-muted transition-colors cursor-pointer"
          aria-label="Toggle map style"
        >
          {mapStyle === 'streets' ? (
            <>
              <Moon className="h-3.5 w-3.5 text-foreground" />
              <span>Dark Mode</span>
            </>
          ) : (
            <>
              <Sun className="h-3.5 w-3.5 text-foreground" />
              <span>Light Mode</span>
            </>
          )}
        </button>
      </div>

      {/* Location error message */}
      {locationError && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex max-w-sm items-center gap-2 rounded-md bg-destructive/90 px-3 py-2 text-xs text-destructive-foreground shadow-md backdrop-blur-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{locationError}</span>
          <button
            type="button"
            onClick={() => setLocationError(null)}
            className="shrink-0 p-0.5 hover:opacity-80 cursor-pointer"
            aria-label="Dismiss error"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <Map
        {...viewState}
        onMove={handleMove}
        mapboxAccessToken={token}
        mapStyle={MAPBOX_STYLES[mapStyle]}
        style={{ width: '100%', height: '100%' }}
      >
        <NavigationControl position="top-right" />
        <GeolocateControl
          position="top-right"
          trackUserLocation
          showUserHeading
          onGeolocate={handleGeolocate}
          onError={handleGeolocateError}
        />
        <ScaleControl position="bottom-left" />
      </Map>
    </div>
  );
}
