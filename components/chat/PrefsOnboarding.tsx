'use client';

import { useState } from 'react';
import { CATEGORIES, type CategoryId } from '@/lib/categories';
import { type UserPrefs } from '@/lib/prefs';
import { Button } from '@/components/ui/button';
import { Sparkles, Trash2, X, Check } from 'lucide-react';

interface PrefsOnboardingProps {
  initialPrefs?: UserPrefs | null;
  onSave: (prefs: UserPrefs) => void;
  onSkip?: () => void;
  onClear?: () => void;
  onCancel?: () => void;
  isEditing?: boolean;
}

const BUDGET_OPTIONS: { id: UserPrefs['budget']; label: string }[] = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'any', label: 'Any' },
];

const TRANSPORT_OPTIONS: { id: UserPrefs['transport']; label: string }[] = [
  { id: 'drive', label: 'Drive' },
  { id: 'walk', label: 'Walk' },
  { id: 'cycle', label: 'Cycle' },
];

export default function PrefsOnboarding({
  initialPrefs,
  onSave,
  onSkip,
  onClear,
  onCancel,
  isEditing = false,
}: PrefsOnboardingProps) {
  const [selectedInterests, setSelectedInterests] = useState<CategoryId[]>(
    initialPrefs?.interests ?? []
  );
  const [selectedBudget, setSelectedBudget] = useState<UserPrefs['budget']>(
    initialPrefs?.budget ?? 'any'
  );
  const [selectedTransport, setSelectedTransport] = useState<UserPrefs['transport']>(
    initialPrefs?.transport ?? 'drive'
  );

  const toggleInterest = (id: CategoryId) => {
    if (selectedInterests.includes(id)) {
      setSelectedInterests(selectedInterests.filter((item) => item !== id));
    } else {
      if (selectedInterests.length < 4) {
        setSelectedInterests([...selectedInterests, id]);
      }
    }
  };

  const handleSave = () => {
    onSave({
      interests: selectedInterests,
      budget: selectedBudget,
      transport: selectedTransport,
    });
  };

  return (
    <div className="flex flex-col h-full max-h-full rounded-xl border border-border/70 bg-card/95 shadow-sm text-left overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-border/50 shrink-0">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-amber-500 fill-amber-400" />
          <h4 className="text-xs font-semibold text-foreground">
            {isEditing ? 'Preferences' : 'Personalize your guide'}
          </h4>
        </div>
        {isEditing && onCancel && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={onCancel}
            aria-label="Close preferences"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Scrollable Content Body */}
      <div className="flex-1 overflow-y-auto px-3.5 py-2.5 space-y-2.5 min-h-0 text-xs">
        {/* Question 1: Interests */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-foreground">
              Interests <span className="text-muted-foreground font-normal">(up to 4)</span>
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {selectedInterests.length}/4
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((cat) => {
              const isSelected = selectedInterests.includes(cat.id);
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => toggleInterest(cat.id)}
                  className={`flex h-10 min-h-[40px] items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                      : 'bg-muted/50 border-border/70 text-foreground hover:bg-muted hover:border-primary/40'
                  }`}
                  aria-pressed={isSelected}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Question 2: Budget */}
        <div>
          <span className="block text-[11px] font-semibold text-foreground mb-1">
            Budget
          </span>
          <div className="flex gap-1.5">
            {BUDGET_OPTIONS.map((opt) => {
              const isSelected = selectedBudget === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedBudget(opt.id)}
                  className={`flex-1 h-10 min-h-[40px] py-1.5 px-2 rounded-lg text-xs sm:text-sm font-medium text-center transition-all cursor-pointer border flex items-center justify-center ${
                    isSelected
                      ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                      : 'bg-muted/50 border-border/70 text-foreground hover:bg-muted hover:border-primary/40'
                  }`}
                  aria-pressed={isSelected}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Question 3: Transport */}
        <div>
          <span className="block text-[11px] font-semibold text-foreground mb-1">
            Transport mode
          </span>
          <div className="flex gap-1.5">
            {TRANSPORT_OPTIONS.map((opt) => {
              const isSelected = selectedTransport === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedTransport(opt.id)}
                  className={`flex-1 h-10 min-h-[40px] py-1.5 px-2 rounded-lg text-xs sm:text-sm font-medium text-center transition-all cursor-pointer border flex items-center justify-center ${
                    isSelected
                      ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                      : 'bg-muted/50 border-border/70 text-foreground hover:bg-muted hover:border-primary/40'
                  }`}
                  aria-pressed={isSelected}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Pinned Action Buttons Footer */}
      <div className="shrink-0 px-3.5 py-2.5 border-t border-border/50 bg-card/95 flex items-center justify-between gap-2">
        {isEditing ? (
          <>
            {onClear && initialPrefs && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClear}
                className="h-10 min-h-[40px] px-3 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer gap-1"
                aria-label="Clear all preferences"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </Button>
            )}
            <div className="flex items-center gap-1.5 ml-auto">
              {onCancel && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onCancel}
                  className="h-10 min-h-[40px] px-3 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Cancel
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                className="h-10 min-h-[40px] px-4 text-xs cursor-pointer gap-1.5 font-medium"
              >
                <Check className="h-3.5 w-3.5" />
                Save
              </Button>
            </div>
          </>
        ) : (
          <>
            {onSkip && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onSkip}
                className="h-10 min-h-[40px] px-3 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Skip
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              className="h-10 min-h-[40px] px-4 text-xs ml-auto cursor-pointer gap-1.5 font-medium"
            >
              <Check className="h-3.5 w-3.5" />
              Save Preferences
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
