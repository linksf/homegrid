import { describe, expect, it } from 'vitest';
import { createEmptyJob } from '../../domain/defaults';
import { exportJob, importJob } from '../file-io';

async function blobToText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe('file-io', () => {
  it('exportJob + importJob roundtrips', async () => {
    const job = createEmptyJob('Export me');
    const blob = exportJob(job);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/json');
    const json = await blobToText(blob);
    expect(JSON.parse(json).schemaVersion).toBe(1);
    expect(importJob(json)).toEqual(job);
  });

  it('importJob rejects unknown schema version', () => {
    expect(() =>
      importJob(JSON.stringify({ schemaVersion: 0, job: createEmptyJob() })),
    ).toThrow('Unsupported schema');
  });
});
