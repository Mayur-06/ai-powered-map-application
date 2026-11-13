import { useEffect } from 'react';
import { create } from 'zustand';
import { lineString } from '@turf/helpers';
import along from '@turf/along';
import length from '@turf/length';
import { useMapStore } from './mapStore';
import type { RouteGeometry } from '@/lib/mapbox/directions';

export type PositionSource = 'gps' | 'simulated';

export interface PositionCoordinates {
  lng: number;
  lat: number;
}

interface SimulationStore {
  isSimulating: boolean;
  simulatedPosition: PositionCoordinates | null;
  currentDistanceM: number;
  speedMps: number;
  startSimulation: (geometry: RouteGeometry, speedMps?: number) => void;
  stopSimulation: () => void;
  setSpeed: (speedMps: number) => void;
  updatePosition: (pos: PositionCoordinates, distM: number) => void;
}

const DEFAULT_SIMULATION_SPEED_MPS = 25; // ~25 m/s (~90 km/h)
let simulationIntervalId: ReturnType<typeof setInterval> | null = null;
let lastTickTime: number = 0;

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  isSimulating: false,
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
    const totalDistanceM = length(line, { units: 'meters' });

    // Start at beginning of route
    const startPt = along(line, 0, { units: 'meters' });
    const initialPos: PositionCoordinates = {
      lng: startPt.geometry.coordinates[0],
      lat: startPt.geometry.coordinates[1],
    };

    set({
      isSimulating: true,
      simulatedPosition: initialPos,
      currentDistanceM: 0,
      speedMps: speed,
    });

    lastTickTime = performance.now();

    simulationIntervalId = setInterval(() => {
      const now = performance.now();
      const deltaSeconds = (now - lastTickTime) / 1000;
      lastTickTime = now;

      const currentDist = get().currentDistanceM;
      const currentSpeed = get().speedMps;
      const nextDist = currentDist + currentSpeed * deltaSeconds;

      if (nextDist >= totalDistanceM) {
        // Reached end of route
        const endPt = along(line, totalDistanceM, { units: 'meters' });
        set({
          simulatedPosition: {
            lng: endPt.geometry.coordinates[0],
            lat: endPt.geometry.coordinates[1],
          },
          currentDistanceM: totalDistanceM,
        });

        if (simulationIntervalId) {
          clearInterval(simulationIntervalId);
          simulationIntervalId = null;
        }
        return;
      }

      const nextPt = along(line, nextDist, { units: 'meters' });
      set({
        simulatedPosition: {
          lng: nextPt.geometry.coordinates[0],
          lat: nextPt.geometry.coordinates[1],
        },
        currentDistanceM: nextDist,
      });
    }, 100);
  },

  stopSimulation: () => {
    if (simulationIntervalId) {
      clearInterval(simulationIntervalId);
      simulationIntervalId = null;
    }
    set({
      isSimulating: false,
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
  simulationSpeed: number;
  startSimulation: (speedMps?: number) => void;
  stopSimulation: () => void;
  setSpeed: (speedMps: number) => void;
}

/**
 * Position-source abstraction hook:
 * Returns { position: {lng, lat} | null, source: 'gps' | 'simulated' }.
 * GPS source reads mapStore.userLocation.
 * Simulated source moves along route.geometry using @turf/along at ~25 m/s.
 * All navigation code reads position only through this hook.
 */
export function usePosition(): UsePositionReturn {
  const userLocation = useMapStore((state) => state.userLocation);
  const route = useMapStore((state) => state.route);
  const isNavigating = useMapStore((state) => state.isNavigating);

  const isSimulating = useSimulationStore((state) => state.isSimulating);
  const simulatedPosition = useSimulationStore((state) => state.simulatedPosition);
  const simulationSpeed = useSimulationStore((state) => state.speedMps);
  const startSimStore = useSimulationStore((state) => state.startSimulation);
  const stopSimulation = useSimulationStore((state) => state.stopSimulation);
  const setSpeed = useSimulationStore((state) => state.setSpeed);

  // If navigation is stopped or route is cleared while simulating, stop simulation
  useEffect(() => {
    if ((!isNavigating || !route) && isSimulating) {
      stopSimulation();
    }
  }, [isNavigating, route, isSimulating, stopSimulation]);

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
    simulationSpeed,
    startSimulation,
    stopSimulation,
    setSpeed,
  };
}
