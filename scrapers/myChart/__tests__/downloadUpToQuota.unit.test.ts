import { describe, expect, it } from 'bun:test';
import { downloadUpToQuota } from '../eunity/imagingDirectDownload';

/**
 * The imaging download budget must count successes, not attempts: eUnity
 * instance lists can lead with pseudo-instances (the viewer's SeriesSelector
 * entries) that fail every pixel request, and a budget spent on attempts
 * downloads exactly those and returns zero images.
 */
describe('downloadUpToQuota', () => {
  const items = (n: number) => Array.from({ length: n }, (_, i) => i);

  it('keeps going past failing entries until the quota is met', async () => {
    // First 3 entries are junk — the real-world shape that motivated this.
    const attempted: number[] = [];
    const { succeeded } = await downloadUpToQuota(items(20), 3, 5, async (i) => {
      attempted.push(i);
      return i >= 3;
    });
    expect(succeeded).toBe(3);
    // 3 junk + 3 real; batches sized to the remaining quota, so exactly 6 tried.
    expect(attempted.length).toBe(6);
  });

  it('never returns more successes than the quota, even mid-batch', async () => {
    const { succeeded, attempted } = await downloadUpToQuota(items(20), 3, 5, async () => true);
    expect(succeeded).toBe(3);
    expect(attempted).toBe(3);
  });

  it('stops after exhausting the list when everything fails', async () => {
    const { succeeded, attempted } = await downloadUpToQuota(items(7), 3, 5, async () => false);
    expect(succeeded).toBe(0);
    expect(attempted).toBe(7);
  });

  it('attempts every item when the quota is Infinity', async () => {
    const { succeeded, attempted } = await downloadUpToQuota(items(12), Infinity, 5, async (i) => i % 2 === 0);
    expect(succeeded).toBe(6);
    expect(attempted).toBe(12);
  });

  it('does nothing for an empty list', async () => {
    const { succeeded, attempted } = await downloadUpToQuota([], 3, 5, async () => true);
    expect(succeeded).toBe(0);
    expect(attempted).toBe(0);
  });

  it('runs at most `concurrency` downloads in flight at once', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    await downloadUpToQuota(items(20), Infinity, 4, async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      return false;
    });
    expect(maxInFlight).toBe(4);
  });

  it('propagates a rejection instead of hanging or mis-counting', async () => {
    // downloadOne in production catches its own errors and returns false;
    // if one ever escapes, the helper should fail loudly, not stall.
    const result = downloadUpToQuota(items(4), 2, 2, async (i) => {
      if (i === 0) throw new Error('boom');
      return true;
    });
    await expect(result).rejects.toThrow('boom');
  });
});
