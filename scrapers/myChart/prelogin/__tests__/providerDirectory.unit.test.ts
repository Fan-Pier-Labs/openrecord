/**
 * The "Find a Doctor" crawl, against fixtures cut from a live capture (names,
 * addresses and ids replaced) and a per-session transport so the real URL
 * building, headers and mount prefix are all exercised.
 */
import { describe, expect, it } from 'bun:test';

import { createMockRequest, htmlResponse, jsonResponse, pageWithCsrfToken } from '../../auth/__tests__/mockMyChartRequest';
import { PreloginEndpointError } from '../preloginSession';
import {
  fetchProviderDirectory,
  mergeSpecialtyData,
  parseFeatures,
  parseSpecialties,
  selectSpecialties,
  type RawSpecialtyData,
  type RawWorkflowData,
} from '../providerDirectory';
import type { Clinic, Provider } from '../types';
import workflowFixture from './fixtures/GetSchedulingWorkflowData.json';
import specialtyFixture from './fixtures/GetSpecialtyData.json';

const workflow = workflowFixture as unknown as RawWorkflowData;
const specialtyData = specialtyFixture as unknown as RawSpecialtyData;

function mockScheduling(specialtyHandler = () => jsonResponse(specialtyData)) {
  return createMockRequest(
    {
      '/OpenScheduling': () => htmlResponse(pageWithCsrfToken('tok-open')),
      '/Scheduling/Anonymous/GetSchedulingWorkflowData': () => jsonResponse(workflow),
      '/Scheduling/Anonymous/GetSpecialtyData': specialtyHandler,
    },
    { firstPathPart: 'MyChart-SGH' },
  );
}

describe('parseSpecialties / parseFeatures', () => {
  it('lists the specialties the workflow offers', () => {
    expect(parseSpecialties(workflow).map((s) => s.name)).toEqual(['Primary Care', 'Cardiology', 'Dermatology']);
  });

  it('throws rather than reporting no specialties when the shape changes', () => {
    expect(() => parseSpecialties({ WorkflowSettings: null } as unknown as RawWorkflowData)).toThrow(/Specialties/);
  });

  it('reads the feature flags with conservative defaults', () => {
    expect(parseFeatures(workflow)).toEqual({
      selfSignup: false,
      loginEnabled: true,
      openScheduling: true,
      scheduleAsGuest: true,
      onMyWay: true,
      onDemandVideoVisits: false,
    });
    expect(parseFeatures({ WorkflowSettings: null, Specialties: [] })).toMatchObject({ loginEnabled: true, openScheduling: true });
  });
});

describe('mergeSpecialtyData', () => {
  it('maps providers and clinics, joining them through the pairs', () => {
    const providers = new Map<string, Provider>();
    const clinics = new Map<string, Clinic>();
    mergeSpecialtyData(specialtyData, { id: 'S1', name: 'Primary Care' }, providers, clinics);

    expect(providers.size).toBe(3);
    expect(clinics.size).toBe(2);

    const homer = [...providers.values()].find((p) => p.name === 'Homer Simpson, MD')!;
    expect(homer).toMatchObject({
      nameLastFirst: 'Simpson, Homer J, MD',
      credentials: 'Physician',
      specialties: ['Internal Medicine'],
      gender: 'Male',
      languages: ['English'],
      photoUrl: 'https://example.invalid/photo.jpg',
      bioSlug: 'HomerSimpsonMD',
      finderSpecialties: ['Primary Care'],
      searchTerms: ['Primary Care'],
    });
    expect(homer.clinicIds).toHaveLength(1);
    expect(clinics.get(homer.clinicIds[0]!)).toMatchObject({
      name: 'Springfield Family Medicine',
      addressLines: ['742 Evergreen Terrace', 'Suite 100', 'Springfield OR 97475'],
      phone: '555-010-0100',
      coordinates: { latitude: 44.05, longitude: -123.09 },
      timeZone: 'America/Chicago',
    });

    const marge = [...providers.values()].find((p) => p.name === 'Marge Bouvier, NP')!;
    expect(marge.languages).toEqual(['English', 'Spanish']);
    expect(marge.photoUrl).toBeNull();
  });

  it('dedupes a provider listed under two specialties and unions their clinics', () => {
    const providers = new Map<string, Provider>();
    const clinics = new Map<string, Clinic>();
    mergeSpecialtyData(specialtyData, { id: 'S1', name: 'Primary Care' }, providers, clinics);
    const second = {
      ...specialtyData,
      ProviderDepartmentPairs: specialtyData.ProviderDepartmentPairs.map((p) => ({
        ...p,
        DepartmentId: specialtyData.Departments[1]!.ID,
      })),
    };
    mergeSpecialtyData(second, { id: 'S2', name: 'Cardiology' }, providers, clinics);

    expect(providers.size).toBe(3);
    const homer = [...providers.values()].find((p) => p.name === 'Homer Simpson, MD')!;
    expect(homer.finderSpecialties).toEqual(['Primary Care', 'Cardiology']);
    expect(homer.clinicIds).toHaveLength(2);
  });

  it('leaves searchTerms off a provider from an older build that has none', () => {
    const providers = new Map<string, Provider>();
    const older = {
      ...specialtyData,
      Providers: specialtyData.Providers.map(({ SpecialtySearchTerms: _drop, ...p }) => p),
    };
    mergeSpecialtyData(older, { id: 'S1', name: 'Primary Care' }, providers, new Map());
    expect([...providers.values()].every((p) => !('searchTerms' in p))).toBe(true);
  });

  it('prefers the override phone when the org switched it on', () => {
    const clinics = new Map<string, Clinic>();
    const overridden = {
      ...specialtyData,
      Departments: [{ ...specialtyData.Departments[0]!, OverridePhoneNumber: '555-010-0999', IsUsingOverridePhoneNumber: true }],
    };
    mergeSpecialtyData(overridden, { id: 'S1', name: 'Primary Care' }, new Map(), clinics);
    expect([...clinics.values()][0]!.phone).toBe('555-010-0999');
  });

  it('throws rather than reporting an empty directory when the shape changes', () => {
    expect(() =>
      mergeSpecialtyData({ Departments: [] } as unknown as RawSpecialtyData, { id: 'S1', name: 'x' }, new Map(), new Map()),
    ).toThrow(/Providers/);
  });
});

describe('selectSpecialties', () => {
  const all = parseSpecialties(workflow);

  it('filters by name or id, case-insensitively, and caps the count', () => {
    expect(selectSpecialties(all, { specialties: ['cardiology'] }).map((s) => s.name)).toEqual(['Cardiology']);
    expect(selectSpecialties(all, { specialties: [all[2]!.id] }).map((s) => s.name)).toEqual(['Dermatology']);
    expect(selectSpecialties(all, { maxSpecialties: 2 }).map((s) => s.name)).toEqual(['Primary Care', 'Cardiology']);
    expect(selectSpecialties(all, {})).toHaveLength(3);
  });
});

describe('fetchProviderDirectory', () => {
  it('opens the workflow page, then posts the form-encoded calls with its token', async () => {
    const { req, callTo, callsTo } = mockScheduling();
    const directory = await fetchProviderDirectory(req);

    const bootstrap = callTo('/Scheduling/Anonymous/GetSchedulingWorkflowData');
    expect(bootstrap.url).toBe('https://mychart.example.org/MyChart-SGH/Scheduling/Anonymous/GetSchedulingWorkflowData');
    expect(bootstrap.method).toBe('POST');
    expect(bootstrap.body).toBe('schedulingParameters%5Bworkflow%5D=NewProvider&isFirstLoad=true');
    expect(bootstrap.headers['__RequestVerificationToken']).toBe('tok-open');
    expect(bootstrap.headers['Content-Type']).toBe('application/x-www-form-urlencoded; charset=UTF-8');
    expect(bootstrap.headers['Referer']).toBe('https://mychart.example.org/MyChart-SGH/OpenScheduling');

    const perSpecialty = callsTo('/Scheduling/Anonymous/GetSpecialtyData');
    expect(perSpecialty.map((c) => c.body)).toEqual(workflow.Specialties.map((s) => `SpecialtyId=${encodeURIComponent(s.Id)}`));

    expect(directory.organizationName).toBe('Springfield General Hospital');
    expect(directory.specialties).toHaveLength(3);
    // The same three providers come back for every specialty; they dedupe.
    expect(directory.providers).toHaveLength(3);
    expect(directory.providers[0]!.finderSpecialties).toEqual(['Primary Care', 'Cardiology', 'Dermatology']);
    expect(directory.clinics).toHaveLength(2);
  });

  it('crawls only the specialties asked for', async () => {
    const { req, callsTo } = mockScheduling();
    const directory = await fetchProviderDirectory(req, { specialties: ['Dermatology'] });
    expect(callsTo('/Scheduling/Anonymous/GetSpecialtyData')).toHaveLength(1);
    expect(directory.specialties).toHaveLength(3);
    expect(directory.providers[0]!.finderSpecialties).toEqual(['Dermatology']);
  });

  it("surfaces the November 2025 redirect dance as one error, not as data", async () => {
    const { req } = mockScheduling(() =>
      new Response(null, { status: 302, headers: { Location: '/MyChart-SGH/Home/FiveHundred?aspxerrorpath=x' } }),
    );
    await expect(fetchProviderDirectory(req)).rejects.toBeInstanceOf(PreloginEndpointError);
  });

  it('surfaces the August 2025 bare 500 the same way', async () => {
    const { req } = mockScheduling(() => htmlResponse('<html><body>An error has occurred.</body></html>', 500));
    await expect(fetchProviderDirectory(req)).rejects.toThrow(/refused \(500/);
  });

  it('refuses to call the endpoint when the page issued no token', async () => {
    const { req } = createMockRequest({
      '/OpenScheduling': () => htmlResponse('<html><body>no token here</body></html>'),
    });
    await expect(fetchProviderDirectory(req)).rejects.toThrow(/antiforgery token/);
  });
});
