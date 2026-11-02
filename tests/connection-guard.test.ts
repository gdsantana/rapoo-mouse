import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConnectionGuard } from '../apps/web/src/connection-guard.ts';

test('rejects stale replies and ignores events already included in a newer snapshot', () => {
  const guard = new ConnectionGuard();
  guard.begin();
  assert.equal(guard.changed({generation: 1, available: true}), true);
  assert.equal(guard.accept(0, 'old', 1), false);
  assert.equal(guard.accept(1, 'session-1', 1), true);
  assert.equal(guard.accept(1, 'session-1', 1), false);
  assert.equal(guard.accept(1, 'other', 2), false);
  assert.equal(guard.accept(1, 'session-1', 2), true);
  assert.equal(guard.changed({generation: 1, available: true}), false);
  assert.equal(guard.changed({generation: 2, available: true}), true);
  assert.equal(guard.accept(1, 'session-1', 3), false);
  assert.equal(guard.accept(2, 'session-2', 3), true);
  assert.equal(guard.changed({generation: 3, available: false}), true);
  assert.equal(guard.accept(3, 'session-3', 4), false);
});
