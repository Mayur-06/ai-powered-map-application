import { getDirections } from '../lib/mapbox/directions';
import {
  computeOffRouteDistance,
  checkOffRoute,
  canTriggerReroute,
  areGeometriesDifferent,
  shouldTrafficReroute,
  calculatePerpendicularDivert,
  getRemainingWaypoints,
  type OffRouteDetectorState,
  type RerouteTripState,
} from '../lib/mapbox/reroute';
import { useSimulationStore } from '../lib/store/usePosition';
import type { RouteGeometry } from '../lib/mapbox/directions';

async function runTests() {
  console.log('--- Starting Sub-phase 6.2 Reroute & Simulator Tests ---\n');

  // 1. Call real Directions function once for a short route near Pari Chowk
  console.log('1. Fetching real Directions route near Pari Chowk (Greater Noida)...');
  const origin: [number, number] = [77.503, 28.472];
  const destination: [number, number] = [77.513, 28.478];

  const realRoute = await getDirections({ origin, destination, mode: 'drive' });
  if (!realRoute) {
    throw new Error('FAIL: getDirections returned null for Pari Chowk route');
  }
  if (!realRoute.geometry?.coordinates || realRoute.geometry.coordinates.length < 2) {
    throw new Error('FAIL: Real route has invalid geometry coordinates');
  }

  console.log(
    `[PASS] Real Directions API route fetched: distance=${Math.round(realRoute.distance)}m, duration=${Math.round(realRoute.duration)}s, points=${realRoute.geometry.coordinates.length}`
  );

  const routeGeometry = realRoute.geometry;

  // 2. Test: on-route fixes never trigger
  console.log('\n2. Testing that on-route fixes never trigger...');
  let detectorState: OffRouteDetectorState = { consecutiveOffRouteCount: 0 };
  const sampleIndices = [0, 1, Math.floor(routeGeometry.coordinates.length / 2), routeGeometry.coordinates.length - 1];

  for (const idx of sampleIndices) {
    const coord = routeGeometry.coordinates[idx];
    const check = checkOffRoute(
      { lng: coord[0], lat: coord[1], accuracy: 10 },
      routeGeometry,
      detectorState
    );
    detectorState = check.nextState;

    if (check.triggered) {
      throw new Error(`FAIL: On-route fix at index ${idx} triggered reroute unexpectedly`);
    }
    if (check.offRouteDistanceM > 40) {
      throw new Error(`FAIL: On-route fix at index ${idx} reported off-route distance: ${check.offRouteDistanceM}m`);
    }
  }
  console.log('[PASS] On-route fixes never trigger (0 triggers, distances <= 40m, count remains 0)');

  // 3. Test: 2 off-route fixes then 1 on-route fix do not trigger
  console.log('\n3. Testing: 2 off-route fixes then 1 on-route fix do not trigger...');
  const offRoutePos = calculatePerpendicularDivert(routeGeometry, 50, 100);
  const offRouteDist = computeOffRouteDistance(routeGeometry, offRoutePos);
  console.log(`   (Generated synthetic off-route point at distance ~${Math.round(offRouteDist)}m)`);

  detectorState = { consecutiveOffRouteCount: 0 };

  // Fix 1: off-route
  const f1 = checkOffRoute(offRoutePos, routeGeometry, detectorState);
  if (f1.triggered || f1.nextState.consecutiveOffRouteCount !== 1) {
    throw new Error(`FAIL: Fix 1 state mismatch: count=${f1.nextState.consecutiveOffRouteCount}, triggered=${f1.triggered}`);
  }

  // Fix 2: off-route
  const f2 = checkOffRoute(offRoutePos, routeGeometry, f1.nextState);
  if (f2.triggered || f2.nextState.consecutiveOffRouteCount !== 2) {
    throw new Error(`FAIL: Fix 2 state mismatch: count=${f2.nextState.consecutiveOffRouteCount}, triggered=${f2.triggered}`);
  }

  // Fix 3: on-route fix (resets counter)
  const onRouteCoord = routeGeometry.coordinates[0];
  const f3 = checkOffRoute({ lng: onRouteCoord[0], lat: onRouteCoord[1] }, routeGeometry, f2.nextState);
  if (f3.triggered || f3.nextState.consecutiveOffRouteCount !== 0) {
    throw new Error(`FAIL: On-route fix failed to reset counter: count=${f3.nextState.consecutiveOffRouteCount}, triggered=${f3.triggered}`);
  }

  console.log('[PASS] 2 off-route fixes followed by 1 on-route fix reset the counter and did not trigger');

  // 4. Test: 3 consecutive off-route fixes at about 100 m trigger exactly once
  console.log('\n4. Testing: 3 consecutive off-route fixes at ~100m trigger exactly once...');
  detectorState = { consecutiveOffRouteCount: 0 };

  const fix1 = checkOffRoute(offRoutePos, routeGeometry, detectorState);
  if (fix1.triggered || fix1.nextState.consecutiveOffRouteCount !== 1) {
    throw new Error('FAIL: First off-route fix should not trigger');
  }

  const fix2 = checkOffRoute(offRoutePos, routeGeometry, fix1.nextState);
  if (fix2.triggered || fix2.nextState.consecutiveOffRouteCount !== 2) {
    throw new Error('FAIL: Second off-route fix should not trigger');
  }

  const fix3 = checkOffRoute(offRoutePos, routeGeometry, fix2.nextState);
  if (!fix3.triggered) {
    throw new Error('FAIL: Third consecutive off-route fix MUST trigger reroute');
  }
  if (fix3.nextState.consecutiveOffRouteCount !== 0) {
    throw new Error('FAIL: Counter should reset to 0 upon trigger');
  }

  console.log('[PASS] 3 consecutive off-route fixes at ~100m triggered exactly once on the 3rd fix');

  // 5. Test: Accuracy check (ignore fixes whose accuracy is above 50 m)
  console.log('\n5. Testing accuracy filtering (> 50m ignored)...');
  const inaccurateFix = { lng: offRoutePos.lng, lat: offRoutePos.lat, accuracy: 75 };
  const accCheck = checkOffRoute(inaccurateFix, routeGeometry, { consecutiveOffRouteCount: 1 });
  if (!accCheck.ignored || accCheck.triggered || accCheck.nextState.consecutiveOffRouteCount !== 1) {
    throw new Error('FAIL: Inaccurate fix (>50m) was not ignored properly');
  }
  console.log('[PASS] Inaccurate fix (>50m) was ignored; counter remained unchanged');

  // 6. Test: second trigger within 15 s is blocked by cooldown
  console.log('\n6. Testing cooldown check (no reroute within 15 s of the last one)...');
  const t0 = 100000;
  const cooldownTripState: RerouteTripState = { rerouteCount: 1, lastRerouteTimeMs: t0 };

  const blockedAt5s = canTriggerReroute(cooldownTripState, t0 + 5000);
  if (blockedAt5s.allowed || blockedAt5s.reason !== 'cooldown') {
    throw new Error(`FAIL: Cooldown check failed at +5s: allowed=${blockedAt5s.allowed}, reason=${blockedAt5s.reason}`);
  }

  const allowedAt16s = canTriggerReroute(cooldownTripState, t0 + 16000);
  if (!allowedAt16s.allowed) {
    throw new Error(`FAIL: Cooldown check failed at +16s: allowed=${allowedAt16s.allowed}`);
  }
  console.log('[PASS] Second trigger within 15 s is blocked by cooldown (allowed after 16 s)');

  // 7. Test: 11th reroute is blocked by the cap (max 10)
  console.log('\n7. Testing per-trip cap (max 10 reroutes)...');
  const capTripState: RerouteTripState = { rerouteCount: 10, lastRerouteTimeMs: null };
  const capCheck = canTriggerReroute(capTripState, Date.now());
  if (capCheck.allowed || capCheck.reason !== 'cap_exceeded') {
    throw new Error(`FAIL: Cap check failed at 10 reroutes: allowed=${capCheck.allowed}, reason=${capCheck.reason}`);
  }
  console.log('[PASS] 11th reroute is blocked by the per-trip cap (max 10)');

  // 8. Test: traffic-improvement check (saving of 120 s does not switch, 300 s does)
  console.log('\n8. Testing traffic-improvement check...');
  const currentDurationS = 1800; // 30 min
  const geomA: RouteGeometry = routeGeometry;
  // Create a different geometry
  const geomB: RouteGeometry = {
    type: 'LineString',
    coordinates: [
      [77.503, 28.472],
      [77.508, 28.475],
      [77.513, 28.478],
    ],
  };

  if (!areGeometriesDifferent(geomA, geomB)) {
    throw new Error('FAIL: Geometries should be different');
  }

  // Saving of 120 s (new duration = 1680 s) -> Should NOT switch (< 180 s)
  const switch120 = shouldTrafficReroute(currentDurationS, 1800 - 120, geomA, geomB);
  if (switch120) {
    throw new Error('FAIL: An ETA saving of 120 s should NOT switch routes');
  }

  // Saving of 300 s (new duration = 1500 s) -> SHOULD switch (>= 180 s and >= 10%)
  const switch300 = shouldTrafficReroute(currentDurationS, 1800 - 300, geomA, geomB);
  if (!switch300) {
    throw new Error('FAIL: An ETA saving of 300 s MUST switch routes');
  }

  // Same geometry with 300 s saving -> Should NOT switch because geometry is identical
  const switchSameGeom = shouldTrafficReroute(currentDurationS, 1800 - 300, geomA, geomA);
  if (switchSameGeom) {
    throw new Error('FAIL: Traffic reroute should NOT switch when geometry is identical');
  }
  console.log('[PASS] An ETA saving of 120 s does not switch; 300 s does; identical geometry does not switch');

  // 9. Test: Multi-stop projected distance filtering
  console.log('\n9. Testing multi-stop remaining waypoints filtering...');
  const stop1 = { lng: routeGeometry.coordinates[1][0], lat: routeGeometry.coordinates[1][1] };
  const stop2 = { lng: destination[0], lat: destination[1] };
  const userPtNearStart = { lng: origin[0], lat: origin[1] };

  const remainingBefore = getRemainingWaypoints(routeGeometry, userPtNearStart, [stop1, stop2]);
  if (remainingBefore.length !== 2) {
    throw new Error(`FAIL: Expected 2 remaining stops at start, got ${remainingBefore.length}`);
  }

  // When user is near the final destination, intermediate stop1 is passed
  const userPtNearEnd = { lng: destination[0], lat: destination[1] };
  const remainingAfter = getRemainingWaypoints(routeGeometry, userPtNearEnd, [stop1, stop2]);
  if (remainingAfter.length !== 1 || remainingAfter[0].lng !== stop2.lng) {
    throw new Error(`FAIL: Expected only final stop remaining near destination, got ${remainingAfter.length}`);
  }
  console.log('[PASS] Multi-stop remaining waypoints correctly filters passed stops along route line');

  // 10. Test: Simulator Divert & Restart explicitly
  console.log('\n10. Testing simulator Divert & explicit Restart along new geometry...');
  const simStore = useSimulationStore.getState();
  simStore.startSimulation(routeGeometry);

  const initialSimPos = useSimulationStore.getState().simulatedPosition;
  if (!initialSimPos) {
    throw new Error('FAIL: Simulator initial position was null');
  }

  // Trigger divert
  simStore.divert();
  const divertedState = useSimulationStore.getState();
  if (!divertedState.isDiverted || !divertedState.divertedPosition) {
    throw new Error('FAIL: Simulator divert did not set isDiverted and divertedPosition');
  }
  const divertDist = computeOffRouteDistance(routeGeometry, divertedState.divertedPosition);
  if (divertDist < 80 || divertDist > 120) {
    throw new Error(`FAIL: Diverted position distance is out of expected ~100m range: ${divertDist}m`);
  }

  // Trigger restart along new geometry (reroute)
  simStore.restartAlongRoute(geomB);
  const restartedState = useSimulationStore.getState();
  if (restartedState.isDiverted) {
    throw new Error('FAIL: restartAlongRoute should reset isDiverted to false');
  }
  if (restartedState.currentDistanceM !== 0) {
    throw new Error('FAIL: restartAlongRoute should reset currentDistanceM to 0');
  }
  if (
    restartedState.simulatedPosition?.lng !== geomB.coordinates[0][0] ||
    restartedState.simulatedPosition?.lat !== geomB.coordinates[0][1]
  ) {
    throw new Error('FAIL: restartAlongRoute position does not match start of new geometry');
  }

  simStore.stopSimulation();
  console.log('[PASS] Simulator Divert sets 100m off-route stationary position; restartAlongRoute resets and starts at 0m of new geometry');

  console.log('\n=== ALL SUB-PHASE 6.2 TESTS PASSED SUCCESSFULLY! ===\n');
}

runTests().catch((err) => {
  console.error('\nTEST SUITE FAILED:\n', err);
  process.exit(1);
});
