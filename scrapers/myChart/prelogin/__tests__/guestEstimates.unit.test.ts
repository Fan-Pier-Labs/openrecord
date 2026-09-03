/**
 * The guest-estimate pages, with their inlined script data reproduced the way
 * real instances emit it (one-line JSON assignments inside a script block).
 */
import { describe, expect, it } from 'bun:test';

import { createMockRequest, htmlResponse } from '../../auth/__tests__/mockMyChartRequest';
import { fetchBillingEntities, parseLocationModel, parseServiceAreas } from '../guestEstimates';
import locationModel from './fixtures/selectLocationModel.json';
import serviceAreas from './fixtures/serviceAreas.json';

function serviceAreaPage(): string {
  return `<html><body><script type="text/javascript">
    $$WP.Estimates.RecentSAs = [];
    $$WP.Estimates.OtherSAs = ${JSON.stringify(serviceAreas)};
    $$WP.Estimates.Back = "False";
    $$WP.Estimates.IsShopper = true;
    var estimatesServiceAreaController = new $$WP.Estimates.EstimatesServiceAreaController('');
  </script></body></html>`;
}

function locationPage(): string {
  return `<html><body><script type="text/javascript">
    var model = ${JSON.stringify(locationModel)};
    var estimatesLocationController = new $$WP.Estimates.EstimatesLocationController('', model);
  </script></body></html>`;
}

describe('parseServiceAreas', () => {
  it('reads recent and other service areas off the page', () => {
    const areas = parseServiceAreas(serviceAreaPage())!;
    expect(areas.map((a) => a.Title)).toEqual(['Springfield General Hospital', 'Shelbyville Physicians Group']);
  });

  it('includes a recent area ahead of the others', () => {
    // A function replacer: `$$` in a replacement string is itself a pattern.
    const page = serviceAreaPage().replace(
      '$$WP.Estimates.RecentSAs = [];',
      () => `$$WP.Estimates.RecentSAs = ${JSON.stringify([serviceAreas[1]])};`,
    );
    expect(parseServiceAreas(page)!.map((a) => a.Title)[0]).toBe('Shelbyville Physicians Group');
  });

  it('returns null for a page that is not the service-area step', () => {
    expect(parseServiceAreas('<html><body>Login Page</body></html>')).toBeNull();
  });
});

describe('parseLocationModel', () => {
  it('reads the model, which says whether a captcha still stands in the way', () => {
    const model = parseLocationModel(locationPage())!;
    expect(model.HasCompletedCaptcha).toBe(false);
    expect(model.Locations!.map((l) => l.Title)).toEqual([
      'Springfield General Hospital Main Campus',
      'Springfield Outpatient Center',
    ]);
  });

  it('returns null when there is no model', () => {
    expect(parseLocationModel('<html></html>')).toBeNull();
  });
});

describe('fetchBillingEntities', () => {
  it('follows the entry redirect, then reads facilities only for areas that group by location', async () => {
    const { req, callsTo } = createMockRequest({
      '/GuestEstimates': () =>
        new Response(null, { status: 302, headers: { Location: '/MyChart/GuestEstimates/SelectServiceArea' } }),
      '/GuestEstimates/SelectServiceArea': () => htmlResponse(serviceAreaPage()),
      '/GuestEstimates/SelectLocation': () => htmlResponse(locationPage()),
    });
    const entities = await fetchBillingEntities(req);

    expect(entities).toEqual([
      {
        id: serviceAreas[0]!.Id,
        name: 'Springfield General Hospital',
        phone: '555-010-0300',
        logoUrl: null,
        facilities: locationModel.Locations.map((l) => ({ id: l.Id, name: l.Title })),
      },
      { id: serviceAreas[1]!.Id, name: 'Shelbyville Physicians Group', phone: '555-010-0400', logoUrl: null, facilities: [] },
    ]);

    const locationCalls = callsTo('/GuestEstimates/SelectLocation');
    expect(locationCalls).toHaveLength(1);
    expect(new URL(locationCalls[0]!.url).searchParams.get('svcArea')).toBe(serviceAreas[0]!.Id);
  });

  it('reports null when the instance has the estimate tool switched off', async () => {
    const { req } = createMockRequest({
      '/GuestEstimates': () => htmlResponse('<html><body class="isPrelogin">Login Page</body></html>'),
    });
    expect(await fetchBillingEntities(req)).toBeNull();
  });
});
