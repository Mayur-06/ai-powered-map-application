import assert from 'node:assert';
import {
  rateLimit,
  getClientIp,
  cleanupOldEntries,
  getRateLimitStoreSize,
  resetRateLimits,
  checkDailyCap,
  incrementDailyCap,
  resetDailyCap,
} from '../lib/rateLimit';

function runTests() {
  console.log('--- Running Rate Limiter and Daily Cap Test Suite ---');

  // Test 1: 13th call in a minute is blocked
  {
    resetRateLimits();
    const key = '192.168.1.100';
    const baseTime = 1_700_000_000_000; // arbitrary timestamp

    console.log('Test 1: 12 requests in a minute allowed, 13th blocked...');
    for (let i = 0; i < 12; i++) {
      const res = rateLimit(key, baseTime + i * 1000);
      assert.strictEqual(res.allowed, true, `Request ${i + 1} should be allowed`);
    }

    // 13th request within the same 60 seconds
    const blockedRes = rateLimit(key, baseTime + 12_000);
    assert.strictEqual(blockedRes.allowed, false, '13th request should be blocked');
    assert.ok(
      blockedRes.retryAfterSeconds > 0,
      `retryAfterSeconds should be positive, got ${blockedRes.retryAfterSeconds}`
    );
    console.log(`  PASSED: 13th call blocked with retryAfterSeconds = ${blockedRes.retryAfterSeconds}s`);
  }

  // Test 2: Calls are allowed again after the minute window
  {
    resetRateLimits();
    const key = '192.168.1.100';
    const baseTime = 1_700_000_000_000;

    // Send 12 requests: 0s, 1s, ..., 11s
    for (let i = 0; i < 12; i++) {
      rateLimit(key, baseTime + i * 1000);
    }

    // Check at 12s - blocked
    assert.strictEqual(rateLimit(key, baseTime + 12_000).allowed, false);

    // Advance fake time past 60s after the 1st request (60,001 ms)
    const afterWindowTime = baseTime + 60_001;
    const afterWindowRes = rateLimit(key, afterWindowTime);
    assert.strictEqual(
      afterWindowRes.allowed,
      true,
      'Call after sliding 1-minute window should be allowed'
    );
    console.log('  PASSED: Calls allowed again after sliding window expires');
  }

  // Test 3: Different keys do not affect each other
  {
    resetRateLimits();
    const keyA = '10.0.0.1';
    const keyB = '10.0.0.2';
    const baseTime = 1_700_000_000_000;

    // Exhaust keyA
    for (let i = 0; i < 12; i++) {
      rateLimit(keyA, baseTime + i * 500);
    }
    assert.strictEqual(rateLimit(keyA, baseTime + 6000).allowed, false, 'Key A should be blocked');

    // Key B makes a request at the exact same time
    const resB = rateLimit(keyB, baseTime + 6000);
    assert.strictEqual(
      resB.allowed,
      true,
      'Key B should be allowed regardless of Key A state'
    );
    console.log('  PASSED: Different keys operate independently');
  }

  // Test 4: Old entries are removed so memory does not grow without bound
  {
    resetRateLimits();
    const staleKey1 = 'stale-ip-1';
    const staleKey2 = 'stale-ip-2';
    const baseTime = 1_700_000_000_000;

    rateLimit(staleKey1, baseTime);
    rateLimit(staleKey2, baseTime);
    assert.strictEqual(getRateLimitStoreSize(), 2, 'Store should hold 2 keys initially');

    // Advance time past 1 hour (3,600,001 ms)
    const futureTime = baseTime + 3_600_001;
    const purged = cleanupOldEntries(futureTime);
    assert.strictEqual(purged, 2, 'Both expired keys should be purged');
    assert.strictEqual(getRateLimitStoreSize(), 0, 'Store size should be 0 after cleanup');

    // Also test automatic cleanup triggered during a check
    rateLimit('stale-ip-3', baseTime);
    assert.strictEqual(getRateLimitStoreSize(), 1);
    // Active user arrives past 1 hour - triggers automatic cleanup
    rateLimit('active-ip', baseTime + 3_600_001 + 61_000);
    // stale-ip-3 must be purged, active-ip remains
    assert.strictEqual(getRateLimitStoreSize(), 1, 'Only active key should remain');
    console.log('  PASSED: Expired entries are safely purged from memory');
  }

  // Test 5: 150 requests per hour limit
  {
    resetRateLimits();
    const key = '192.168.1.200';
    const baseTime = 1_700_000_000_000;

    // Send 150 requests spaced across 50 minutes (3 per minute, well under 12/min limit)
    for (let i = 0; i < 150; i++) {
      const time = baseTime + i * 20_000; // every 20 seconds
      const res = rateLimit(key, time);
      assert.strictEqual(res.allowed, true, `Request ${i + 1} within hour should be allowed`);
    }

    // 151st request within the 1-hour window
    const hourlyBlocked = rateLimit(key, baseTime + 150 * 20_000);
    assert.strictEqual(hourlyBlocked.allowed, false, '151st request in 1 hour should be blocked');
    assert.ok(hourlyBlocked.retryAfterSeconds > 0, 'Hourly retryAfterSeconds should be > 0');
    console.log(`  PASSED: 150/hour limit enforced, 151st blocked (retryAfter = ${hourlyBlocked.retryAfterSeconds}s)`);
  }

  // Test 6: getClientIp extracts first x-forwarded-for IP or returns 'unknown'
  {
    const reqWithForwarded = new Request('http://localhost/api/chat', {
      headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178' },
    });
    assert.strictEqual(getClientIp(reqWithForwarded), '203.0.113.195');

    const reqWithoutForwarded = new Request('http://localhost/api/chat');
    assert.strictEqual(getClientIp(reqWithoutForwarded), 'unknown');
    console.log('  PASSED: Client IP header extraction verified');
  }

  // Test 7: Global daily cap and UTC day rollover
  {
    resetDailyCap();
    // Use a fixed UTC timestamp: 2026-11-16 10:00:00 UTC
    const day1Time = Date.parse('2026-11-16T10:00:00.000Z');

    // Check default cap allows initial requests
    assert.strictEqual(checkDailyCap(day1Time).allowed, true);

    // Simulate reaching the daily cap (400 requests)
    for (let i = 0; i < 400; i++) {
      incrementDailyCap(day1Time);
    }

    // 401st request on the same UTC day
    const blockedDaily = checkDailyCap(day1Time);
    assert.strictEqual(blockedDaily.allowed, false, 'Request exceeding daily cap should be blocked');

    // Advance time to next UTC day: 2026-11-17 00:00:01 UTC
    const day2Time = Date.parse('2026-11-17T00:00:01.000Z');
    const day2Res = checkDailyCap(day2Time);
    assert.strictEqual(day2Res.allowed, true, 'Daily cap should reset on UTC date rollover');
    console.log('  PASSED: Daily cap enforcement and UTC date reset verified');
  }

  console.log('\nAll rate limit and daily cap tests passed successfully! [OK]');
}

runTests();
