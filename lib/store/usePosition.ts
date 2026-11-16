import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { lineString } from '@turf/helpers';
import along from '@turf/along';
import length from '@turf/length';
import { useMapStore } from './mapStore';
import type { RouteGeometry } from '@/lib/mapbox/directions';
import {
  calculatePerpendicularDivert,
  areGeometriesDifferent,
} from '@/lib/mapbox/reroute';

export type PositionSource = 'gps' | 'simulated';

export interface PositionCoordinates {
  lng: number;
  lat: number;
}

interface SimulationStore {
  isSimulating: boolean;
  isDiverted: boolean;
  divertedPosition: PositionCoordinates | null;
  activeRouteGeometry: RouteGeometry | null;
  simulatedPosition: PositionCoordinates | null;
  currentDistanceM: number;
  speedMps: number;
  startSimulation: (geometry: RouteGeometry, speedMps?: number) => void;
  stopSimulation: () => void;
  divert: () => void;
  restartAlongRoute: (geometry: RouteGeometry) => void;
  setSpeed: (speedMps: number) => void;
  updatePosition: (pos: PositionCoordinates, distM: number) => void;
}

const DEFAULT_SIMULATION_SPEED_MPS = 25; // ~25 m/s (~90 km/h)
const SIMULATION_TICK_INTERVAL_MS = 1000; // Emit fix every 1 s
let simulationIntervalId: ReturnType<typeof setInterval> | null = null;
let lastTickTime: number = 0;

function runSimulationTick(set: (fn: (state: SimulationStore) => Partial<SimulationStore>) => void, get: () => SimulationStore) {
  const now = performance.now();
  const deltaSeconds = lastTickTime > 0 ? (now - lastTickTime) / 1000 : 1;
  lastTickTime = now;

  // If diverted, keep emitting that same off-route position as a stationary fix
  if (get().isDiverted) {
    const divPos = get().divertedPosition;
    if (divPos) {
      set(() => ({
        simulatedPosition: { lng: divPos.lng, lat: divPos.lat },
      }));
    }
    return;
  }

  const geom = get().activeRouteGeometry;
  if (!geom?.coordinates || geom.coordinates.length < 2) return;

  const line = lineString(geom.coordinates);
  const totalDistanceM = length(line, { units: 'meters' });

  const currentDist = get().currentDistanceM;
  const currentSpeed = get().speedMps;
  const nextDist = currentDist + currentSpeed * deltaSeconds;

  if (nextDist >= totalDistanceM) {
    // Reached end of route
    const endPt = along(line, totalDistanceM, { units: 'meters' });
    set(() => ({
      simulatedPosition: {
        lng: endPt.geometry.coordinates[0],
        lat: endPt.geometry.coordinates[1],
      },
      currentDistanceM: totalDistanceM,
    }));

    if (simulationIntervalId) {
      clearInterval(simulationIntervalId);
      simulationIntervalId = null;
    }
    return;
  }

  const nextPt = along(line, nextDist, { units: 'meters' });
  set(() => ({
    simulatedPosition: {
      lng: nextPt.geometry.coordinates[0],
      lat: nextPt.geometry.coordinates[1],
    },
    currentDistanceM: nextDist,
  }));
}

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  isSimulating: false,
  isDiverted: false,
  divertedPosition: null,
  activeRouteGeometry: null,
  simulatedPosition: null,
  currentDistanceM: 0,
  speedMps: DEFAULT_SIMULATION_SPEED_MPS,

  startSimulation: (geometry: RouteGeometry, speedMps?: number) => {
    if (!geometry?.coordinates || geometry.coordinates.length < 2) {
      return;
    }

    if (simulationIntervalId) {
      clearInterval(simulationIntervalId);
      simulationIntervalId = null;
    }

    const speed = typeof speedMps === 'number' && speedMps > 0 ? speedMps : get().speedMps;
    const line = lineString(geometry.coordinates);

    // Start at beginning of route
    const startPt = along(line, 0, { units: 'meters' });
    const initialPos: PositionCoordinates = {
      lng: startPt.geometry.coordinates[0],
      lat: startPt.geometry.coordinates[1],
    };

    lastTickTime = performance.now();

    set({
      isSimulating: true,
      isDiverted: false,
      divertedPosition: null,
      activeRouteGeometry: geometry,
      simulatedPosition: initialPos,
      currentDistanceM: 0,
      speedMps: speed,
    });

    simulationIntervalId = setInterval(() => {
      runSimulationTick(set, get);
    }, SIMULATION_TICK_INTERVAL_MS);
  },

  divert: () => {
    const { isSimulating, activeRouteGeometry, currentDistanceM } = get();
    if (!isSimulating || !activeRouteGeometry) {
      return;
    }

    // Moves the simulated position about 100 m perpendicular to the route at the current point
    const divertPos = calculatePerpendicularDivert(activeRouteGeometry, currentDistanceM, 100);

    set({
      isDiverted: true,
      divertedPosition: divertPos,
      simulatedPosition: divertPos,
    });
  },

  restartAlongRoute: (geometry: RouteGeometry) => {
    if (!geometry?.coordinates || geometry.coordinates.length < 2) {
      return;
    }

    if (simulationIntervalId) {
      clearInterval(simulationIntervalId);
      simulationIntervalId = null;
    }

    const line = lineString(geometry.coordinates);
    const startPt = along(line, 0, { units: 'meters' });
    const initialPos: PositionCoordinates = {
      lng: startPt.geometry.coordinates[0],
      lat: startPt.geometry.coordinates[1],
    };

    lastTickTime = performance.now();

    set({
      isSimulating: true,
      isDiverted: false,
      divertedPosition: null,
      activeRouteGeometry: geometry,
      simulatedPosition: initialPos,
      currentDistanceM: 0,
    });

    simulationIntervalId = setInterval(() => {
      runSimulationTick(set, get);
    }, SIMULATION_TICK_INTERVAL_MS);
  },

  stopSimulation: () => {
    if (simulationIntervalId) {
      clearInterval(simulationIntervalId);
      simulationIntervalId = null;
    }
    set({
      isSimulating: false,
      isDiverted: false,
      divertedPosition: null,
      activeRouteGeometry: null,
      simulatedPosition: null,
      currentDistanceM: 0,
    });
  },

  setSpeed: (speedMps: number) => {
    if (speedMps > 0) {
      set({ speedMps });
    }
  },

  updatePosition: (pos: PositionCoordinates, distM: number) => {
    set({ simulatedPosition: pos, currentDistanceM: distM });
  },
}));

export interface UsePositionReturn {
  position: PositionCoordinates | null;
  source: PositionSource;
  isSimulating: boolean;
  isDiverted: boolean;
  simulationSpeed: number;
  startSimulation: (speedMps?: number) => void;
  stopSimulation: () => void;
  divert: () => void;
  restartAlongRoute: (geometry: RouteGeometry) => void;
  setSpeed: (speedMps: number) => void;
}

/**
 * Position-source abstraction hook:
 * Returns { position: {lng, lat} | null, source: 'gps' | 'simulated' }.
 * GPS source reads mapStore.userLocation.
 * Simulated source moves along route.geometry at ~25 m/s emitting fixes every 1s.
 * All navigation code reads position only through this hook.
 */
export function usePosition(): UsePositionReturn {
  const userLocation = useMapStore((state) => state.userLocation);
  const route = useMapStore((state) => state.route);
  const isNavigating = useMapStore((state) => state.isNavigating);

  const isSimulating = useSimulationStore((state) => state.isSimulating);
  const isDiverted = useSimulationStore((state) => state.isDiverted);
  const activeRouteGeometry = useSimulationStore((state) => state.activeRouteGeometry);
  const simulatedPosition = useSimulationStore((state) => state.simulatedPosition);
  const simulationSpeed = useSimulationStore((state) => state.speedMps);
  const startSimStore = useSimulationStore((state) => state.startSimulation);
  const stopSimulation = useSimulationStore((state) => state.stopSimulation);
  const divert = useSimulationStore((state) => state.divert);
  const restartAlongRoute = useSimulationStore((state) => state.restartAlongRoute);
  const setSpeed = useSimulationStore((state) => state.setSpeed);

  // If navigation is stopped or route is cleared while simulating, stop simulation
  useEffect(() => {
    if ((!isNavigating || !route) && isSimulating) {
      stopSimulation();
    }
  }, [isNavigating, route, isSimulating, stopSimulation]);

  // When route geometry changes (e.g. reroute), restart simulator along new geometry from its start
  const prevGeometryRef = useRef<RouteGeometry | null>(null);

  useEffect(() => {
    if (isSimulating && route?.geometry) {
      if (
        activeRouteGeometry &&
        areGeometriesDifferent(activeRouteGeometry, route.geometry)
      ) {
        restartAlongRoute(route.geometry);
      }
      prevGeometryRef.current = route.geometry;
    } else {
      prevGeometryRef.current = route?.geometry ?? null;
    }
  }, [isSimulating, route?.geometry, activeRouteGeometry, restartAlongRoute]);

  const startSimulation = (speedMps?: number) => {
    const currentRoute = useMapStore.getState().route;
    if (currentRoute?.geometry) {
      startSimStore(currentRoute.geometry, speedMps);
    }
  };

  const isSimActive = isSimulating && simulatedPosition !== null;

  const position: PositionCoordinates | null = isSimActive
    ? simulatedPosition
    : userLocation
      ? { lng: userLocation.longitude, lat: userLocation.latitude }
      : null;

  const source: PositionSource = isSimActive ? 'simulated' : 'gps';

  return {
    position,
    source,
    isSimulating,
    isDiverted,
    simulationSpeed,
    startSimulation,
    stopSimulation,
    divert,
    restartAlongRoute,
    setSpeed,
  };
}
