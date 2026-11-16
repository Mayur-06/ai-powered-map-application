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
    <div className="rounded-xl border border-border/70 bg-card/95 p-3.5 shadow-sm text-left">
      <div className="flex items-center justify-between pb-2.5 border-b border-border/50">
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
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={onCancel}
            aria-label="Close preferences"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="mt-3 space-y-3">
        {/* Question 1: Interests */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-medium text-foreground">
              Interests <span className="text-muted-foreground font-normal">(choose up to 4)</span>
            </span>
            <span className="text-[10px] text-muted-foreground">
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
                  className={`flex min-h-[40px] items-center gap-1.5 px-3 py-2 rounded-full text-xs transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-primary text-primary-foreground border-primary font-medium shadow-xs'
                      : 'bg-muted/50 border-border/70 text-foreground hover:bg-muted hover:border-primary/40'
                  }`}
                  aria-pressed={isSelected}
                >
                  <Icon className="h-3 w-3 shrink-0" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Question 2: Budget */}
        <div>
          <span className="block text-[11px] font-medium text-foreground mb-1.5">
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
                  className={`flex-1 min-h-[40px] py-2 px-2.5 rounded-lg text-xs text-center transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-primary text-primary-foreground border-primary font-medium shadow-xs'
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
          <span className="block text-[11px] font-medium text-foreground mb-1.5">
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
                  className={`flex-1 min-h-[40px] py-2 px-2.5 rounded-lg text-xs text-center transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-primary text-primary-foreground border-primary font-medium shadow-xs'
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

      {/* Action Buttons */}
      <div className="mt-3.5 pt-2.5 border-t border-border/50 flex items-center justify-between gap-2">
        {isEditing ? (
          <>
            {onClear && initialPrefs && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClear}
                className="min-h-[40px] px-3 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer gap-1"
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
                  className="min-h-[40px] px-3 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Cancel
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                className="min-h-[40px] px-3.5 text-xs cursor-pointer gap-1"
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
                className="min-h-[40px] px-3 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Skip
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              className="min-h-[40px] px-3.5 text-xs ml-auto cursor-pointer gap-1"
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
