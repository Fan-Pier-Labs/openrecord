/**
 * The pre-login scrapers over real HTTP against fake-mychart, on both mounts
 * and both captured Epic releases.
 *
 * The unit tests cover the parsers; this covers what only a socket
 * exercises — mount discovery from the bare host, the antiforgery token
 * round-tripping into a form-encoded POST, the entry redirect of the
 * estimate flow, and the fake refusing a token-less call with the release's
 * own error surface.
 *
 * Requires fake-mychart running on FAKE_MYCHART_HOST (default localhost:4000).
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { MyChartRequest } from '../../core/myChartRequest';
import { resetFakeMyChart, setMountMode } from '../../__tests__/fake-mychart/mountMode';
import { fetchHospitalNetworkProfile } from '../networkProfile';
import { fetchSchedulingWorkflow } from '../providerDirectory';

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000';

async function setEpicVersion(version: 'November 2025' | 'August 2025'): Promise<void> {
  const res = await fetch(`http://${HOST}/mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ epicVersion: version }),
  });
  if (!res.ok) throw new Error(`setEpicVersion failed: ${res.status}`);
}

describe('hospital network profile over HTTP', () => {
  beforeAll(async () => {
    await resetFakeMyChart(HOST);
  });
  afterAll(async () => {
    await resetFakeMyChart(HOST);
  });

  it('builds the whole profile from a bare hostname', async () => {
    const profile = await fetchHospitalNetworkProfile(HOST, { protocol: 'http' });

    expect(profile.mount).toBe('MyChart');
    expect(profile.profile).toEqual({
      organizationName: 'Springfield General Hospital',
      portalBrand: 'MyChart',
      mountPath: '/MyChart/',
      phones: {
        helpDesk: { display: '555-010-0100', digits: '5550100100' },
        scheduling: { display: '555-010-0200', digits: '5550100200' },
        billing: null,
      },
      supportEmail: null,
    });

    const directory = profile.directory!;
    expect(directory.specialties.map((s) => s.name)).toEqual(['Primary Care', 'Cardiology', 'Dermatology']);
    expect(directory.providers.map((p) => p.name).sort()).toEqual([
      'Cardio Carlson, MD',
      'Julius Hibbert, MD',
      'Marvin Monroe, NP',
      'Nick Riviera, MD',
    ]);
    const hibbert = directory.providers.find((p) => p.name === 'Julius Hibbert, MD')!;
    expect(hibbert.finderSpecialties).toEqual(['Primary Care', 'Cardiology']);
    expect(hibbert.clinicIds).toHaveLength(1);
    expect(directory.clinics.map((c) => c.name).sort()).toEqual(['Shelbyville Clinic', 'Springfield Family Medicine']);
    expect(directory.clinics.find((c) => c.name === 'Shelbyville Clinic')?.phone).toBe('555-010-0301');
    expect(directory.features).toMatchObject({ selfSignup: false, loginEnabled: true, openScheduling: true, onMyWay: true });

    expect(profile.billingEntities).toEqual([
      {
        id: expect.any(String),
        name: 'Springfield General Hospital',
        phone: '555-010-0400',
        logoUrl: null,
        facilities: [
          { id: expect.any(String), name: 'Springfield General Hospital Main Campus' },
          { id: expect.any(String), name: 'Springfield Outpatient Center' },
        ],
      },
      { id: expect.any(String), name: 'Shelbyville Physicians Group', phone: '555-010-0500', logoUrl: null, facilities: [] },
    ]);
    expect(profile.insurance.status).toBe('gated');
    expect(profile.warnings).toEqual([]);
  });

  it('works the same on a root-mounted instance', async () => {
    await setMountMode(HOST, 'root');
    try {
      const profile = await fetchHospitalNetworkProfile(HOST, { protocol: 'http', specialties: ['Cardiology'] });
      expect(profile.mount).toBeNull();
      expect(profile.profile.mountPath).toBe('/');
      expect(profile.directory?.providers.map((p) => p.name).sort()).toEqual(['Cardio Carlson, MD', 'Julius Hibbert, MD']);
      expect(profile.billingEntities).toHaveLength(2);
    } finally {
      await setMountMode(HOST, 'prefixed');
    }
  });

  it('reads the same directory on both releases; only the newer one carries search terms', async () => {
    await setEpicVersion('August 2025');
    const legacy = await fetchHospitalNetworkProfile(HOST, { protocol: 'http', includeBilling: false });
    await setEpicVersion('November 2025');
    const modern = await fetchHospitalNetworkProfile(HOST, { protocol: 'http', includeBilling: false });

    expect(legacy.directory!.providers.every((p) => !('searchTerms' in p))).toBe(true);
    expect(modern.directory!.providers.every((p) => Array.isArray(p.searchTerms))).toBe(true);

    const strip = (p: { searchTerms?: string[] }) => {
      const { searchTerms: _drop, ...rest } = p;
      return rest;
    };
    expect(legacy.directory!.providers.map(strip)).toEqual(modern.directory!.providers.map(strip));
    expect(legacy.directory!.clinics).toEqual(modern.directory!.clinics);
    expect(legacy.profile).toEqual(modern.profile);
  });

  it('is refused with the release error surface when the token is missing, on both releases', async () => {
    const request = new MyChartRequest(HOST, { protocol: 'http' });
    request.setFirstPathPart('MyChart');
    const call = () =>
      request.makeRequest({
        method: 'POST',
        path: '/Scheduling/Anonymous/GetSchedulingWorkflowData',
        body: 'schedulingParameters%5Bworkflow%5D=NewProvider&isFirstLoad=true',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        followRedirects: false,
      });

    const modern = await call();
    expect(modern.status).toBe(302);
    expect(modern.headers.get('location')).toContain('/Home/FiveHundred');

    await setEpicVersion('August 2025');
    try {
      const legacy = await call();
      expect(legacy.status).toBe(500);
    } finally {
      await setEpicVersion('November 2025');
    }

    // With the token, the same call answers.
    const { data } = await fetchSchedulingWorkflow(request);
    expect(data.Specialties).toHaveLength(3);
  });
});
