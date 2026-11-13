import type { LucideIcon } from 'lucide-react';
import {
  Coffee,
  Utensils,
  Pill,
  Landmark,
  Fuel,
  Trees,
  Hospital,
  ShoppingBag,
} from 'lucide-react';

export type CategoryId =
  | 'cafe'
  | 'restaurant'
  | 'pharmacy'
  | 'bank_atm'
  | 'fuel'
  | 'park'
  | 'hospital'
  | 'shopping';

export interface CategoryInfo {
  id: CategoryId;
  label: string;
  color: string;
  icon: LucideIcon;
}

export const CATEGORIES: readonly CategoryInfo[] = [
  {
    id: 'cafe',
    label: 'Cafes',
    color: '#d97706',
    icon: Coffee,
  },
  {
    id: 'restaurant',
    label: 'Restaurants',
    color: '#f43f5e',
    icon: Utensils,
  },
  {
    id: 'pharmacy',
    label: 'Pharmacies',
    color: '#0d9488',
    icon: Pill,
  },
  {
    id: 'bank_atm',
    label: 'Banks & ATMs',
    color: '#2563eb',
    icon: Landmark,
  },
  {
    id: 'fuel',
    label: 'Fuel Stations',
    color: '#ea580c',
    icon: Fuel,
  },
  {
    id: 'park',
    label: 'Parks & Nature',
    color: '#16a34a',
    icon: Trees,
  },
  {
    id: 'hospital',
    label: 'Hospitals',
    color: '#dc2626',
    icon: Hospital,
  },
  {
    id: 'shopping',
    label: 'Shopping',
    color: '#9333ea',
    icon: ShoppingBag,
  },
] as const;

export const CATEGORIES_BY_ID: Record<CategoryId, CategoryInfo> = CATEGORIES.reduce(
  (acc, cat) => {
    acc[cat.id] = cat;
    return acc;
  },
  {} as Record<CategoryId, CategoryInfo>
);

export function getCategoryInfo(categoryId: string): CategoryInfo | undefined {
  return CATEGORIES_BY_ID[categoryId as CategoryId];
}
