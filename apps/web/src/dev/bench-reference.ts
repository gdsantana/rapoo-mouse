export type BenchKind = 'dpi' | 'polling';

export async function fetchBenchReference(kind: BenchKind, name: 'baseline' | 'current'): Promise<unknown> {
  const path = `/bench/${kind === 'polling' ? 'polling-' : ''}${name}.json`;
  const response = await fetch(path, {cache: 'no-store'});
  if (!response.ok) throw new Error(`Bench reference unavailable (${response.status}): ${path}`);
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new Error(`Bench reference is not JSON: ${path}. Prepare a fresh native reference`);
  }
  try { return await response.json(); }
  catch { throw new Error(`Bench reference contains invalid JSON: ${path}`); }
}
