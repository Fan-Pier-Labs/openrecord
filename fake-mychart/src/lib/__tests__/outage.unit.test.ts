// Copyright (c) Fan Pier Labs. Use of this software is governed by the LICENSE file in the project root.

import { afterEach, describe, expect, it } from 'bun:test';
import {
  getFailingEndpoints,
  getResponseDelaySeconds,
  isFailingEndpoint,
  needsRequestText,
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

  it('fails only the requests whose query or body carries the text, for a {path, contains} entry', () => {
    setFailingEndpoints([{ path: '/api/test-results/GetDetails', contains: 'ORD-2' }]);
    expect(getFailingEndpoints()).toEqual([{ path: 'api/test-results/getdetails', contains: 'ORD-2' }]);
    expect(needsRequestText('api/test-results/getdetails')).toBe(true);
    expect(needsRequestText('api/test-results/getlist')).toBe(false);
    expect(isFailingEndpoint('api/test-results/getdetails', '{"orderKey":"ORD-2"}')).toBe(true);
    // A sibling item on the same endpoint keeps answering.
    expect(isFailingEndpoint('api/test-results/getdetails', '{"orderKey":"ORD-1"}')).toBe(false);
    expect(isFailingEndpoint('api/test-results/getdetails')).toBe(false);
    // Case-sensitive: the text is usually an id.
    expect(isFailingEndpoint('api/test-results/getdetails', '{"orderKey":"ord-2"}')).toBe(false);
  });

  it('keeps both kinds of entry, drops an empty contains, and clears both on reset', () => {
    setFailingEndpoints(['api/allergies/LoadAllergies', { path: 'billing/details/getvisits', contains: 'id=A2' }, { path: 'x', contains: '' }]);
    expect(getFailingEndpoints()).toEqual(['api/allergies/loadallergies', { path: 'billing/details/getvisits', contains: 'id=A2' }]);
    resetFailingEndpoints();
    expect(getFailingEndpoints()).toEqual([]);
    expect(needsRequestText('billing/details/getvisits')).toBe(false);
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
