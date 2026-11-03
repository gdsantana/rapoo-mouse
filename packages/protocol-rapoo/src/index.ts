// Fixed MT760 receiver experiment. No hardware access or generic memory writes.
export type DpiExperiment = {
  originalDpi: readonly number[];
  originalPolling: readonly number[];
  applyReport: readonly number[];
  restoreReport: readonly number[];
};

function equal(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
  return a.length === b.length && Array.from(a).every((value, index) => value === b[index]);
}

function configuration(dpi: Uint8Array, polling: Uint8Array): void {
  if (dpi.length !== 28 || polling.length !== 28 || dpi[0] !== 1 || polling[0] !== 1
    || !equal(polling.slice(12, 28), dpi.slice(4, 20))) {
    throw new Error('Invalid or inconsistent configuration responses');
  }
}

export function prepareDpiExperiment(dpi: Uint8Array, polling: Uint8Array): DpiExperiment {
  configuration(dpi, polling);
  const values = Array.from({length: 7}, (_, index) => dpi[4 + index * 2] | (dpi[5 + index * 2] << 8));
  if (values[0] !== 20 || values.some(value => value < 1 || value > 80)
    || dpi[18] < 1 || dpi[18] > 6 || dpi[19] !== 0 || dpi[20] === 0 || dpi[20] > dpi[18]) {
    throw new Error('Configuration is not eligible for the inactive-stage DPI experiment');
  }
  const restore = new Uint8Array(32);
  restore.set([0xba, 0xa5, 0xa5, 0x10, 0x38, 0x06, 0, 0]);
  restore.set(dpi.slice(4, 20), 8);
  const apply = restore.slice(); apply[8] = 21;
  return Object.freeze({
    originalDpi: Object.freeze(Array.from(dpi)), originalPolling: Object.freeze(Array.from(polling)),
    applyReport: Object.freeze(Array.from(apply)), restoreReport: Object.freeze(Array.from(restore)),
  });
}

export function verifyDpiExperiment(experiment: DpiExperiment, dpi: Uint8Array, polling: Uint8Array, restored: boolean): void {
  configuration(dpi, polling);
  const original = prepareDpiExperiment(Uint8Array.from(experiment.originalDpi), Uint8Array.from(experiment.originalPolling));
  const expected = Uint8Array.from(original.originalDpi);
  if (!restored) expected[4] = 21;
  if (!equal(dpi.slice(4), expected.slice(4)) || !equal(polling.slice(4, 12), original.originalPolling.slice(4, 12))) {
    throw new Error('Verification differs from the expected configuration');
  }
}

// Native GET_REPORT(Input) buffers, including status. A future web read path must prove its own framing.
export function decodePollingRate(polling: Uint8Array, dpi: Uint8Array): {pollingRateCode: number; pollingRateHz: number | null} {
  configuration(dpi, polling);
  const rates: Record<number, number | undefined> = {8: 125, 4: 250, 2: 500, 1: 1000};
  return {pollingRateCode: polling[5], pollingRateHz: rates[polling[5]] ?? null};
}

export type PollingExperiment = {
  originalDpi: readonly number[];
  originalPolling: readonly number[];
  applyReport: readonly number[];
  restoreReport: readonly number[];
};

// Bench-only 1000 -> 500 Hz, from the wireless setter's read-modify-write of 0x630..0x633.
export function preparePollingExperiment(dpi: Uint8Array, polling: Uint8Array): PollingExperiment {
  const current = decodePollingRate(polling, dpi);
  const values = Array.from({length: 7}, (_, index) => dpi[4 + index * 2] | (dpi[5 + index * 2] << 8));
  if (current.pollingRateCode !== 1 || dpi[18] > 6 || dpi[20] > dpi[18]
    || values.some(value => value < 1 || value > 80)) throw new Error('Configuration is not eligible for the polling experiment');
  const restore = new Uint8Array(32);
  restore.set([0xba, 0xa5, 0xa5, 4, 0x30, 6, 0, 0]);
  restore.set(polling.slice(4, 8), 8);
  const apply = restore.slice(); apply[9] = 2;
  return Object.freeze({originalDpi: Object.freeze(Array.from(dpi)), originalPolling: Object.freeze(Array.from(polling)),
    applyReport: Object.freeze(Array.from(apply)), restoreReport: Object.freeze(Array.from(restore))});
}

export function verifyPollingExperiment(experiment: PollingExperiment, dpi: Uint8Array, polling: Uint8Array, restored: boolean): void {
  configuration(dpi, polling);
  const original = preparePollingExperiment(Uint8Array.from(experiment.originalDpi), Uint8Array.from(experiment.originalPolling));
  const expected = Uint8Array.from(original.originalPolling);
  if (!restored) expected[5] = 2;
  if (!equal(dpi.slice(4), original.originalDpi.slice(4)) || !equal(polling.slice(4), expected.slice(4))) {
    throw new Error('Verification differs from the expected polling configuration');
  }
}

export type CandidateStatus = { dpi: number; batteryPercent: number; powerStateCode: number };

// DPI correlated with a physical cycle on this unit; battery calibration and power code remain provisional.
// WebHID passes BB as reportId; payload starts at B0, not at BB.
export function decodeStatusReport(reportId: number, payload: Uint8Array): CandidateStatus | null {
  if (reportId !== 0xbb || payload.length !== 6 || payload[0] !== 0xb0 || payload[1] !== 1 || payload[5] > 100) return null;
  const dpi = payload[2] | (payload[3] << 8);
  if (dpi < 50 || dpi > 4000 || dpi % 50 !== 0) return null;
  return { dpi, batteryPercent: payload[5], powerStateCode: payload[4] };
}
