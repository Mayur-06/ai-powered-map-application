import { z } from 'zod';
import type { CategoryId } from '@/lib/categories';

export const PREF_CATEGORY_IDS = [
  'cafe',
  'restaurant',
  'pharmacy',
  'bank_atm',
  'fuel',
  'park',
  'hospital',
  'shopping',
] as const satisfies readonly CategoryId[];

export const userPrefsSchema = z.object({
  interests: z
    .array(z.enum(PREF_CATEGORY_IDS))
    .max(4, 'Select at most 4 interests'),
  budget: z.enum(['low', 'medium', 'any']),
  transport: z.enum(['drive', 'walk', 'cycle']),
});

export type UserPrefs = z.infer<typeof userPrefsSchema>;

const PREFS_STORAGE_KEY = 'ai_map_user_prefs';

export function loadPrefs(): UserPrefs | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const result = userPrefsSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function savePrefs(prefs: UserPrefs): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const validated = userPrefsSchema.parse(prefs);
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(validated));
    return true;
  } catch {
    return false;
  }
}

export function clearPrefs(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.removeItem(PREFS_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
