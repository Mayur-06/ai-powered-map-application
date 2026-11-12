import { create } from 'zustand';
import type { PaddingOptions } from 'mapbox-gl';
import type { RouteResult, RouteMode, RouteStep, RouteGeometry, RouteManeuver } from '@/lib/mapbox/directions';

export type { RouteResult, RouteMode, RouteStep, RouteGeometry, RouteManeuver };

export interface UserLocation {
  longitude: number;
  latitude: number;
  heading?: number | null;
  accuracy?: number | null;
}

export interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch?: number;
  bearing?: number;
  padding?: PaddingOptions;
}

export interface MarkerItem {
  id: string;
  longitude: number;
  latitude: number;
  title?: string;
  category?: string;
}

export interface Poi {
  id: string;
  name: string;
  category: string;
  description?: string | null;
  address?: string | null;
  rating?: number | null;
  price_level?: number | null;
  longitude: number;
  latitude: number;
  hours?: Record<string, unknown> | null;
  summary?: Record<string, unknown> | null;
}

export type MapStyleMode = 'streets' | 'dark';

export interface MapState {
  userLocation: UserLocation | null;
  viewState: ViewState;
  markers: MarkerItem[];
  selectedPoi: Poi | null;
  route: RouteResult | null;
  routeMode: RouteMode;
  mapStyle: MapStyleMode;
  setUserLocation: (location: UserLocation | null) => void;
  setViewState: (viewState: ViewState) => void;
  updateViewState: (patch: Partial<ViewState>) => void;
  setMarkers: (markers: MarkerItem[]) => void;
  setSelectedPoi: (poi: Poi | null) => void;
  setRoute: (route: RouteResult | null) => void;
  clearRoute: () => void;
  setRouteMode: (mode: RouteMode) => void;
  setMapStyle: (style: MapStyleMode) => void;
  toggleMapStyle: () => void;
}

export const MAPBOX_STYLES: Record<MapStyleMode, string> = {
  streets: 'mapbox://styles/mapbox/streets-v12',
  dark: 'mapbox://styles/mapbox/dark-v11',
};

export const INITIAL_VIEW_STATE: ViewState = {
  longitude: 77.50,
  latitude: 28.47,
  zoom: 11,
  pitch: 0,
  bearing: 0,
};

export const useMapStore = create<MapState>((set) => ({
  userLocation: null,
  viewState: INITIAL_VIEW_STATE,
  markers: [],
  selectedPoi: null,
  route: null,
  routeMode: 'drive',
  mapStyle: 'streets',
  setUserLocation: (location) => set({ userLocation: location }),
  setViewState: (viewState) => set({ viewState }),
  updateViewState: (patch) =>
    set((state) => ({ viewState: { ...state.viewState, ...patch } })),
  setMarkers: (markers) => set({ markers }),
  setSelectedPoi: (poi) => set({ selectedPoi: poi }),
  setRoute: (route) => set({ route }),
  clearRoute: () => set({ route: null }),
  setRouteMode: (routeMode) => set({ routeMode }),
  setMapStyle: (mapStyle) => set({ mapStyle }),
  toggleMapStyle: () =>
    set((state) => ({
      mapStyle: state.mapStyle === 'streets' ? 'dark' : 'streets',
    })),
}));
