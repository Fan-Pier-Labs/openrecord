import { afterEach, describe, expect, it } from 'bun:test';
import {
  getFailingEndpoints,
  getResponseDelaySeconds,
  isFailingEndpoint,
  normalizeEndpointPath,
  resetFailingEndpoints,
  responseDelay,
  setFailingEndpoints,
  setResponseDelaySeconds,
} from '../outage';

describe('failing endpoints knob', () => {
  afterEach(() => resetFailingEndpoints());

  it('matches the way the route tables do: no leading slash, any case, no query', () => {
    setFailingEndpoints(['/api/allergies/LoadAllergies?noCache=1']);
    expect(getFailingEndpoints()).toEqual(['api/allergies/loadallergies']);
    expect(isFailingEndpoint('api/allergies/loadallergies')).toBe(true);
    expect(isFailingEndpoint('API/Allergies/LoadAllergies')).toBe(true);
    // Whole path only — a sibling endpoint keeps working.
    expect(isFailingEndpoint('api/allergies/loadallergies/extra')).toBe(false);
    expect(isFailingEndpoint('clinical/allergies')).toBe(false);
  });

  it('starts empty, drops blanks, and clears on reset', () => {
    expect(getFailingEndpoints()).toEqual([]);
    setFailingEndpoints(['', '  ', '/']);
    expect(getFailingEndpoints()).toEqual([]);
    setFailingEndpoints(['api/medications/getmedications']);
    resetFailingEndpoints();
    expect(isFailingEndpoint('api/medications/getmedications')).toBe(false);
  });

  it('normalizes a bare path', () => {
    expect(normalizeEndpointPath('/Clinical/CareTeam/Load')).toBe('clinical/careteam/load');
  });
});

describe('response delay knob', () => {
  afterEach(() => resetFailingEndpoints());

  it('starts at zero, never goes negative, and clears on reset', () => {
    expect(getResponseDelaySeconds()).toBe(0);
    setResponseDelaySeconds(-5);
    expect(getResponseDelaySeconds()).toBe(0);
    setResponseDelaySeconds(110);
    expect(getResponseDelaySeconds()).toBe(110);
    resetFailingEndpoints();
    expect(getResponseDelaySeconds()).toBe(0);
  });

  it('holds a request for the configured time and not at all by default', async () => {
    let before = Date.now();
    await responseDelay();
    expect(Date.now() - before).toBeLessThan(50);

    setResponseDelaySeconds(0.05);
    before = Date.now();
    await responseDelay();
    expect(Date.now() - before).toBeGreaterThanOrEqual(45);
  });
});
