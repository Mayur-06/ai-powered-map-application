export interface SystemPromptContext {
  userLocation?: { lng: number; lat: number } | null;
  bounds?: { west: number; south: number; east: number; north: number } | null;
}

/**
 * Builds the system prompt for the Greater Noida navigation assistant.
 * Incorporates user location and map bounds context when available.
 */
export function buildSystemPrompt(context?: SystemPromptContext | null): string {
  const instructions = [
    'You are a local navigation assistant for Greater Noida, India.',
    'Answer in at most 3 short sentences.',
    'Be plain and friendly.',
    "The user's current location and the map's visible bounds are provided as context, use them.",
    'NEVER name or describe specific places, ratings, prices, opening hours or routes, because you have no tools or place data yet.',
    'If the user asks for places or directions, say that place search is being connected and you cannot look places up yet.',
  ];

  const contextDetails: string[] = [];
  if (context?.userLocation) {
    contextDetails.push(
      `User location: lng=${context.userLocation.lng.toFixed(5)}, lat=${context.userLocation.lat.toFixed(5)}`
    );
  }
  if (context?.bounds) {
    contextDetails.push(
      `Map bounds: west=${context.bounds.west.toFixed(5)}, south=${context.bounds.south.toFixed(5)}, east=${context.bounds.east.toFixed(5)}, north=${context.bounds.north.toFixed(5)}`
    );
  }

  if (contextDetails.length > 0) {
    instructions.push(`\nContext:\n${contextDetails.join('\n')}`);
  }

  return instructions.join('\n');
}
