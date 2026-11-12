'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';
import { useMapStore } from '@/lib/store/mapStore';
import type { SuggestionItem, PlaceResult } from '@/lib/mapbox/search';
import { MapPin, Loader2, X } from 'lucide-react';

interface SearchBarProps {
  value?: string;
  onChange?: (val: string) => void;
  onFlyTo?: (lng: number, lat: number) => void;
  className?: string;
}

export default function SearchBar({
  value: controlledValue,
  onChange: setControlledValue,
  onFlyTo,
  className = '',
}: SearchBarProps) {
  const [internalQuery, setInternalQuery] = useState('');
  const query = controlledValue !== undefined ? controlledValue : internalQuery;

  const setQuery = useCallback(
    (val: string) => {
      if (setControlledValue) {
        setControlledValue(val);
      } else {
        setInternalQuery(val);
      }
    },
    [setControlledValue]
  );

  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const sessionTokenRef = useRef<string>('');
  const skipNextSearchRef = useRef<boolean>(false);

  // Initialize or get session token
  const getSessionToken = useCallback((): string => {
    if (!sessionTokenRef.current) {
      sessionTokenRef.current =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }
    return sessionTokenRef.current;
  }, []);

  // Reset session token after retrieve
  const resetSessionToken = useCallback(() => {
    sessionTokenRef.current =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }, []);

  // Debounce input by 300 ms (written directly without external libraries)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  // Fetch suggestions when debouncedQuery changes
  useEffect(() => {
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }

    const trimmed = debouncedQuery.trim();
    if (trimmed.length < 2) {
      return;
    }

    let isCancelled = false;

    const fetchSuggestions = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const store = useMapStore.getState();
        const userLoc = store.userLocation;
        const view = store.viewState;
        const proximity = userLoc
          ? `${userLoc.longitude},${userLoc.latitude}`
          : `${view.longitude},${view.latitude}`;

        const token = getSessionToken();
        const params = new URLSearchParams({
          q: trimmed,
          session_token: token,
          proximity,
          country: 'in',
          language: 'en',
          limit: '8',
        });

        const res = await fetch(`/api/search/suggest?${params.toString()}`);
        if (isCancelled) return;

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to fetch suggestions');
        }

        const data = await res.json();
        if (!isCancelled) {
          setSuggestions(data.suggestions || []);
          setIsOpen(true);
        }
      } catch (err) {
        if (!isCancelled) {
          console.error('Suggest error:', err);
          setError(err instanceof Error ? err.message : 'Error fetching suggestions');
          setSuggestions([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchSuggestions();

    return () => {
      isCancelled = true;
    };
  }, [debouncedQuery, getSessionToken]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleInputChange = (val: string) => {
    setQuery(val);
    if (val.trim().length < 2) {
      setSuggestions([]);
      setIsLoading(false);
      setError(null);
      setIsOpen(false);
    } else if (!isOpen) {
      setIsOpen(true);
    }
  };

  // Handle suggestion selection
  const handleSelect = async (item: SuggestionItem) => {
    setIsLoading(true);
    setError(null);

    try {
      const sessionToken = getSessionToken();
      const params = new URLSearchParams({
        id: item.id,
        session_token: sessionToken,
      });

      const res = await fetch(`/api/search/retrieve?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to retrieve place details');
      }

      const data = await res.json();
      const place: PlaceResult | undefined = data.place;

      if (place && typeof place.lng === 'number' && typeof place.lat === 'number') {
        // Add single pin to mapStore.markers, replacing previous search pin
        useMapStore.getState().setMarkers([
          {
            id: 'search-pin',
            longitude: place.lng,
            latitude: place.lat,
            title: place.name || item.name,
          },
        ]);

        // Fly the map to the retrieved location
        onFlyTo?.(place.lng, place.lat);

        skipNextSearchRef.current = true;
        setQuery(place.name || item.name);
        setIsOpen(false);
        setSuggestions([]);
      }
    } catch (err) {
      console.error('Retrieve error:', err);
      setError(err instanceof Error ? err.message : 'Error retrieving place');
    } finally {
      setIsLoading(false);
      resetSessionToken();
    }
  };

  const handleClear = () => {
    setQuery('');
    setSuggestions([]);
    setIsOpen(false);
    setError(null);
  };

  const visibleSuggestions = query.trim().length < 2 ? [] : suggestions;

  return (
    <div ref={containerRef} className={`relative z-20 ${className}`}>
      <Command
        shouldFilter={false}
        className="rounded-xl border border-border/80 bg-background/95 shadow-lg backdrop-blur-md transition-all overflow-visible"
      >
        <div className="relative flex items-center">
          <CommandInput
            value={query}
            onValueChange={handleInputChange}
            onFocus={() => {
              if (visibleSuggestions.length > 0 || query.trim().length >= 2) {
                setIsOpen(true);
              }
            }}
            placeholder="Search places in Greater Noida..."
            className="h-10 text-xs sm:text-sm pr-8"
          />
          {isLoading && (
            <div className="absolute right-3 flex items-center pointer-events-none">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && query && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-2.5 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {isOpen && (
          <CommandList className="max-h-60 overflow-y-auto border-t border-border/60 py-1">
            {error && (
              <div className="p-3 text-center text-xs text-destructive">
                {error}
              </div>
            )}
            {!isLoading && !error && visibleSuggestions.length === 0 && debouncedQuery.trim().length >= 2 && (
              <CommandEmpty className="py-4 text-xs text-muted-foreground">
                No matching places found.
              </CommandEmpty>
            )}
            {visibleSuggestions.length > 0 && (
              <CommandGroup heading="Suggestions" className="px-1 text-xs">
                {visibleSuggestions.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    onSelect={() => handleSelect(item)}
                    className="flex items-start gap-2.5 py-2 px-2.5 rounded-lg cursor-pointer hover:bg-muted/80 transition-colors"
                  >
                    <MapPin className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-medium text-xs sm:text-sm text-foreground truncate">
                        {item.name}
                      </span>
                      {item.address && (
                        <span className="text-[11px] text-muted-foreground truncate">
                          {item.address}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        )}
      </Command>
    </div>
  );
}
