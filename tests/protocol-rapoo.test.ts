import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { decodeStatusReport, prepareDpiExperiment, verifyDpiExperiment } from '../packages/protocol-rapoo/src/index.ts';

const capture = JSON.parse(readFileSync(new URL('../research/captures/mt760-dpi-write-20261017T154052865924Z.json', import.meta.url), 'utf8'));
const raw = (state: string, key: string) => Uint8Array.from(Buffer.from(capture[state].rawResponses[key], 'hex'));

test('DPI packets and verification match the physical experiment including its restoration', () => {
  const experiment = prepareDpiExperiment(raw('before', 'dpi-list'), raw('before', 'polling-rate'));
  assert.equal(Buffer.from(experiment.applyReport).toString('hex'), capture.events[0].requestHex);
  assert.equal(Buffer.from(experiment.restoreReport).toString('hex'), capture.events[1].requestHex);
  for (const [state, restored] of [['after', false], ['afterPowerCycle', false], ['restored', true]] as const) {
    verifyDpiExperiment(experiment, raw(state, 'dpi-list'), raw(state, 'polling-rate'), restored);
  }
  assert.throws(() => verifyDpiExperiment(experiment, raw('before', 'dpi-list'), raw('before', 'polling-rate'), false));
  assert(Object.isFrozen(experiment.applyReport));
});

test('DPI preparation and verification reject active stages, invalid values and inconsistent preserved fields', () => {
  for (const [offset, value] of [[0, 2], [4, 21], [6, 0], [18, 7], [19, 1], [20, 0]] as const) {
    const dpi = raw('before', 'dpi-list'); dpi[offset] = value;
    assert.throws(() => prepareDpiExperiment(dpi, raw('before', 'polling-rate')));
  }
  assert.throws(() => prepareDpiExperiment(raw('before', 'dpi-list').slice(1), raw('before', 'polling-rate')));
  const experiment = prepareDpiExperiment(raw('before', 'dpi-list'), raw('before', 'polling-rate'));
  const changed = raw('after', 'polling-rate'); changed[4] ^= 1;
  assert.throws(() => verifyDpiExperiment(experiment, raw('after', 'dpi-list'), changed, false));
});

test('BB status uses the six-byte WebHID payload, rejects malformed samples and leaves power state raw', () => {
  const payload = Uint8Array.from([0xb0, 1, 0x60, 9, 0xfe, 99]);
  assert.deepEqual(decodeStatusReport(0xbb, payload), { dpi: 2400, batteryPercent: 99, powerStateCode: 0xfe });
  assert.equal(decodeStatusReport(0xba, payload), null);
  assert.equal(decodeStatusReport(0xbb, Uint8Array.from([0xbb, ...payload])), null);
  for (const [offset, value] of [[0, 0], [1, 0], [5, 101], [3, 0xff]] as const) {
    const invalid = payload.slice(); invalid[offset] = value;
    assert.equal(decodeStatusReport(0xbb, invalid), null);
  }
});

test('DPI sent by the browser persists and the restored configuration survives another physical cycle', () => {
  const physical = JSON.parse(readFileSync(new URL('../research/captures/mt760-dpi-write-20261103T000453855236Z.json', import.meta.url), 'utf8'));
  const bytes = (state: string, key: string) => Uint8Array.from(Buffer.from(physical[state].rawResponses[key], 'hex'));
  const experiment = prepareDpiExperiment(bytes('before', 'dpi-list'), bytes('before', 'polling-rate'));
  assert.equal(physical.webApply.outcome, 'sent-unverified');
  assert.equal(physical.userPowerCycle.configurationReSent, false);
  assert.equal(physical.restoredPowerCycle.configurationReSent, false);
  for (const [state, restored] of [['after', false], ['afterPowerCycle', false], ['restored', true], ['restoredAfterPowerCycle', true]] as const) {
    verifyDpiExperiment(experiment, bytes(state, 'dpi-list'), bytes(state, 'polling-rate'), restored);
  }
  assert.deepEqual(physical.events.map((event: {operation: string}) => event.operation), ['restore']);
});
