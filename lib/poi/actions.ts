'use server';

import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';

export interface PoiReview {
  author: string | null;
  rating: number | null;
  text: string | null;
  created_at: string;
  is_sample: boolean;
}

export interface PoiDetails {
  id: string;
  name: string;
  category: string;
  rating: number | null;
  address: string | null;
  hours: { raw?: string } | Record<string, unknown> | null;
  reviews: PoiReview[];
}

export type PoiDetailsResult =
  | { success: true; data: PoiDetails }
  | { success: false; error: string };

const idSchema = z.string().uuid({ message: 'Invalid POI ID format' });

export async function getPoiDetails(id: unknown): Promise<PoiDetailsResult> {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Invalid POI ID',
    };
  }

  try {
    const supabase = createServerClient();
    const poiId = parsed.data;

    const [poiRes, reviewsRes] = await Promise.all([
      supabase
        .from('pois')
        .select('id, name, category, rating, address, hours')
        .eq('id', poiId)
        .maybeSingle(),
      supabase
        .from('reviews')
        .select('author, rating, text, created_at, is_sample')
        .eq('poi_id', poiId)
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    if (poiRes.error) {
      console.error('Error fetching POI:', poiRes.error);
      return { success: false, error: poiRes.error.message };
    }

    if (!poiRes.data) {
      return { success: false, error: 'Place not found' };
    }

    if (reviewsRes.error) {
      console.error('Error fetching reviews:', reviewsRes.error);
      return { success: false, error: reviewsRes.error.message };
    }

    const poi = poiRes.data;
    const reviews: PoiReview[] = (reviewsRes.data ?? []).map((r) => ({
      author: r.author ?? null,
      rating: r.rating != null ? Number(r.rating) : null,
      text: r.text ?? null,
      created_at: r.created_at,
      is_sample: Boolean(r.is_sample),
    }));

    return {
      success: true,
      data: {
        id: poi.id,
        name: poi.name,
        category: poi.category,
        rating: poi.rating != null ? Number(poi.rating) : null,
        address: poi.address ?? null,
        hours: (poi.hours as { raw?: string } | null) ?? null,
        reviews,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown server error';
    console.error('Unhandled error in getPoiDetails:', err);
    return { success: false, error: message };
  }
}
