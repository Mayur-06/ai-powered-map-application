'use client';

import { useState, useEffect } from 'react';
import { Layers, ChevronDown, ChevronUp } from 'lucide-react';
import { CATEGORIES } from '@/lib/categories';
import { useMapStore } from '@/lib/store/mapStore';

export default function Legend() {
  const hiddenCategories = useMapStore((state) => state.hiddenCategories);
  const toggleCategory = useMapStore((state) => state.toggleCategory);

  // Collapsed by default on screens under 640px, expanded on desktop
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 640px)');
    if (mediaQuery.matches) {
      requestAnimationFrame(() => {
        setIsOpen(true);
      });
    }

    const handleMediaChange = (e: MediaQueryListEvent) => {
      setIsOpen(e.matches);
    };

    mediaQuery.addEventListener('change', handleMediaChange);
    return () => mediaQuery.removeEventListener('change', handleMediaChange);
  }, []);

  const hiddenCount = hiddenCategories.length;
  const activeCount = CATEGORIES.length - hiddenCount;

  return (
    <div
      className="absolute top-36 right-3 sm:top-auto sm:bottom-6 sm:right-4 z-20 flex flex-col items-end"
      style={{
        zIndex: 20,
      }}
    >
      {/* Collapsed toggle pill */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/95 px-3 py-1.5 text-xs font-medium text-foreground shadow-md backdrop-blur-md hover:bg-muted transition-colors cursor-pointer"
          aria-label="Open categories legend"
        >
          <Layers className="h-3.5 w-3.5 text-foreground" />
          <span>Legend</span>
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
            {activeCount}/{CATEGORIES.length}
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      )}

      {/* Expanded legend card */}
      {isOpen && (
        <div className="w-56 rounded-xl border border-border bg-background/95 p-3 shadow-xl backdrop-blur-md transition-all">
          <div className="mb-2 flex items-center justify-between border-b border-border/60 pb-2">
            <div className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-foreground" />
              <h3 className="text-xs font-semibold text-foreground">Categories</h3>
              <span className="text-[10px] text-muted-foreground font-mono">
                ({activeCount}/{CATEGORIES.length})
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              aria-label="Collapse legend"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex flex-col gap-1 max-h-56 overflow-y-auto pr-0.5">
            {CATEGORIES.map((cat) => {
              const isHidden = hiddenCategories.includes(cat.id);
              const Icon = cat.icon;

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggleCategory(cat.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-xs transition-colors cursor-pointer text-left ${
                    isHidden
                      ? 'text-muted-foreground/50 hover:bg-muted/50'
                      : 'text-foreground hover:bg-muted/80'
                  }`}
                  aria-pressed={!isHidden}
                  title={isHidden ? `Show ${cat.label}` : `Hide ${cat.label}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`h-2.5 w-2.5 rounded-full shrink-0 transition-opacity ${
                        isHidden ? 'opacity-30' : 'opacity-100'
                      }`}
                      style={{ backgroundColor: cat.color }}
                    />
                    <Icon
                      className={`h-3.5 w-3.5 shrink-0 transition-opacity ${
                        isHidden ? 'opacity-30' : 'opacity-100'
                      }`}
                      style={{ color: isHidden ? undefined : cat.color }}
                    />
                    <span
                      className={`truncate text-[11px] ${
                        isHidden ? 'line-through text-muted-foreground/60' : 'font-medium'
                      }`}
                    >
                      {cat.label}
                    </span>
                  </div>

                  <span
                    className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-mono transition-colors ${
                      isHidden
                        ? 'bg-muted text-muted-foreground/60'
                        : 'bg-primary/10 text-primary font-semibold'
                    }`}
                  >
                    {isHidden ? 'Off' : 'On'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
