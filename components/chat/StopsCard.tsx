'use client';

import { Navigation, Car, Footprints, Bike } from 'lucide-react';
import { useMapStore } from '@/lib/store/mapStore';
import { Button } from '@/components/ui/button';
import { getCachedPlace } from '@/lib/ai/applyToolResult';

export interface StopItem {
  order: number;
  id: string;
  name: string;
  lng?: number;
  lat?: number;
}

interface StopsCardProps {
  orderedStops: StopItem[];
  totalDistanceM?: number;
  totalDurationS?: number;
  mode?: string;
}

function formatDistance(meters?: number): string {
  if (meters === undefined || meters === null) return '--';
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds?: number): string {
  if (seconds === undefined || seconds === null) return '--';
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

function renderModeIcon(mode?: string) {
  switch (mode) {
    case 'walk':
      return <Footprints className="h-4 w-4" />;
    case 'cycle':
      return <Bike className="h-4 w-4" />;
    case 'drive':
    default:
      return <Car className="h-4 w-4" />;
  }
}

export default function StopsCard({
  orderedStops,
  totalDistanceM,
  totalDurationS,
  mode = 'drive',
}: StopsCardProps) {
  const startNavigation = useMapStore((state) => state.startNavigation);
  const isNavigating = useMapStore((state) => state.isNavigating);
  const setSelectedPoi = useMapStore((state) => state.setSelectedPoi);

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border/70 bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Optimized Multi-Stop Route
          </p>
          <h4 className="truncate text-sm font-semibold text-foreground mt-0.5">
            {orderedStops.length} stops planned
          </h4>
        </div>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          {renderModeIcon(mode)}
        </div>
      </div>

      {/* Ordered Stop List */}
      <div className="flex flex-col gap-1.5 py-1">
        {orderedStops.map((stop) => (
          <div
            key={stop.id || stop.order}
            onClick={() => {
              const cached = getCachedPlace(stop.id);
              const lng = stop.lng ?? cached?.lng;
              const lat = stop.lat ?? cached?.lat;
              if (lng !== undefined && lat !== undefined) {
                setSelectedPoi({
                  id: stop.id,
                  name: stop.name,
                  category: cached?.category || 'other',
                  lng,
                  lat,
                });
              }
            }}
            className="flex min-h-[36px] items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs text-foreground hover:bg-muted/70 transition-colors cursor-pointer"
          >
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground shadow-xs">
              {stop.order}
            </div>
            <span className="truncate font-medium">{stop.name}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 border-t border-border/50 pt-2 text-xs">
        <div>
          <span className="text-muted-foreground text-[11px]">Total Distance: </span>
          <span className="font-semibold text-foreground">{formatDistance(totalDistanceM)}</span>
        </div>
        <span className="text-border">•</span>
        <div>
          <span className="text-muted-foreground text-[11px]">Total ETA: </span>
          <span className="font-semibold text-foreground">{formatDuration(totalDurationS)}</span>
        </div>
        <span className="text-border">•</span>
        <div className="capitalize text-muted-foreground text-[11px]">
          {mode}
        </div>
      </div>

      <Button
        type="button"
        size="sm"
        onClick={() => startNavigation()}
        disabled={isNavigating}
        className="w-full min-h-[40px] gap-1.5 font-medium cursor-pointer"
        aria-label="Start multi-stop navigation"
      >
        <Navigation className="h-4 w-4" />
        {isNavigating ? 'Navigating...' : 'Start Navigation'}
      </Button>
    </div>
  );
}
