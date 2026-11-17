'use client';

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  useSyncExternalStore,
} from 'react';
import { useMapStore } from '@/lib/store/mapStore';
import { usePosition } from '@/lib/store/usePosition';
import { useReroute } from '@/lib/store/useReroute';
import { getNavigationProgress, type NavigationResult } from '@/lib/mapbox/navigation';
import {
  Navigation,
  Volume2,
  VolumeX,
  Play,
  Square,
  CheckCircle2,
  X,
  Clock,
  CornerUpRight,
  RefreshCw,
  Info,
} from 'lucide-react';

function formatManeuverDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number): string {
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

function subscribeToWindow() {
  return () => {};
}

function getSpeechSnapshot(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function getServerSpeechSnapshot(): boolean {
  return false;
}

function getDebugSnapshot(): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }
  if (typeof window !== 'undefined') {
    return new URLSearchParams(window.location.search).get('debug') === '1';
  }
  return false;
}

function getServerDebugSnapshot(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export default function NavPanel() {
  const route = useMapStore((state) => state.route);
  const stopNavigation = useMapStore((state) => state.stopNavigation);
  const notices = useMapStore((state) => state.notices);

  const {
    position,
    isSimulating,
    isDiverted,
    startSimulation,
    stopSimulation,
    divert,
  } = usePosition();

  const { isRerouting } = useReroute();

  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [dismissedNoticeId, setDismissedNoticeId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(() => Date.now());

  // Latest notice banner: auto-hide after 8 seconds
  const latestNotice = notices[notices.length - 1];

  useEffect(() => {
    if (!latestNotice) return;
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [latestNotice]);

  const activeNotice =
    latestNotice &&
    latestNotice.id !== dismissedNoticeId &&
    currentTime - latestNotice.createdAt < 8000
      ? latestNotice
      : null;

  // Feature detection via useSyncExternalStore for hydration-safe external state
  const hasSpeech = useSyncExternalStore(
    subscribeToWindow,
    getSpeechSnapshot,
    getServerSpeechSnapshot
  );

  const showSimulator = useSyncExternalStore(
    subscribeToWindow,
    getDebugSnapshot,
    getServerDebugSnapshot
  );

  // Compute navigation progress purely from route and position
  const navProgress: NavigationResult = useMemo(() => {
    if (!route || !position) {
      return {
        currentStepIndex: 0,
        distanceToNextManeuverM: 0,
        remainingDurationS: route ? route.duration : 0,
        offRouteDistanceM: 0,
        arrived: false,
      };
    }
    return getNavigationProgress(route, position);
  }, [route, position]);

  // Derive upcoming instruction text
  const currentInstruction = useMemo(() => {
    if (!route?.steps || route.steps.length === 0) return '';
    if (navProgress.arrived) {
      return (
        route.steps[route.steps.length - 1]?.instruction ||
        'You have arrived at your destination'
      );
    }
    const upcomingIdx = navProgress.currentStepIndex + 1;
    if (upcomingIdx < route.steps.length) {
      return route.steps[upcomingIdx].instruction;
    }
    return (
      route.steps[navProgress.currentStepIndex]?.instruction ||
      'Continue to destination'
    );
  }, [route, navProgress.arrived, navProgress.currentStepIndex]);

  // Spoken voice instructions
  const speakText = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Speech synthesis error or not permitted
    }
  }, []);

  // Voice effect: speak when toggle turned ON or when step advances while ON
  const lastSpokenStepRef = useRef<number | null>(null);

  const handleToggleVoice = useCallback(() => {
    const nextVoiceState = !voiceEnabled;
    setVoiceEnabled(nextVoiceState);

    if (nextVoiceState) {
      // User gesture turned voice ON: speak the current instruction immediately
      if (currentInstruction) {
        speakText(currentInstruction);
        lastSpokenStepRef.current = navProgress.currentStepIndex;
      }
    } else {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      lastSpokenStepRef.current = null;
    }
  }, [voiceEnabled, currentInstruction, navProgress.currentStepIndex, speakText]);

  useEffect(() => {
    if (!voiceEnabled) return;

    if (lastSpokenStepRef.current !== navProgress.currentStepIndex) {
      lastSpokenStepRef.current = navProgress.currentStepIndex;
      if (currentInstruction) {
        speakText(currentInstruction);
      }
    }
  }, [voiceEnabled, navProgress.currentStepIndex, currentInstruction, speakText]);

  // Speak new notices when voice is ON
  const lastSpokenNoticeIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!voiceEnabled || !latestNotice) return;
    if (lastSpokenNoticeIdRef.current !== latestNotice.id) {
      lastSpokenNoticeIdRef.current = latestNotice.id;
      speakText(latestNotice.text);
    }
  }, [voiceEnabled, latestNotice, speakText]);

  // Cleanup speech synthesis on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleEndNavigation = useCallback(() => {
    if (isSimulating) {
      stopSimulation();
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    stopNavigation();
  }, [isSimulating, stopSimulation, stopNavigation]);

  if (!route) {
    return null;
  }

  return (
    <div
      className="absolute bottom-6 left-4 right-4 sm:right-auto sm:w-84 sm:max-w-sm z-20 max-h-[85dvh] overflow-y-auto rounded-xl border border-border bg-background/95 p-4 shadow-xl backdrop-blur-md transition-all"
      style={{
        bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
      }}
      role="region"
      aria-label="Navigation guidance"
    >
      {/* Top Bar: Navigating status, voice toggle, simulator button, and End button */}
      <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </div>
          <span className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {navProgress.arrived ? 'Arrived' : 'Navigating'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Simulator button & Divert button */}
          {showSimulator && (
            <>
              <button
                type="button"
                onClick={() => {
                  if (isSimulating) {
                    stopSimulation();
                  } else {
                    startSimulation();
                  }
                }}
                className={`inline-flex min-h-[40px] items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer border ${
                  isSimulating
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300'
                    : 'bg-muted border-border text-foreground hover:bg-muted/80'
                }`}
                title={isSimulating ? 'Stop simulation' : 'Start simulation'}
                aria-label={isSimulating ? 'Stop simulation' : 'Simulate route'}
              >
                {isSimulating ? (
                  <>
                    <Square className="h-3 w-3 fill-current" />
                    <span>Stop sim</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3 w-3 fill-current" />
                    <span>Simulate</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!isSimulating) {
                    startSimulation();
                  }
                  divert();
                }}
                className={`inline-flex min-h-[40px] items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer border ${
                  isDiverted
                    ? 'bg-rose-500/15 border-rose-500/30 text-rose-700 dark:text-rose-300'
                    : 'bg-muted border-border text-foreground hover:bg-muted/80'
                }`}
                title={isDiverted ? 'Diverted (100m off-route)' : 'Divert 100m off-route'}
                aria-label="Divert off-route"
              >
                <CornerUpRight className="h-3 w-3" />
                <span>{isDiverted ? 'Diverted' : 'Divert'}</span>
              </button>
            </>
          )}

          {/* Voice toggle */}
          {hasSpeech && (
            <button
              type="button"
              onClick={handleToggleVoice}
              className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors cursor-pointer border ${
                voiceEnabled
                  ? 'bg-primary/10 border-primary/20 text-primary'
                  : 'bg-muted/50 border-transparent text-muted-foreground hover:text-foreground'
              }`}
              title={voiceEnabled ? 'Mute voice instructions' : 'Enable voice instructions'}
              aria-label={voiceEnabled ? 'Mute voice instructions' : 'Enable voice instructions'}
              aria-pressed={voiceEnabled}
            >
              {voiceEnabled ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4" />
              )}
            </button>
          )}

          {/* End Navigation button */}
          <button
            type="button"
            onClick={handleEndNavigation}
            className="inline-flex min-h-[38px] items-center gap-1 rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-foreground hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer border border-border"
            title="End navigation"
            aria-label="End navigation"
          >
            <X className="h-3.5 w-3.5" />
            <span>End</span>
          </button>
        </div>
      </div>

      {/* Rerouting In-Flight Banner */}
      {isRerouting && (
        <div className="mt-2.5 flex items-center gap-2 rounded-lg bg-primary/10 border border-primary/20 px-3 py-1.5 text-xs text-primary font-medium animate-pulse">
          <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />
          <span>Rerouting...</span>
        </div>
      )}

      {/* Latest Notice Banner (auto-hides after 8s) */}
      {!isRerouting && activeNotice && (
        <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-200">
          <div className="flex items-center gap-1.5 min-w-0">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate font-medium">{activeNotice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setDismissedNoticeId(activeNotice.id)}
            className="flex h-8 w-8 items-center justify-center shrink-0 text-amber-700/60 hover:text-amber-900 dark:text-amber-300/60 dark:hover:text-amber-100 cursor-pointer p-1"
            aria-label="Dismiss notice"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Main Guidance Display */}
      {navProgress.arrived ? (
        <div className="mt-3 flex items-start gap-3 rounded-lg bg-emerald-500/10 p-3 border border-emerald-500/20">
          <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-bold text-emerald-800 dark:text-emerald-200">
              You have arrived!
            </h4>
            <p className="mt-0.5 text-xs text-emerald-700/90 dark:text-emerald-300/90 leading-snug">
              {currentInstruction}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {/* Next Maneuver and Instruction */}
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
              <Navigation className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-lg font-black tracking-tight text-foreground leading-none">
                {formatManeuverDistance(navProgress.distanceToNextManeuverM)}
              </div>
              <p className="mt-1 text-xs font-semibold text-foreground/90 leading-snug line-clamp-2">
                {currentInstruction || 'Continue straight'}
              </p>
            </div>
          </div>

          {/* Trip Progress Bar / Stats */}
          <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 border border-border/50 text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>Remaining ETA</span>
            </div>
            <span className="font-bold text-foreground">
              {formatDuration(navProgress.remainingDurationS)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
