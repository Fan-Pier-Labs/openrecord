/**
 * The NPI Registry scraper over real HTTP, against fake-mychart's stand-in for
 * npiregistry.cms.hhs.gov — what the `lookup_npi` and `search_npi_registry`
 * capabilities run.
 *
 * The unit tests cover parsing and URL building with a scripted transport.
 * What only a socket exercises is the contract the scraper reads *around* the
 * body: that a refused query arrives as HTTP 200 carrying `Errors` rather than
 * a 4xx, and that an unheld number arrives as an empty result set rather than
 * a 404. Both would look like a working search to a client that guessed.
 *
 * Nothing here reaches CMS: every request goes to `apiUrl`.
 *
 * Requires fake-mychart running on FAKE_MYCHART_HOST (default localhost:4000).
 */

import { beforeAll, describe, expect, it } from 'bun:test';

import { resetFakeMyChart } from '../../myChart/__tests__/fake-mychart/mountMode';
import {
  fetchNpiLookupRaw,
  fetchNpiSearchRaw,
  isNpiRegistryErrors,
  npiLookupProcessor,
  npiSearchProcessor,
  type NpiProviderStandard,
  type NpiSearchStandard,
} from '../npiRegistry';

const HOST = process.env.FAKE_MYCHART_HOST ?? 'localhost:4000';
const OPTIONS = { apiUrl: `http://${HOST}/npiregistry/api/` };

/** Homer's PCP, and the one number the fake registry holds for a person. */
const HIBBERT_NPI = '1234567893';
/** Well-formed (correct check digit) and held by nobody. */
const UNHELD_NPI = '1912345679';

describe('NPI Registry over HTTP', () => {
  beforeAll(async () => {
    await resetFakeMyChart(HOST);
  });

  it('looks up one provider by number', async () => {
    const standard = npiLookupProcessor.standard(await fetchNpiLookupRaw(HIBBERT_NPI, OPTIONS));
    expect(isNpiRegistryErrors(standard)).toBe(false);
    const provider = standard as NpiProviderStandard;
    expect(provider.number).toBe(HIBBERT_NPI);
    expect(provider.enumeration_type).toBe('NPI-1');
    expect(provider.providerName).toBe('JULIUS M HIBBERT, M.D.');
    expect(provider.primarySpecialty).toBe('Internal Medicine');
    // Derived from the LOCATION address, not the mailing one.
    expect(provider.primaryAddress).toBe(
      '742 EVERGREEN MEDICAL PLAZA SUITE 400, SPRINGFIELD, OR 974750000',
    );
    expect(provider.primaryPhone).toBe('555-010-0100');
  });

  it('carries the arrays the live API always sends, even when empty', async () => {
    const standard = (await fetchNpiLookupRaw(HIBBERT_NPI, OPTIONS).then((raw) =>
      npiLookupProcessor.standard(raw),
    )) as NpiProviderStandard;
    expect(standard.taxonomies).toHaveLength(2);
    expect(standard.addresses).toHaveLength(2);
    // Present and empty is what CMS returns; absent would let a client ship a
    // `?.` it never needed and hide a real shape change later.
    expect(standard.practiceLocations).toEqual([]);
    expect(standard.identifiers).toEqual([]);
    expect(standard.other_names).toEqual([]);
    expect(standard.endpoints).toEqual([]);
  });

  it('answers an unheld number with null, not an error', async () => {
    // The registry has no 404 for this: it is a successful search with zero
    // results, and `null` is the only honest rendering.
    expect(npiLookupProcessor.standard(await fetchNpiLookupRaw(UNHELD_NPI, OPTIONS))).toBeNull();
  });

  it('refuses a malformed number before spending a request', async () => {
    await expect(fetchNpiLookupRaw('123', OPTIONS)).rejects.toThrow(/not a valid NPI/);
  });

  it('searches by name and by specialty', async () => {
    const byName = npiSearchProcessor.standard(
      await fetchNpiSearchRaw({ lastName: 'hibbert' }, OPTIONS),
    ) as NpiSearchStandard;
    expect(byName.result_count).toBe(1);
    expect(byName.results[0]?.number).toBe(HIBBERT_NPI);

    // Taxonomy descriptions match on substring, so "Medicine" finds both the
    // internist and nothing else in this dataset.
    const bySpecialty = npiSearchProcessor.standard(
      await fetchNpiSearchRaw({ specialty: 'Internal Medicine' }, OPTIONS),
    ) as NpiSearchStandard;
    expect(bySpecialty.results.map((r) => r.number)).toEqual([HIBBERT_NPI]);
  });

  it('reads an organization, whose `basic` has a different key set entirely', async () => {
    const found = npiSearchProcessor.standard(
      await fetchNpiSearchRaw({ organizationName: 'SPRINGFIELD GENERAL HOSPITAL' }, OPTIONS),
    ) as NpiSearchStandard;
    const org = found.results[0]!;
    expect(org.enumeration_type).toBe('NPI-2');
    // No first/last name to join — the organization's legal name is the name.
    expect(org.providerName).toBe('SPRINGFIELD GENERAL HOSPITAL');
    expect(org.basic.organization_name).toBe('SPRINGFIELD GENERAL HOSPITAL');
    expect(org.basic.authorized_official_last_name).toBe('BURNS');
    expect(org.basic.first_name).toBeNull();
  });

  it('passes a refusal through as data, over HTTP 200', async () => {
    // The whole reason the scraper does not branch on `response.ok`: CMS
    // refuses with a 200 and an `Errors` array. A client that treated this as
    // an empty result would tell a patient their doctor is not registered.
    const raw = await fetchNpiSearchRaw({ state: 'OR' }, OPTIONS);
    expect(raw.requests[0]?.status).toBe(200);
    const standard = npiSearchProcessor.standard(raw);
    expect(isNpiRegistryErrors(standard)).toBe(true);
    if (!isNpiRegistryErrors(standard)) throw new Error('expected a refusal');
    expect(standard.Errors[0]?.description).toBe('Field state requires additional search criteria.');
  });

  it('refuses a one-character wildcard, and accepts a two-character one', async () => {
    const refused = npiSearchProcessor.standard(await fetchNpiSearchRaw({ lastName: 'H*' }, OPTIONS));
    expect(isNpiRegistryErrors(refused)).toBe(true);

    const accepted = npiSearchProcessor.standard(
      await fetchNpiSearchRaw({ lastName: 'HIB*' }, OPTIONS),
    ) as NpiSearchStandard;
    expect(accepted.results.map((r) => r.number)).toEqual([HIBBERT_NPI]);
  });

  it('pages with limit and skip', async () => {
    const first = npiSearchProcessor.standard(
      await fetchNpiSearchRaw({ city: 'SPRINGFIELD', limit: 1 }, OPTIONS),
    ) as NpiSearchStandard;
    expect(first.results).toHaveLength(1);

    const second = npiSearchProcessor.standard(
      await fetchNpiSearchRaw({ city: 'SPRINGFIELD', limit: 1, skip: 1 }, OPTIONS),
    ) as NpiSearchStandard;
    expect(second.results).toHaveLength(1);
    expect(second.results[0]?.number).not.toBe(first.results[0]?.number);
  });
});
