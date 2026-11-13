import { point, lineString } from '@turf/helpers';
import nearestPointOnLine from '@turf/nearest-point-on-line';
import distance from '@turf/distance';
import type { RouteGeometry, RouteStep } from './directions';

export interface NavigationResult {
  currentStepIndex: number;
  distanceToNextManeuverM: number;
  remainingDurationS: number;
  offRouteDistanceM: number;
  arrived: boolean;
}

const ADVANCE_THRESHOLD_METERS = 30;
const ARRIVAL_THRESHOLD_METERS = 30;

/**
 * Pure navigation logic:
 * Given route geometry, steps, and user's position, returns the current navigation progress.
 *
 * Mapbox step i's maneuver happens at the START of step i, so the upcoming maneuver
 * is steps[i + 1]: show its instruction and distance to its maneuver.location.
 * Advance when within ~30m of that point.
 * Treat within ~30m of the final destination as arrived.
 */
export function getNavigationProgress(
  route: { geometry: RouteGeometry; steps: RouteStep[] },
  position: { lng: number; lat: number },
  lastStepIndex: number = 0
): NavigationResult {
  const { geometry, steps } = route;

  if (!steps || steps.length === 0) {
    return {
      currentStepIndex: 0,
      distanceToNextManeuverM: 0,
      remainingDurationS: 0,
      offRouteDistanceM: 0,
      arrived: true,
    };
  }

  const userPoint = point([position.lng, position.lat]);

  // Compute off-route distance using nearestPointOnLine (do NOT act on it; rerouting is Day 6)
  let offRouteDistanceM = 0;
  let userLocationOnLineM = 0;
  if (geometry?.coordinates && geometry.coordinates.length >= 2) {
    const routeLine = lineString(geometry.coordinates);
    const snapped = nearestPointOnLine(routeLine, userPoint, { units: 'meters' });
    offRouteDistanceM = snapped.properties?.dist ?? 0;
    userLocationOnLineM = snapped.properties?.location ?? 0;
  }

  // Final destination check
  const finalStep = steps[steps.length - 1];
  const finalCoords = finalStep.maneuver.location || (
    geometry?.coordinates && geometry.coordinates.length > 0
      ? geometry.coordinates[geometry.coordinates.length - 1]
      : [position.lng, position.lat]
  );
  const distToFinalDest = distance(userPoint, point(finalCoords), { units: 'meters' });

  // If already at single-step route or within arrival threshold of final destination
  if (steps.length === 1 || distToFinalDest <= ARRIVAL_THRESHOLD_METERS) {
    return {
      currentStepIndex: steps.length - 1,
      distanceToNextManeuverM: distToFinalDest,
      remainingDurationS: 0,
      offRouteDistanceM,
      arrived: true,
    };
  }

  // Determine currentStepIndex: monotonic advancement starting from lastStepIndex
  let currentStepIndex = Math.max(0, Math.min(lastStepIndex, steps.length - 1));

  // If position has already passed step locations along the route line, advance to catch up
  if (geometry?.coordinates && geometry.coordinates.length >= 2) {
    const routeLine = lineString(geometry.coordinates);
    for (let k = currentStepIndex; k < steps.length - 1; k++) {
      const nextManeuverPt = point(steps[k + 1].maneuver.location);
      const snappedManeuver = nearestPointOnLine(routeLine, nextManeuverPt, { units: 'meters' });
      const maneuverDistOnLine = snappedManeuver.properties?.location ?? 0;
      if (userLocationOnLineM >= maneuverDistOnLine - ADVANCE_THRESHOLD_METERS) {
        currentStepIndex = k + 1;
      } else {
        break;
      }
    }
  }

  // Check straight-line distance to upcoming maneuver: advance if within ~30m
  while (currentStepIndex < steps.length - 1) {
    const upcomingManeuver = steps[currentStepIndex + 1];
    const distToUpcoming = distance(userPoint, point(upcomingManeuver.maneuver.location), {
      units: 'meters',
    });

    if (distToUpcoming <= ADVANCE_THRESHOLD_METERS) {
      currentStepIndex++;
      if (currentStepIndex === steps.length - 1) {
        // Reached arrival step
        return {
          currentStepIndex,
          distanceToNextManeuverM: distToFinalDest,
          remainingDurationS: 0,
          offRouteDistanceM,
          arrived: true,
        };
      }
    } else {
      break;
    }
  }

  // Arrived check if index reached the last step
  const arrived = currentStepIndex >= steps.length - 1 || distToFinalDest <= ARRIVAL_THRESHOLD_METERS;

  // Upcoming maneuver location and distance
  let distanceToNextManeuverM = 0;
  if (arrived || currentStepIndex === steps.length - 1) {
    distanceToNextManeuverM = distToFinalDest;
  } else {
    const upcomingManeuver = steps[currentStepIndex + 1];
    distanceToNextManeuverM = distance(userPoint, point(upcomingManeuver.maneuver.location), {
      units: 'meters',
    });
  }

  // Sum of remaining steps' durations from currentStepIndex onwards
  let remainingDurationS = 0;
  if (!arrived) {
    for (let i = currentStepIndex; i < steps.length; i++) {
      remainingDurationS += steps[i].duration || 0;
    }
  }

  return {
    currentStepIndex,
    distanceToNextManeuverM,
    remainingDurationS,
    offRouteDistanceM,
    arrived,
  };
}

