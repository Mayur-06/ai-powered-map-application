'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Map, {
  Marker,
  Popup,
  NavigationControl,
  ScaleControl,
  GeolocateControl,
  type MapRef,
  type MapMouseEvent,
  type MapTouchEvent,
  type ViewStateChangeEvent,
  type GeolocateResultEvent,
  type GeolocateErrorEvent,
} from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useMapStore, MAPBOX_STYLES } from '@/lib/store/mapStore';
import SearchBar from '@/components/map/SearchBar';
import RouteLayer from '@/components/map/RouteLayer';
import PoiLayer from '@/components/map/PoiLayer';
import Legend from '@/components/map/Legend';
import DirectionsPanel from '@/components/map/DirectionsPanel';
import NavPanel from '@/components/map/NavPanel';
import PoiSheet from '@/components/map/PoiSheet';
import { usePosition } from '@/lib/store/usePosition';
import type { PlaceResult } from '@/lib/mapbox/search';
import { Sun, Moon, AlertCircle, X, MapPin, Loader2, Navigation } from 'lucide-react';

export default function MapView() {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  const mapRef = useRef<MapRef>(null);
  const viewState = useMapStore((state) => state.viewState);
  const setViewState = useMapStore((state) => state.setViewState);
  const markers = useMapStore((state) => state.markers);
  const mapStyle = useMapStore((state) => state.mapStyle);
  const toggleMapStyle = useMapStore((state) => state.toggleMapStyle);
  const setUserLocation = useMapStore((state) => state.setUserLocation);
  const isNavigating = useMapStore((state) => state.isNavigating);

  const { position: currentPosition, isSimulating } = usePosition();

  // Ease camera to follow simulated position (no rotation, no tilt)
  useEffect(() => {
    if (isSimulating && currentPosition && mapRef.current) {
      mapRef.current.easeTo({
        center: [currentPosition.lng, currentPosition.lat],
        duration: 300,
        essential: false,
      });
    }
  }, [isSimulating, currentPosition]);

  const [locationError, setLocationError] = useState<string | null>(null);
  const [reversePopup, setReversePopup] = useState<{
    longitude: number;
    latitude: number;
    name: string;
    address: string;
  } | null>(null);
  const [searchBarText, setSearchBarText] = useState<string | undefined>(undefined);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);

  // Long-press detection references
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pressStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isInteractingRef = useRef<boolean>(false);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pressStartPosRef.current = null;
  }, []);

  const handleFlyTo = useCallback((lng: number, lat: number) => {
    mapRef.current?.flyTo({
      center: [lng, lat],
      zoom: 14,
      duration: 1500,
      essential: true,
    });
  }, []);

  const handleReverseGeocode = useCallback(async (lng: number, lat: number) => {
    setIsReverseGeocoding(true);
    try {
      const params = new URLSearchParams({
        lng: lng.toString(),
        lat: lat.toString(),
        language: 'en',
      });

      const res = await fetch(`/api/search/reverse?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to reverse geocode location');
      }

      const data = await res.json();
      const place: PlaceResult | undefined = data.place;

      if (place) {
        // Set single pin in mapStore (replacing previous pin)
        useMapStore.getState().setMarkers([
          {
            id: 'search-pin',
            longitude: place.lng,
            latitude: place.lat,
            title: place.name || place.address,
          },
        ]);

        // Show popup at coordinates
        setReversePopup({
          longitude: place.lng,
          latitude: place.lat,
          name: place.name || 'Selected Location',
          address: place.address || `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`,
        });

        // Also update search bar text
        setSearchBarText(place.address || place.name);
      }
    } catch (err) {
      console.error('Reverse geocode error:', err);
    } finally {
      setIsReverseGeocoding(false);
    }
  }, []);

  // Map mouse & touch handlers for long-press
  const handleMouseDown = useCallback(
    (e: MapMouseEvent) => {
      if (e.originalEvent.button !== 0) return;
      clearLongPress();
      pressStartPosRef.current = { x: e.point.x, y: e.point.y };

      const { lng, lat } = e.lngLat;
      longPressTimerRef.current = setTimeout(() => {
        if (!isInteractingRef.current) {
          handleReverseGeocode(lng, lat);
        }
        clearLongPress();
      }, 600);
    },
    [clearLongPress, handleReverseGeocode]
  );

  const handleTouchStart = useCallback(
    (e: MapTouchEvent) => {
      if (e.points && e.points.length > 1) {
        clearLongPress();
        return;
      }
      clearLongPress();
      pressStartPosRef.current = { x: e.point.x, y: e.point.y };

      const { lng, lat } = e.lngLat;
      longPressTimerRef.current = setTimeout(() => {
        if (!isInteractingRef.current) {
          handleReverseGeocode(lng, lat);
        }
        clearLongPress();
      }, 600);
    },
    [clearLongPress, handleReverseGeocode]
  );

  const handleMouseMove = useCallback(
    (e: MapMouseEvent) => {
      if (pressStartPosRef.current) {
        const dist = Math.hypot(
          e.point.x - pressStartPosRef.current.x,
          e.point.y - pressStartPosRef.current.y
        );
        if (dist > 6) {
          clearLongPress();
        }
      }
    },
    [clearLongPress]
  );

  const handleTouchMove = useCallback(
    (e: MapTouchEvent) => {
      if (pressStartPosRef.current) {
        const dist = Math.hypot(
          e.point.x - pressStartPosRef.current.x,
          e.point.y - pressStartPosRef.current.y
        );
        if (dist > 8) {
          clearLongPress();
        }
      }
    },
    [clearLongPress]
  );

  const handleMouseUp = useCallback(() => {
    clearLongPress();
  }, [clearLongPress]);

  const handleTouchEnd = useCallback(() => {
    clearLongPress();
  }, [clearLongPress]);

  const handleInteractionStart = useCallback(() => {
    isInteractingRef.current = true;
    clearLongPress();
  }, [clearLongPress]);

  const handleInteractionEnd = useCallback(() => {
    isInteractingRef.current = false;
    clearLongPress();
  }, [clearLongPress]);

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
      <div
        className="flex h-screen w-screen items-center justify-center bg-muted/40 p-6"
        style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
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
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}
    >
      {/* Light / Dark map style toggle (top-left) */}
      <div
        className="absolute top-4 left-4 z-10"
        style={{ position: 'absolute', top: '16px', left: '16px', zIndex: 10 }}
      >
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

      {/* Search Bar - positioned to never overlap controls on mobile (375px) or desktop */}
      <div
        className="absolute top-16 left-4 w-[calc(100vw-72px)] max-w-sm sm:top-4 sm:left-40 sm:w-80 z-20"
        style={{
          position: 'absolute',
          top: '64px',
          left: '16px',
          width: 'min(384px, calc(100vw - 72px))',
          zIndex: 20,
        }}
      >
        <SearchBar
          value={searchBarText}
          onChange={setSearchBarText}
          onFlyTo={handleFlyTo}
        />
      </div>

      {/* Reverse geocoding loading badge */}
      {isReverseGeocoding && (
        <div className="absolute top-28 left-4 sm:top-16 sm:left-40 z-20 inline-flex items-center gap-1.5 rounded-full border border-border bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-md backdrop-blur-sm">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          <span>Finding address...</span>
        </div>
      )}

      {/* Location error message */}
      {locationError && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex max-w-sm items-center gap-2 rounded-md bg-destructive/90 px-3 py-2 text-xs text-destructive-foreground shadow-md backdrop-blur-sm"
          style={{
            position: 'absolute',
            top: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            maxWidth: '384px',
            borderRadius: '6px',
            backgroundColor: '#ef4444',
            color: '#ffffff',
            padding: '8px 12px',
            fontSize: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          <AlertCircle className="h-4 w-4 shrink-0" style={{ width: '16px', height: '16px', flexShrink: 0 }} />
          <span className="flex-1">{locationError}</span>
          <button
            type="button"
            onClick={() => setLocationError(null)}
            className="shrink-0 p-0.5 hover:opacity-80 cursor-pointer"
            aria-label="Dismiss error"
          >
            <X className="h-3.5 w-3.5" style={{ width: '14px', height: '14px' }} />
          </button>
        </div>
      )}

      <Map
        ref={mapRef}
        {...viewState}
        onMove={handleMove}
        onMoveStart={handleInteractionStart}
        onMoveEnd={handleInteractionEnd}
        onDragStart={handleInteractionStart}
        onDragEnd={handleInteractionEnd}
        onZoomStart={handleInteractionStart}
        onZoomEnd={handleInteractionEnd}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onTouchMove={handleTouchMove}
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

        {/* Render markers from mapStore using react-map-gl Marker */}
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            longitude={marker.longitude}
            latitude={marker.latitude}
            anchor="bottom"
          >
            <div className="flex flex-col items-center cursor-pointer group">
              <div className="relative flex items-center justify-center">
                <MapPin className="h-8 w-8 text-red-600 fill-red-500 drop-shadow-md transition-transform group-hover:scale-110" />
                <span className="absolute top-2 h-2 w-2 rounded-full bg-white shadow-xs" />
              </div>
              {marker.title && (
                <span className="mt-0.5 rounded border border-border bg-background/95 px-2 py-0.5 text-[11px] font-medium text-foreground shadow-sm backdrop-blur-xs whitespace-nowrap max-w-[180px] truncate">
                  {marker.title}
                </span>
              )}
            </div>
          </Marker>
        ))}

        {/* Reverse geocoding popup */}
        {reversePopup && (
          <Popup
            longitude={reversePopup.longitude}
            latitude={reversePopup.latitude}
            anchor="bottom"
            offset={36}
            onClose={() => setReversePopup(null)}
            closeOnClick={false}
            closeButton={true}
          >
            <div className="p-1 max-w-[220px] text-foreground">
              <p className="font-semibold text-xs truncate">
                {reversePopup.name}
              </p>
              {reversePopup.address && (
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                  {reversePopup.address}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground/70 mt-1 font-mono">
                {reversePopup.latitude.toFixed(5)}, {reversePopup.longitude.toFixed(5)}
              </p>
            </div>
          </Popup>
        )}
        {/* POI clustered layer */}
        <PoiLayer />

        {/* Route layer */}
        <RouteLayer />

        {/* Distinct marker for simulated position */}
        {isSimulating && currentPosition && (
          <Marker
            longitude={currentPosition.lng}
            latitude={currentPosition.lat}
            anchor="center"
          >
            <div className="relative flex items-center justify-center">
              <span className="absolute h-8 w-8 animate-ping rounded-full bg-cyan-400 opacity-60" />
              <div className="relative flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500 text-white shadow-md border-2 border-white dark:border-slate-900">
                <Navigation className="h-3.5 w-3.5 fill-current" />
              </div>
            </div>
          </Marker>
        )}
      </Map>

      {/* Category legend */}
      <Legend />

      {/* Navigation panel or Directions panel */}
      {isNavigating ? <NavPanel /> : <DirectionsPanel />}

      {/* POI detail sheet */}
      <PoiSheet />
    </div>
  );
}
