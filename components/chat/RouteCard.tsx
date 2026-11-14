'use client';

import { Navigation, Car, Footprints, Bike } from 'lucide-react';
import { useMapStore } from '@/lib/store/mapStore';
import { Button } from '@/components/ui/button';

interface RouteCardProps {
  destination: {
    id?: string;
    name: string;
    lng?: number;
    lat?: number;
  };
  distanceM?: number;
  durationS?: number;
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

export default function RouteCard({
  destination,
  distanceM,
  durationS,
  mode = 'drive',
}: RouteCardProps) {
  const startNavigation = useMapStore((state) => state.startNavigation);
  const isNavigating = useMapStore((state) => state.isNavigating);

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border/70 bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Route Destination
          </p>
          <h4 className="truncate text-sm font-semibold text-foreground mt-0.5">
            {destination.name}
          </h4>
        </div>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          {renderModeIcon(mode)}
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-border/50 pt-2 text-xs">
        <div>
          <span className="text-muted-foreground text-[11px]">Distance: </span>
          <span className="font-semibold text-foreground">{formatDistance(distanceM)}</span>
        </div>
        <span className="text-border">•</span>
        <div>
          <span className="text-muted-foreground text-[11px]">ETA: </span>
          <span className="font-semibold text-foreground">{formatDuration(durationS)}</span>
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
        className="w-full gap-1.5 font-medium cursor-pointer"
      >
        <Navigation className="h-3.5 w-3.5 fill-current" />
        <span>{isNavigating ? 'Navigating...' : 'Start Navigation'}</span>
      </Button>
    </div>
  );
}
