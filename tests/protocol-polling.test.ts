import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { decodePollingRate, preparePollingExperiment, verifyPollingExperiment } from '../packages/protocol-rapoo/src/index.ts';

const capture = JSON.parse(readFileSync(new URL('../research/captures/mt760-native-polling-rate.json', import.meta.url), 'utf8'));
const response = (index: number) => Uint8Array.from(Buffer.from(capture.samples[index].responseBufferHex, 'hex')).slice(0, 28);
const dpi = () => response(1);
const polling = () => response(0);

test('polling decoder uses the wireless field of the physical capture and keeps unknown codes unknown', () => {
  assert.deepEqual(decodePollingRate(polling(), dpi()), {pollingRateCode: 1, pollingRateHz: 1000});
  for (const [code, hz] of [[8, 125], [4, 250], [2, 500], [1, 1000], [3, null]] as const) {
    const data = polling(); data[5] = code;
    assert.deepEqual(decodePollingRate(data, dpi()), {pollingRateCode: code, pollingRateHz: hz});
  }
  const adjacent = polling(); adjacent[4] = 8;
  assert.equal(decodePollingRate(adjacent, dpi()).pollingRateHz, 1000);
});

test('polling decoder rejects errors, truncated data and mismatched overlapping blocks', () => {
  assert.throws(() => decodePollingRate(polling().slice(1), dpi()));
  assert.throws(() => decodePollingRate(polling(), dpi().slice(1)));
  for (const offset of [0, 12, 27]) {
    const data = polling(); data[offset] ^= 1;
    assert.throws(() => decodePollingRate(data, dpi()));
  }
  const invalidDpi = dpi(); invalidDpi[0] = 2;
  assert.throws(() => decodePollingRate(polling(), invalidDpi));
});

test('bounded polling experiment preserves wired and reserved fields, DPI and the original buffers', () => {
  const beforeDpi = dpi(), beforePolling = polling();
  const experiment = preparePollingExperiment(beforeDpi, beforePolling);
  assert.equal(Buffer.from(experiment.applyReport).toString('hex'), 'baa5a504300600000202ffff' + '00'.repeat(20));
  assert.equal(Buffer.from(experiment.restoreReport).toString('hex'), 'baa5a504300600000201ffff' + '00'.repeat(20));
  assert.deepEqual(experiment.originalDpi, Array.from(dpi()));
  assert.deepEqual(experiment.originalPolling, Array.from(polling()));
  beforeDpi.fill(0); beforePolling.fill(0);
  assert(Object.isFrozen(experiment.applyReport));
  const after = polling(); after[5] = 2;
  verifyPollingExperiment(experiment, dpi(), after, false);
  verifyPollingExperiment(experiment, dpi(), polling(), true);
  assert.throws(() => verifyPollingExperiment(experiment, dpi(), polling(), false));
  assert.throws(() => verifyPollingExperiment(experiment, dpi(), after, true));
});

test('polling experiment refuses an ineligible baseline and detects changes outside the target byte', () => {
  for (const code of [2, 3, 0x81]) {
    const data = polling(); data[5] = code;
    assert.throws(() => preparePollingExperiment(dpi(), data));
  }
  const badDpi = dpi(); badDpi[20] = 7;
  assert.throws(() => preparePollingExperiment(badDpi, polling()));
  const experiment = preparePollingExperiment(dpi(), polling());
  for (const offset of [4, 6, 7, 8, 11]) {
    const data = polling(); data[5] = 2; data[offset] ^= 1;
    assert.throws(() => verifyPollingExperiment(experiment, dpi(), data, false));
  }
  const changedDpi = dpi(); changedDpi[20] = 1;
  const after = polling(); after[5] = 2;
  assert.throws(() => verifyPollingExperiment(experiment, changedDpi, after, false));
  const reserved = polling(); reserved[6] = 0x45; reserved[7] = 0x67;
  const preserved = preparePollingExperiment(dpi(), reserved);
  assert.deepEqual(preserved.applyReport.slice(8, 12), [2, 2, 0x45, 0x67]);
});

test('real WebHID polling and power-cycle captures satisfy application and restoration verification', () => {
  for (const filename of ['mt760-polling-write-20261102T235549803369Z.json', 'mt760-polling-write-20261102T235829897263Z.json']) {
    const physical = JSON.parse(readFileSync(new URL(`../research/captures/${filename}`, import.meta.url), 'utf8'));
    const bytes = (snapshot: {rawResponses: Record<string, string>}, key: string) => Uint8Array.from(Buffer.from(snapshot.rawResponses[key], 'hex'));
    const experiment = preparePollingExperiment(bytes(physical.before, 'dpi-list'), bytes(physical.before, 'polling-rate'));
    assert.equal(physical.webApply.outcome, 'sent-unverified');
    for (const event of physical.events) {
      if (event.snapshot) verifyPollingExperiment(experiment, bytes(event.snapshot, 'dpi-list'), bytes(event.snapshot, 'polling-rate'), event.operation !== 'verify-applied');
      if (event.operation === 'native-recovery') assert.equal(Buffer.from(experiment.restoreReport).toString('hex'), event.requestHex);
    }
    if (physical.powerCycle) {
      assert.equal(physical.powerCycle.confirmedByUser, true);
      assert.equal(physical.powerCycle.configurationReSent, false);
      assert.equal(physical.restoredPowerCycle.configurationReSent, false);
      assert.equal(physical.events[physical.powerCycle.verificationEventIndex].snapshot.pollingRateHz, 500);
      assert.equal(physical.events[physical.restoredPowerCycle.verificationEventIndex].snapshot.pollingRateHz, 1000);
    } else {
      assert.equal(physical.webRestore.operation, 'restore');
      assert(!physical.events.some((event: {operation: string}) => event.operation === 'native-recovery'));
    }
  }
});
