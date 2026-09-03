/**
 * The pre-login activities: the mnemonic block every pre-login page carries,
 * the "Find a Doctor" open-scheduling shell, and the guest price-estimate
 * pages.
 *
 * Real instances render these as the login shell (header, footer, the
 * antiforgery token) with the activity's data inlined in a script block for
 * the page JS to pick up. The markup below keeps exactly the parts a scraper
 * reads — the `addMnemonic` lines, the token input, the `$$WP.Estimates.*`
 * assignments and the `var model = {...}` — in the form real pages emit them.
 */

import { generateCsrfToken } from '@/lib/csrf';
import { FACILITIES, PRELOGIN_MNEMONICS, SERVICE_AREAS } from '@/data/prelogin';

import { MP } from './layout';

/**
 * The `$$WP.Strings.addMnemonic(...)` block, in the two forms real pages use:
 * plain literals for HTML values, `HTMLUnencode("…")` for text ones, with
 * `ABSOLUTEURL` reflecting the current mount.
 */
export function preloginMnemonicsScript(): string {
  const lines = [
    `$$WP.Strings.addMnemonic("@MYCHART@ABSOLUTEURL@",HTMLUnencode("${MP()}/"), false, "Global");`,
    `$$WP.Strings.addMnemonic("@MYCHART@LOCALIZEDURL@",HTMLUnencode("${MP()}/en-US/"), false, "Global");`,
  ];
  for (const [name, { value, unencode }] of Object.entries(PRELOGIN_MNEMONICS)) {
    lines.push(
      unencode
        ? `$$WP.Strings.addMnemonic("@MYCHART@${name}@",HTMLUnencode("${value}"), false, "Global");`
        : `$$WP.Strings.addMnemonic("@MYCHART@${name}@","${value}", false, "Global", $$WP.Strings.EncodingTypes.None)`,
    );
  }
  return `<script type="text/javascript">\n${lines.join('\n')}\n</script>`;
}

function csrfInput(token: string): string {
  return `<div class='hidden' style='display:none' id='__CSRFContainer'><input name="__RequestVerificationToken" type="hidden" value="${token}" /></div>`;
}

function preloginShell(title: string, activity: string, script: string): string {
  const token = generateCsrfToken();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <title>MyChart - ${title}</title>
  <meta charset="utf-8" />
</head>
<body class="isPrelogin">
  ${csrfInput(token)}
  ${preloginMnemonicsScript()}
  <div id="wrapper">${activity}</div>
  ${script}
  <div class="copyright" lang="en">MyChart&reg; licensed from Epic Systems Corporation &copy; 1999 - 2026</div>
</body>
</html>`;
}

/** `GET /<mount>/OpenScheduling` — the anonymous scheduling workflow shell. */
export function openSchedulingPage(): string {
  return preloginShell(
    'Schedule an Appointment',
    '<div id="scheduling-workflow-container"></div>',
    `<script type="text/javascript">
  $(function () { var data = {}; var initialDataPool = null; data["isAnonymous"] = "" !== "True"; data["workflow"] = "NewProvider";  new $$WP.Scheduling.SchedulingController($afe.select("#scheduling-workflow-container"), data, null, initialDataPool); });
</script>`,
  );
}

/** `GET /<mount>/GuestEstimates/SelectServiceArea` — billing entities, inlined. */
export function guestEstimatesServiceAreaPage(): string {
  return preloginShell(
    'Patient Estimates',
    '<h1>Patient Estimates</h1><h2>Where do you want to have your procedure done?</h2><div id="essRecentSAList"><div class="row"></div></div><div id="essOtherSAList"><div class="row"></div></div>',
    `<script type="text/javascript">
  $$WP.Estimates.RecentSAs = [];
  $$WP.Estimates.OtherSAs = ${JSON.stringify(SERVICE_AREAS)};
  $$WP.Estimates.Back = "False";
  $$WP.Estimates.IsShopper = true;
  $(function () { var estimatesServiceAreaController = new $$WP.Estimates.EstimatesServiceAreaController(''); });
</script>`,
  );
}

/** `GET /<mount>/GuestEstimates/SelectLocation?svcArea=…` — the facilities under one entity. */
export function guestEstimatesLocationPage(serviceAreaId: string, isMultiServiceArea: boolean): string {
  const model = {
    Locations: FACILITIES,
    IsMultiServiceArea: isMultiServiceArea,
    ServiceArea: serviceAreaId,
    IsGuest: true,
    HasCompletedCaptcha: false,
    Template: '',
  };
  return preloginShell(
    'Patient Estimates',
    '<h1>Patient Estimates</h1><h2>Which location?</h2><div id="essLocationList"></div>',
    `<script type="text/javascript">
  $(function () { var model = ${JSON.stringify(model)}; var estimatesLocationController = new $$WP.Estimates.EstimatesLocationController('', model); });
</script>`,
  );
}
