'use client';

import { useEffect, useState, useRef, useCallback, useSyncExternalStore } from 'react';
import { useMapStore } from '@/lib/store/mapStore';
import { getPoiDetails, type PoiDetails } from '@/lib/poi/actions';
import { getCategoryInfo } from '@/lib/categories';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
  Star,
  MapPin,
  Clock,
  Navigation,
  AlertCircle,
  RotateCw,
  Sparkles,
  MessageSquare,
} from 'lucide-react';

function subscribeDesktopQuery(callback: () => void) {
  const mql = window.matchMedia('(min-width: 640px)');
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getDesktopSnapshot(): boolean {
  return window.matchMedia('(min-width: 640px)').matches;
}

function getDesktopServerSnapshot(): boolean {
  return false;
}

export default function PoiSheet() {
  const selectedPoi = useMapStore((state) => state.selectedPoi);
  const setSelectedPoi = useMapStore((state) => state.setSelectedPoi);
  const setMarkers = useMapStore((state) => state.setMarkers);
  const isNavigating = useMapStore((state) => state.isNavigating);

  const isDesktop = useSyncExternalStore(
    subscribeDesktopQuery,
    getDesktopSnapshot,
    getDesktopServerSnapshot
  );

  const currentPoiId = selectedPoi?.id ?? null;
  const [trackedPoiId, setTrackedPoiId] = useState<string | null>(null);
  const [details, setDetails] = useState<PoiDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stale-response guard: ignore responses if selection changes quickly
  const activeIdRef = useRef<string | null>(null);

  // Reset state during render when selectedPoi changes
  if (currentPoiId !== trackedPoiId) {
    setTrackedPoiId(currentPoiId);
    setDetails(null);
    setError(null);
    setIsLoading(Boolean(currentPoiId));
  }

  const loadDetails = useCallback(async (poiId: string) => {
    activeIdRef.current = poiId;
    setIsLoading(true);
    setError(null);

    try {
      const res = await getPoiDetails(poiId);
      if (activeIdRef.current !== poiId) return;

      if (res.success) {
        setDetails(res.data);
        setError(null);
      } else {
        setError(res.error || 'Failed to load details');
        setDetails(null);
      }
    } catch (err) {
      if (activeIdRef.current !== poiId) return;
      const msg = err instanceof Error ? err.message : 'Failed to load details';
      setError(msg);
      setDetails(null);
    } finally {
      if (activeIdRef.current === poiId) {
        setIsLoading(false);
      }
    }
  }, []);

  const handleRetry = () => {
    if (!selectedPoi) return;
    loadDetails(selectedPoi.id);
  };

  // Trigger load when selected POI changes
  useEffect(() => {
    if (!selectedPoi) {
      activeIdRef.current = null;
      return;
    }

    const poiId = selectedPoi.id;
    activeIdRef.current = poiId;
    let isCancelled = false;

    getPoiDetails(poiId).then(
      (res) => {
        if (isCancelled || activeIdRef.current !== poiId) return;
        if (res.success) {
          setDetails(res.data);
          setError(null);
        } else {
          setError(res.error || 'Failed to load details');
          setDetails(null);
        }
        setIsLoading(false);
      },
      (err) => {
        if (isCancelled || activeIdRef.current !== poiId) return;
        const msg = err instanceof Error ? err.message : 'Failed to load details';
        setError(msg);
        setDetails(null);
        setIsLoading(false);
      }
    );

    return () => {
      isCancelled = true;
    };
  }, [selectedPoi]);


  if (isNavigating) {
    return null;
  }

  const isOpen = Boolean(selectedPoi);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSelectedPoi(null);
    }
  };

  const handleDirections = () => {
    if (!selectedPoi) return;

    // Set destination marker with same shape & replace-previous-pin behavior as search results
    setMarkers([
      {
        id: 'search-pin',
        longitude: selectedPoi.lng,
        latitude: selectedPoi.lat,
        title: selectedPoi.name,
      },
    ]);

    // Close the sheet so the existing DirectionsPanel flow takes over
    setSelectedPoi(null);
  };

  // Derive display values from details or initial selectedPoi
  const displayName = details?.name || selectedPoi?.name || 'Place Details';
  const categoryId = details?.category || selectedPoi?.category;
  const categoryInfo = categoryId ? getCategoryInfo(categoryId) : undefined;
  const ratingValue = details?.rating ?? selectedPoi?.rating;
  const addressText = details?.address?.trim() || null;

  // Opening hours: show hours.raw as plain text; omit if null
  let hoursText: string | null = null;
  if (details?.hours && typeof details.hours === 'object') {
    const rawVal = (details.hours as { raw?: unknown }).raw;
    if (typeof rawVal === 'string' && rawVal.trim().length > 0) {
      hoursText = rawVal.trim();
    }
  }

  const reviews = details?.reviews ?? [];
  const hasSampleReviews = reviews.some((r) => r.is_sample);

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent
        side={isDesktop ? 'right' : 'bottom'}
        className="max-h-[85vh] sm:max-h-full sm:max-w-md w-full flex flex-col p-0 gap-0 overflow-hidden rounded-t-2xl sm:rounded-none border-t sm:border-t-0 sm:border-l bg-background/95 backdrop-blur-md"
      >
        {/* Mobile drag handle for one-handed reach */}
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center">
          <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header Section */}
        <SheetHeader className="p-4 sm:p-5 pb-3 border-b border-border/50 space-y-3">
          <div className="pr-8">
            <SheetTitle className="text-lg sm:text-xl font-bold text-foreground leading-tight">
              {displayName}
            </SheetTitle>
            <SheetDescription className="sr-only">
              Details and reviews for {displayName}
            </SheetDescription>
          </div>

          {/* Chips row: Category and Rating */}
          <div className="flex flex-wrap items-center gap-2">
            {categoryInfo && (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border"
                style={{
                  backgroundColor: `${categoryInfo.color}18`,
                  borderColor: `${categoryInfo.color}45`,
                  color: categoryInfo.color,
                }}
              >
                <categoryInfo.icon className="h-3.5 w-3.5 shrink-0" />
                <span>{categoryInfo.label}</span>
              </span>
            )}

            {ratingValue != null && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300">
                <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                <span>{ratingValue.toFixed(1)}</span>
              </span>
            )}
          </div>

          {/* Address row (omit if null) */}
          {addressText && (
            <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground/80" />
              <span className="leading-snug">{addressText}</span>
            </div>
          )}

          {/* Opening hours row: hours.raw as plain text (omit if null) */}
          {hoursText && (
            <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground/80" />
              <span className="leading-snug">{hoursText}</span>
            </div>
          )}

          {/* Directions button */}
          <div className="pt-1">
            <Button
              type="button"
              onClick={handleDirections}
              className="w-full flex items-center justify-center gap-2 font-medium cursor-pointer shadow-sm"
              size="default"
            >
              <Navigation className="h-4 w-4" />
              <span>Directions</span>
            </Button>
          </div>
        </SheetHeader>

        {/* Empty container for Day 5 AI review insight card */}
        {/* Slot for Day 5 AI review insight card */}
        <div data-slot="insight" className="empty:hidden" />

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Loading Skeleton */}
          {isLoading && !details && (
            <div className="space-y-3" aria-busy="true" aria-label="Loading details">
              <div className="h-4 w-28 rounded bg-muted animate-pulse" />
              <div className="space-y-2.5">
                <div className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="h-3.5 w-24 rounded bg-muted animate-pulse" />
                    <div className="h-3.5 w-10 rounded bg-muted animate-pulse" />
                  </div>
                  <div className="h-3 w-full rounded bg-muted animate-pulse" />
                  <div className="h-3 w-4/5 rounded bg-muted animate-pulse" />
                </div>
                <div className="p-3 rounded-lg border border-border/50 bg-muted/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="h-3.5 w-20 rounded bg-muted animate-pulse" />
                    <div className="h-3.5 w-10 rounded bg-muted animate-pulse" />
                  </div>
                  <div className="h-3 w-full rounded bg-muted animate-pulse" />
                </div>
              </div>
            </div>
          )}

          {/* Error Message with Retry */}
          {error && !isLoading && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center space-y-2.5">
              <div className="flex items-center justify-center gap-1.5 text-destructive font-medium text-xs">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Unable to load reviews</span>
              </div>
              <p className="text-xs text-muted-foreground">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                className="gap-1.5 cursor-pointer mt-1"
              >
                <RotateCw className="h-3.5 w-3.5" />
                <span>Retry</span>
              </Button>
            </div>
          )}

          {/* Reviews Section */}
          {!isLoading && !error && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Reviews ({reviews.length})</span>
                </h4>
              </div>

              {/* Sample reviews demo notice if any review has is_sample = true */}
              {hasSampleReviews && (
                <div className="rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300 font-medium flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>Sample reviews (AI-generated demo data)</span>
                </div>
              )}

              {/* Reviews list or Empty state */}
              {reviews.length === 0 ? (
                <div className="rounded-lg border border-border/50 bg-muted/20 p-6 text-center">
                  <p className="text-xs text-muted-foreground">No reviews yet</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {reviews.map((review, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-border/60 bg-muted/25 p-3 space-y-1.5 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-xs text-foreground truncate">
                          {review.author || 'Anonymous'}
                        </span>
                        {review.rating != null && (
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 shrink-0">
                            <Star className="h-3 w-3 fill-current" />
                            <span>{review.rating}</span>
                          </span>
                        )}
                      </div>
                      {review.text && (
                        <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                          {review.text}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
