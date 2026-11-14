'use client';

import { Star, MapPin } from 'lucide-react';
import { getCategoryInfo } from '@/lib/categories';
import { useMapStore } from '@/lib/store/mapStore';
import { getMapInstance } from '@/lib/mapRegistry';

export interface PlaceItem {
  id: string;
  name: string;
  category: string;
  rating?: number | null;
  distanceM?: number;
  lng: number;
  lat: number;
}

interface PlaceCardProps {
  place: PlaceItem;
}

function formatDistance(meters?: number): string {
  if (meters === undefined || meters === null) return '';
  if (meters < 1000) {
    return `${meters} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

export default function PlaceCard({ place }: PlaceCardProps) {
  const setSelectedPoi = useMapStore((state) => state.setSelectedPoi);
  const categoryInfo = getCategoryInfo(place.category);
  const IconComponent = categoryInfo?.icon || MapPin;

  const handleClick = () => {
    // 1. Select POI so PoiSheet opens
    setSelectedPoi({
      id: place.id,
      name: place.name,
      category: place.category,
      lng: place.lng,
      lat: place.lat,
      rating: place.rating,
    });

    // 2. Center map smoothly on the selected POI
    const map = getMapInstance();
    if (map) {
      map.flyTo({
        center: [place.lng, place.lat],
        zoom: 15,
        duration: 1000,
        essential: true,
      });
    }
  };

  return (
    <div
      onClick={handleClick}
      className="group flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-card p-2.5 transition-all hover:border-primary/50 hover:bg-muted/50 cursor-pointer shadow-xs"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-label={`Select ${place.name}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
          style={{
            backgroundColor: categoryInfo ? `${categoryInfo.color}15` : 'rgba(0,0,0,0.06)',
            color: categoryInfo?.color || 'currentColor',
          }}
        >
          <IconComponent className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
            {place.name}
          </p>
          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
            <span>{categoryInfo?.label || place.category}</span>
            {place.rating !== null && place.rating !== undefined && (
              <span className="flex items-center gap-0.5 text-amber-500 font-medium">
                <Star className="h-3 w-3 fill-current" />
                {Number(place.rating).toFixed(1)}
              </span>
            )}
          </div>
        </div>
      </div>

      {place.distanceM !== undefined && (
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground bg-muted/60 px-2 py-0.5 rounded">
          {formatDistance(place.distanceM)}
        </span>
      )}
    </div>
  );
}
