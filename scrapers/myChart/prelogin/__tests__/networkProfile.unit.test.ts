/**
 * The one-call entry, end to end over a scripted transport: mount discovery
 * from the bare hostname, the login page for the profile, and the two
 * optional sections failing independently.
 */
import { afterEach, describe, expect, it } from 'bun:test';

import { setTestTransport } from '../../../http';
import { fetchHospitalNetworkProfile } from '../networkProfile';
import specialtyFixture from './fixtures/GetSpecialtyData.json';
import workflowFixture from './fixtures/GetSchedulingWorkflowData.json';
import serviceAreas from './fixtures/serviceAreas.json';

afterEach(() => setTestTransport(null));

const LOGIN_PAGE = `<html><body class="isPrelogin">
<input name="__RequestVerificationToken" type="hidden" value="tok-login" />
<script>
$$WP.Strings.addMnemonic("@MYCHART@APPTITLE@","MySpringfield Chart", false, "Global", $$WP.Strings.EncodingTypes.None)
$$WP.Strings.addMnemonic("@MYCHART@ABSOLUTEURL@",HTMLUnencode("/MyChart-SGH/"), false, "Global");
$$WP.Strings.addMnemonic("@MYCHART@HELPDESKPHONE@","<span dir='ltr'><a href='tel:5550100100'>555-010-0100</a></span>", false, "Global", $$WP.Strings.EncodingTypes.None)
$$WP.Strings.addMnemonic("@MYCHART@ORGNAME@",HTMLUnencode("Springfield General Hospital"), false, "Global");
</script>
<div>Forgot login information?</div>
</body></html>`;

const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
const html = (body: string, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/html' } });

/** A prefixed instance whose root announces the mount with a 302, like most do. */
function springfield(overrides: Record<string, (init: RequestInit) => Response> = {}) {
  const seen: string[] = [];
  setTestTransport(async (url, init) => {
    const { pathname } = new URL(url);
    seen.push(`${init.method ?? 'GET'} ${pathname}`);
    const route = overrides[pathname];
    if (route) return route(init);
    switch (pathname) {
      case '/':
        return new Response(null, { status: 302, headers: { Location: '/MyChart-SGH/Authentication/Login' } });
      case '/MyChart-SGH/Authentication/Login':
        return html(LOGIN_PAGE);
      case '/MyChart-SGH/OpenScheduling':
        return html('<input name="__RequestVerificationToken" value="tok-open" />');
      case '/MyChart-SGH/Scheduling/Anonymous/GetSchedulingWorkflowData':
        return json(workflowFixture);
      case '/MyChart-SGH/Scheduling/Anonymous/GetSpecialtyData':
        return json(specialtyFixture);
      case '/MyChart-SGH/GuestEstimates':
        return new Response(null, { status: 302, headers: { Location: '/MyChart-SGH/GuestEstimates/SelectServiceArea' } });
      case '/MyChart-SGH/GuestEstimates/SelectServiceArea':
        return html(`<script>$$WP.Estimates.RecentSAs = [];$$WP.Estimates.OtherSAs = ${JSON.stringify([serviceAreas[1]])};</script>`);
      default:
        return html('not found', 404);
    }
  });
  return seen;
}

describe('fetchHospitalNetworkProfile', () => {
  it('discovers the mount, reads the profile, and crawls both optional sections', async () => {
    const seen = springfield();
    const profile = await fetchHospitalNetworkProfile('mychart.example.org');

    expect(profile.hostname).toBe('mychart.example.org');
    expect(profile.mount).toBe('MyChart-SGH');
    expect(profile.profile.organizationName).toBe('Springfield General Hospital');
    expect(profile.profile.phones.helpDesk?.digits).toBe('5550100100');
    expect(profile.directory?.providers).toHaveLength(3);
    expect(profile.directory?.clinics).toHaveLength(2);
    expect(profile.billingEntities).toEqual([
      { id: serviceAreas[1]!.Id, name: 'Shelbyville Physicians Group', phone: '555-010-0400', logoUrl: null, facilities: [] },
    ]);
    expect(profile.insurance.status).toBe('gated');
    expect(profile.warnings).toEqual([]);
    expect(seen.filter((s) => s.startsWith('POST'))).toHaveLength(1 + workflowFixture.Specialties.length);
  });

  it('keeps the contact profile when open scheduling is switched off, and says so', async () => {
    springfield({
      '/MyChart-SGH/Scheduling/Anonymous/GetSchedulingWorkflowData': () =>
        new Response(null, { status: 302, headers: { Location: '/MyChart-SGH/Home/FiveHundred' } }),
    });
    const profile = await fetchHospitalNetworkProfile('mychart.example.org');
    expect(profile.profile.organizationName).toBe('Springfield General Hospital');
    expect(profile.directory).toBeNull();
    expect(profile.billingEntities).toHaveLength(1);
    expect(profile.warnings).toHaveLength(1);
    expect(profile.warnings[0]).toMatch(/Provider directory unavailable/);
  });

  it('can skip the crawl and the billing lookup', async () => {
    const seen = springfield();
    const profile = await fetchHospitalNetworkProfile('mychart.example.org', { includeProviders: false, includeBilling: false });
    expect(profile.directory).toBeNull();
    expect(profile.billingEntities).toBeNull();
    expect(seen.some((s) => s.includes('OpenScheduling') || s.includes('GuestEstimates'))).toBe(false);
  });

  it('refuses a host that does not serve a MyChart login page', async () => {
    springfield({ '/MyChart-SGH/Authentication/Login': () => html('<html><body>Welcome to our hospital</body></html>') });
    await expect(fetchHospitalNetworkProfile('mychart.example.org')).rejects.toThrow(/is it a MyChart instance/);
  });
});
