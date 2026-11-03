import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createServer } from 'vite';
import { benchFilesPlugin } from '../apps/web/bench-files.ts';

test('development bench serves files created after startup and returns JSON errors instead of SPA fallback', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rapoo-bench-files-'));
  const server = await createServer({configFile: false, root, plugins: [benchFilesPlugin()], logLevel: 'silent',
    server: {host: '127.0.0.1', port: 0, watch: {ignored: ['**/.bench/**']}}, optimizeDeps: {noDiscovery: true}});
  try {
    await server.listen();
    const address = server.httpServer!.address(); assert(address && typeof address !== 'string');
    const origin = `http://127.0.0.1:${address.port}`;
    const missing = await fetch(origin + '/bench/polling-current.json');
    assert.equal(missing.status, 404); assert.match(missing.headers.get('content-type')!, /application\/json/);
    await mkdir(join(root, '.bench'));
    await writeFile(join(root, '.bench/polling-baseline.json'), JSON.stringify({version: 1}));
    const first = await fetch(origin + '/bench/polling-baseline.json');
    assert.equal(first.headers.get('cache-control'), 'no-store'); assert.deepEqual(await first.json(), {version: 1});
    await writeFile(join(root, '.bench/polling-baseline.json'), JSON.stringify({version: 2}));
    assert.deepEqual(await fetch(origin + '/bench/polling-baseline.json?fresh=1').then(r => r.json()), {version: 2});
    assert.equal((await fetch(origin + '/bench/private.json')).status, 404);
    assert.equal((await fetch(origin + '/bench/polling-baseline.json', {method: 'POST'})).status, 405);
    await writeFile(join(root, '.bench/current.json'), '<!doctype html>');
    const malformed = await fetch(origin + '/bench/current.json');
    assert.equal(malformed.status, 500); assert.match(malformed.headers.get('content-type')!, /application\/json/);
  } finally {await server.close(); await rm(root, {recursive: true, force: true});}
});
