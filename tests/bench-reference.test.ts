import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchBenchReference } from '../apps/web/src/dev/bench-reference.ts';

test('bench references reject SPA HTML and missing/malformed JSON before configuration is prepared', async () => {
  const original = globalThis.fetch;
  try {
    for (const [response, error] of [
      [new Response('<!doctype html>', {headers: {'Content-Type': 'text/html'}}), /not JSON.*polling-baseline/],
      [Response.json({error: 'Missing'}, {status: 404}), /unavailable.*404/],
      [new Response('{', {headers: {'Content-Type': 'application/json'}}), /invalid JSON/],
    ] as const) {
      globalThis.fetch = async () => response;
      await assert.rejects(fetchBenchReference('polling', 'baseline'), error);
    }
    globalThis.fetch = async (url, init) => {
      assert.equal(url, '/bench/polling-current.json'); assert.equal(init?.cache, 'no-store');
      return Response.json({reference: true});
    };
    assert.deepEqual(await fetchBenchReference('polling', 'current'), {reference: true});
    globalThis.fetch = async url => {assert.equal(url, '/bench/baseline.json'); return Response.json({});};
    await fetchBenchReference('dpi', 'baseline');
  } finally {globalThis.fetch = original;}
});
