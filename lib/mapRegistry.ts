import type { MapRef } from 'react-map-gl/mapbox';

let currentMap: MapRef | null = null;

export function registerMapInstance(map: MapRef | null): void {
  currentMap = map;
}

export function getMapInstance(): MapRef | null {
  return currentMap;
}
