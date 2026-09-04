# Processor layer: example output per capability

**Generated** by `bun dev-scripts/generate-processor-examples.ts` against fake-mychart
(Homer Simpson's chart — fake data, nothing real). Do not edit by hand; re-run the script
after changing a processor. Field decisions are in
[`processor-layer-proposal.md`](processor-layer-proposal.md).

Every read capability this server can answer, in all four modes. Raw and JSON examples longer
than 12,000 characters are cut, and say so. The fake's per-session CSRF token and the
now-based `oldestRenderedDate` and vitals `endInstantIso` request values are pinned so the doc
only changes when the output does. The `public` capabilities are absent: they read CMS's NPI
Registry rather than a MyChart, so this script has nothing to run them against — see
[`scrapers/npi/README.md`](../scrapers/npi/README.md).

## Sizes (characters)

| Capability | raw | json | standard | concise |
| --- | ---: | ---: | ---: | ---: |
| `get_profile` | 35805 | 702 | 1016 | 166 |
| `get_health_summary` | 2312 | 369 | 452 | 342 |
| `get_medications` | 18278 | 6894 | 8910 | 1100 |
| `get_allergies` | 495 | 354 | 442 | 415 |
| `get_health_issues` | 1927 | 969 | 1241 | 297 |
| `get_vitals` | 6406 | 1632 | 1216 | 861 |
| `get_immunizations` | 891 | 601 | 432 | 236 |
| `get_preventive_care` | 14380 | 397 | 311 | 284 |
| `get_medical_history` | 1602 | 1184 | 1286 | 534 |
| `get_goals` | 2528 | 758 | 931 | 931 |
| `get_upcoming_visits` | 6341 | 1982 | 2493 | 620 |
| `get_past_visits` | 130565 | 38752 | 48756 | 11414 |
| `get_visit_notes` | 353 | 352 | 424 | 247 |
| `get_note_content` | 687 | 482 | 497 | 497 |
| `get_visit_avs` | 712 | 497 | 526 | 526 |
| `get_lab_results` | 41884 | 17184 | 21357 | 5340 |
| `get_imaging_results` | 42608 | 5204 | 6084 | 2783 |
| `get_messages` | 8224 | 4413 | 5523 | 3373 |
| `get_message_thread` | 3424 | 1489 | 1807 | 997 |
| `get_message_recipients` | 983 | 862 | 597 | 277 |
| `get_message_topics` | 259 | 239 | 188 | 188 |
| `get_billing` | 40573 | 3476 | 4111 | 1025 |
| `get_insurance` | 14195 | 262 | 292 | 193 |
| `get_insurance_payers` | 1613 | 1936 | 2213 | 502 |
| `get_care_team` | 19281 | 1228 | 878 | 532 |
| `get_referrals` | 414 | 360 | 413 | 264 |
| `get_letters` | 637 | 577 | 503 | 424 |
| `get_letter_details` | 483 | 460 | 475 | 475 |
| `get_documents` | 367 | 367 | 329 | 329 |
| `get_upcoming_orders` | 557 | 427 | 381 | 353 |
| `get_questionnaires` | 260 | 260 | 247 | 247 |
| `get_care_journeys` | 228 | 228 | 264 | 264 |
| `get_activity_feed` | 3220 | 1119 | 1429 | 549 |
| `get_education_materials` | 862 | 463 | 391 | 151 |
| `get_ehi_export` | 524 | 165 | 195 | 122 |
| `get_linked_accounts` | 1738 | 481 | 666 | 223 |
| `get_emergency_contacts` | 2186 | 684 | 838 | 456 |

## Examples

### `get_profile`

Patient profile (name, date of birth, medical record number, primary care provider) plus the account email address.

<details>
<summary><code>mode: raw</code> (35805 chars)</summary>

```json
{
  "requests": [
    {
      "path": "/Home",
      "method": "GET",
      "status": 200,
      "contentType": "text/html; charset=utf-8",
      "body": "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n  <title>MyChart - Home</title>\n  <style>\n* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif; background: #f0f2f5; color: #1a1a2e; }\na { color: #1a6fa5; text-decoration: none; }\na:hover { text-decoration: underline; }\n\n/* Header */\n.mc-header { background: #1a5276; color: #fff; height: 56px; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; position: fixed; top: 0; left: 0; right: 0; z-index: 100; }\n.mc-header .logo { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }\n.mc-header .logo span { color: #5dade2; }\n.mc-header .user-info { display: flex; align-items: center; gap: 16px; font-size: 14px; }\n.mc-header .user-info a { color: #aed6f1; }\n.mc-header .user-info a:hover { color: #fff; }\n\n/* Layout */\n.mc-layout { display: flex; margin-top: 56px; min-height: calc(100vh - 56px); }\n\n/* Sidebar */\n.mc-sidebar { width: 240px; background: #fff; border-right: 1px solid #dde; padding: 16px 0; position: fixed; top: 56px; bottom: 0; overflow-y: auto; }\n.mc-sidebar .nav-group { margin-bottom: 8px; }\n.mc-sidebar .nav-group-title { font-size: 11px; font-weight: 600; text-transform: uppercase; color: #888; padding: 8px 20px 4px; letter-spacing: 0.5px; }\n.mc-sidebar a { display: flex; align-items: center; gap: 10px; padding: 8px 20px; font-size: 14px; color: #333; transition: background 0.15s; }\n.mc-sidebar a:hover { background: #e8f4fd; text-decoration: none; }\n.mc-sidebar a.active { background: #d4eaf7; color: #1a5276; font-weight: 600; border-right: 3px solid #1a5276; }\n.mc-sidebar .nav-icon { width: 18px; text-align: center; font-size: 15px; }\n\n/* Main content */\n.mc-main { margin-left: 240px; flex: 1; padding: 24px 32px; min-width: 0; }\n.mc-main h1 { font-size: 24px; font-weight: 600; margin-bottom: 20px; color: #1a1a2e; }\n.mc-main h2 { font-size: 18px; font-weight: 600; margin: 20px 0 12px; color: #333; }\n\n/* Cards */\n.card { background: #fff; border-radius: 8px; border: 1px solid #e0e0e0; padding: 16px 20px; margin-bottom: 12px; }\n.card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.06); }\n.card h3 { font-size: 16px; font-weight: 600; margin-bottom: 6px; }\n.card .meta { font-size: 13px; color: #666; margin-top: 4px; }\n.card .detail { font-size: 14px; color: #444; margin-top: 4px; }\n\n/* Grid cards */\n.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-bottom: 20px; }\n.card-grid .card { margin-bottom: 0; }\n\n/* Dashboard cards */\n.dash-card { background: #fff; border-radius: 8px; border: 1px solid #e0e0e0; padding: 20px; text-align: center; }\n.dash-card .dash-icon { font-size: 32px; margin-bottom: 8px; }\n.dash-card .dash-value { font-size: 24px; font-weight: 700; color: #1a5276; }\n.dash-card .dash-label { font-size: 13px; color: #666; margin-top: 4px; }\n\n/* Badges */\n.badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }\n.badge-red { background: #fde8e8; color: #c0392b; }\n.badge-yellow { background: #fef9e7; color: #b7950b; }\n.badge-green { background: #e8f8f5; color: #1e8449; }\n.badge-blue { background: #d4eaf7; color: #1a5276; }\n.badge-gray { background: #eee; color: #666; }\n\n/* Tables */\ntable { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; border: 1px solid #e0e0e0; margin-bottom: 16px; }\nth { background: #f7f8fa; text-align: left; padding: 10px 16px; font-size: 13px; font-weight: 600; color: #555; border-bottom: 2px solid #e0e0e0; }\ntd { padding: 10px 16px; font-size: 14px; border-bottom: 1px solid #f0f0f0; }\ntr:last-child td { border-bottom: none; }\ntr:hover td { background: #fafbfc; }\n.abnormal { color: #c0392b; font-weight: 600; }\n\n/* Messages */\n.msg-list { display: flex; flex-direction: column; gap: 2px; }\n.msg-item { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 14px 20px; cursor: pointer; transition: background 0.15s; }\n.msg-item:hover { background: #f0f7fd; }\n.msg-item.unread { border-left: 4px solid #1a5276; }\n.msg-subject { font-weight: 600; font-size: 15px; }\n.msg-preview { font-size: 13px; color: #666; margin-top: 2px; }\n.msg-meta { font-size: 12px; color: #999; margin-top: 4px; }\n.msg-thread { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin-top: 16px; display: none; }\n.msg-thread.visible { display: block; }\n.msg-bubble { padding: 12px 16px; border-radius: 12px; margin-bottom: 8px; max-width: 80%; }\n.msg-bubble.provider { background: #f0f2f5; align-self: flex-start; }\n.msg-bubble.patient { background: #d4eaf7; align-self: flex-end; margin-left: auto; }\n.msg-bubble .author { font-weight: 600; font-size: 13px; margin-bottom: 4px; }\n.msg-bubble .time { font-size: 11px; color: #888; margin-top: 4px; }\n.msg-bubble .body { font-size: 14px; line-height: 1.5; }\n\n/* Tabs */\n.tabs { display: flex; gap: 0; border-bottom: 2px solid #e0e0e0; margin-bottom: 20px; }\n.tab { padding: 10px 20px; font-size: 14px; font-weight: 500; color: #666; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.15s; }\n.tab:hover { color: #1a5276; }\n.tab.active { color: #1a5276; font-weight: 600; border-bottom-color: #1a5276; }\n\n/* Loading */\n.loading { text-align: center; padding: 40px; color: #888; }\n\n/* Print header (scraper compat) */\n.proxy-switcher { position: relative; }\n.proxy-switcher > summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 8px; background: #12405e; border: 1px solid #2e6f9c; color: #fff; padding: 6px 12px; border-radius: 999px; font-size: 14px; }\n.proxy-switcher > summary::-webkit-details-marker { display: none; }\n.proxy-switcher > summary:hover { background: #17527a; }\n.proxy-switcher > summary .proxy-switcher-label { color: #aed6f1; font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; }\n.proxy-switcher > summary .proxy-switcher-caret { color: #aed6f1; font-size: 11px; }\n.proxy-switcher .proxySelectorDropDown { position: absolute; right: 0; top: calc(100% + 8px); background: #fff; border: 1px solid #dde; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.18); min-width: 260px; padding: 6px; z-index: 200; }\n.proxy-switcher .proxySubjectLink { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border-radius: 6px; color: #1a1a2e; text-decoration: none; }\n.proxy-switcher .proxySubjectLink:hover { background: #eef4f9; text-decoration: none; }\n.proxy-switcher .proxySubjectLink.currentContext { background: #e8f4fb; font-weight: 600; }\n.proxy-switcher .proxySubjectLink.currentContext::after { content: 'Viewing'; font-size: 11px; color: #1a6fa5; font-weight: 600; }\n.proxy-switcher .proxy-switcher-heading { padding: 8px 12px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; color: #888; }\n.printheader { font-size: 13px; color: #666; padding: 8px 0; margin-bottom: 16px; border-bottom: 1px solid #e0e0e0; }\n\n/* Letter detail */\n.letter-body { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px; line-height: 1.6; }\n.letter-body h2 { margin: 0 0 12px; }\n.letter-body p { margin: 8px 0; }\n\n/* Vitals chart placeholder */\n.vital-chart { display: flex; align-items: flex-end; gap: 4px; height: 60px; margin-top: 8px; }\n.vital-bar { background: #5dade2; border-radius: 3px 3px 0 0; min-width: 24px; }\n</style>\n</head>\n<body>\n  <div class='hidden' style='display:none' id='__CSRFContainer'><input name=\"__RequestVerificationToken\" type=\"hidden\" value=\"fake-csrf-token-00000000000000000000000000000000\" /></div>\n  <script>\n(function () {\n  var originalFetch = window.fetch;\n  window.fetch = function (url, opts) {\n    opts = opts || {};\n    if ((opts.method || 'GET').toUpperCase() === 'POST') {\n      var el = document.querySelector('#__CSRFContainer input[name=__RequestVerificationToken]');\n      if (el) {\n        opts.headers = opts.headers || {};\n        if (!opts.headers['__RequestVerificationToken']) {\n          opts.headers['__RequestVerificationToken'] = el.value;\n        }\n      }\n    }\n    return originalFetch.call(this, url, opts);\n  };\n})();\n</script>\n  <header class=\"mc-header\">\n    <div class=\"logo\">My<span>Chart</span></div>\n    <div class=\"user-info\">\n      <details class=\"proxy-switcher\">\n      <summary><span class=\"proxy-switcher-label\">Viewing</span><strong>Homer Jay Simpson</strong><span class=\"proxy-switcher-caret\">▾</span></summary>\n      <div class=\"proxySelectorDropDown\">\n        <div class=\"proxy-switcher-heading\">Switch patient record</div>\n        <a class=\"proxySubjectLink currentContext\" data-id=\"WP-2KQZ8XVC5MJH4RTLN9PWY7BDF3SGA6EU1KXNQZ2RVJM8HTCBW5YLDP4FGS7AKEN3QRXZ6UVJ9MTHW1C\" href=\"/MyChart/inside.asp\" aria-label=\"Access your record\"><span class=\"proxySelectorDropDownNameEllipsis\">Homer Jay Simpson</span></a>\n        <a class=\"proxySubjectLink\" data-id=\"WP-7NQK4XZC2VJH8RTLM3PWY6BDF9SGA5EU1KXNQZ7RVJM2HTCBW4YLDP8FGS3AKEN6QRXZ9UVJ5MTHW2C\" href=\"/MyChart/inside.asp?mode=proxyswitch&amp;action=switchcontext&amp;src=0&amp;eid=WP-7NQK4XZC2VJH8RTLM3PWY6BDF9SGA5EU1KXNQZ7RVJM2HTCBW4YLDP8FGS3AKEN6QRXZ9UVJ5MTHW2C\" aria-label=\"Access Bart Simpson's record\"><span class=\"proxySelectorDropDownNameEllipsis\">Bart Simpson</span></a>\n        <a class=\"proxySubjectLink\" data-id=\"WP-3MFTJ9WQ2XKVN7RBZ5HLC8PYDA4GSEU6KMWJ1QRXTV9NZBHFC2LPD7YSGA5EK3UNQXWRJ8MVTZ6HC4\" href=\"/MyChart/inside.asp?mode=proxyswitch&amp;action=switchcontext&amp;src=0&amp;eid=WP-3MFTJ9WQ2XKVN7RBZ5HLC8PYDA4GSEU6KMWJ1QRXTV9NZBHFC2LPD7YSGA5EK3UNQXWRJ8MVTZ6HC4\" aria-label=\"Access Lisa Simpson's record\"><span class=\"proxySelectorDropDownNameEllipsis\">Lisa Simpson</span></a>\n        <a class=\"proxySubjectLink\" data-id=\"WP-9XVKZ2QM7WTNJ5RBH3LFC8PYDA6GSEU4KMWJ1QRXTV2NZBHFC9LPD5YSGA7EK3UNQXWRJ4MVTZ8HC6\" href=\"/MyChart/inside.asp?mode=proxyswitch&amp;action=switchcontext&amp;src=0&amp;eid=WP-9XVKZ2QM7WTNJ5RBH3LFC8PYDA6GSEU4KMWJ1QRXTV2NZBHFC9LPD5YSGA7EK3UNQXWRJ4MVTZ8HC6\" aria-label=\"Access Maggie Simpson's record\"><span class=\"proxySelectorDropDownNameEllipsis\">Maggie Simpson</span></a>\n      </div>\n    </details>\n      <a href=\"/MyChart/Authentication/Login\">Sign out</a>\n    </div>\n  </header>\n  <div class=\"mc-layout\">\n    <nav class=\"mc-sidebar\">\n    <div class=\"nav-group\">\n      <div class=\"nav-group-title\">Overview</div>\n      \n        <a href=\"/MyChart/Home\" class=\"active\">\n          <span class=\"nav-icon\">🏠</span>Home\n        </a>\n      \n        <a href=\"/MyChart/Messaging\" class=\"\">\n          <span class=\"nav-icon\">💬</span>Messages\n        </a>\n      \n        <a href=\"/MyChart/Visits\" class=\"\">\n          <span class=\"nav-icon\">📅</span>Visits\n        </a>\n      \n    </div>\n  \n    <div class=\"nav-group\">\n      <div class=\"nav-group-title\">Health</div>\n      \n        <a href=\"/MyChart/TestResults\" class=\"\">\n          <span class=\"nav-icon\">🧪</span>Test Results\n        </a>\n      \n        <a href=\"/MyChart/Clinical/Medications\" class=\"\">\n          <span class=\"nav-icon\">💊</span>Medications\n        </a>\n      \n        <a href=\"/MyChart/Clinical/Allergies\" class=\"\">\n          <span class=\"nav-icon\">⚠️</span>Allergies\n        </a>\n      \n        <a href=\"/MyChart/Clinical/HealthIssues\" class=\"\">\n          <span class=\"nav-icon\">🩺</span>Health Issues\n        </a>\n      \n        <a href=\"
… (truncated; 26163 more characters)
```

</details>

<details>
<summary><code>mode: standard</code> (1016 chars)</summary>

- **name**: Homer Jay Simpson
- **dob**: 05/12/1956
- **mrn**: 742
- **pcp**: Dr. Julius Hibbert, MD

## SecureCommunicationInfo

- **EmailAddress**: homer.simpson@springfieldnuclear.example.com
- **MobilePhone**: (empty)
- **HomePhone**: (empty)
- **WorkPhone**: (empty)
- **PreferredDevice**: (empty)

## PermanentAddress

- **FormattedValues**: (none)
- **Street**: (empty)
- **City**: (empty)

### State

- **Title**: (empty)
- **Zip**: (empty)

### Country

- **Title**: (empty)
- **HouseNumber**: (empty)
- **Building**: (empty)
- **Floor**: (empty)
- **Unit**: (empty)
- **PhoneNumber**: (none)

## TemporaryAddress

- **FormattedValues**: (none)
- **Street**: (empty)
- **City**: (empty)

### State

- **Title**: (empty)
- **Zip**: (empty)

### Country

- **Title**: (empty)
- **HouseNumber**: (empty)
- **Building**: (empty)
- **Floor**: (empty)
- **Unit**: (empty)
- **PhoneNumber**: (empty)
- **StartDateDisplay**: (none)
- **EndDateDisplay**: (none)
- **StartDateISO**: (empty)
- **EndDateISO**: (empty)

</details>

<details>
<summary><code>mode: concise</code> (166 chars)</summary>

- **name**: Homer Jay Simpson
- **dob**: 05/12/1956
- **mrn**: 742
- **pcp**: Dr. Julius Hibbert, MD
- **EmailAddress**: homer.simpson@springfieldnuclear.example.com

</details>

<details>
<summary><code>mode: json</code> (702 chars)</summary>

```json
{
  "name": "Homer Jay Simpson",
  "dob": "05/12/1956",
  "mrn": "742",
  "pcp": "Dr. Julius Hibbert, MD",
  "SecureCommunicationInfo": {
    "EmailAddress": "homer.simpson@springfieldnuclear.example.com",
    "MobilePhone": ""
  },
  "HomePhone": "",
  "WorkPhone": "",
  "PreferredDevice": "",
  "PermanentAddress": {
    "FormattedValues": [],
    "Street": "",
    "City": "",
    "State": {
      "Title": ""
    },
    "Zip": "",
    "Country": {
      "Title": ""
    },
    "HouseNumber": "",
    "Building": "",
    "Floor": "",
    "Unit": "",
    "PhoneNumber": null
  },
  "TemporaryAddress": {
    "FormattedValues": [],
    "Street": "",
    "City": "",
    "State": {
      "Title": ""
    },
    "Zip": "",
    "Country": {
      "Title": ""
    },
    "HouseNumber": "",
    "Building": "",
    "Floor": "",
    "Unit": "",
    "PhoneNumber": "",
    "StartDateDisplay": null,
    "EndDateDisplay": null,
    "StartDateISO": "",
    "EndDateISO": ""
  }
}
```

</details>

---

### `get_health_summary`

Health summary — vitals snapshot, blood type, smoking status and similar top-level facts.

<details>
<summary><code>mode: raw</code> (2312 chars)</summary>

```json
{
  "requests": [
    {
      "path": "/app/health-summary",
      "method": "GET",
      "status": 200,
      "contentType": "text/html; charset=utf-8",
      "body": "<!DOCTYPE html>\n<html xmlns=\"http://www.w3.org/1999/xhtml\" lang=\"en\" dir=\"ltr\">\n<head>\n  <title>MyChart</title>\n  <meta http-equiv=\"content-type\" content=\"text/html; charset=utf-8\" />\n</head>\n<body>\n  <div class='hidden' id='__CSRFContainer'><input name=\"__RequestVerificationToken\" type=\"hidden\" value=\"fake-csrf-token-00000000000000000000000000000000\" /></div>\n  <script>\n(function () {\n  var originalFetch = window.fetch;\n  window.fetch = function (url, opts) {\n    opts = opts || {};\n    if ((opts.method || 'GET').toUpperCase() === 'POST') {\n      var el = document.querySelector('#__CSRFContainer input[name=__RequestVerificationToken]');\n      if (el) {\n        opts.headers = opts.headers || {};\n        if (!opts.headers['__RequestVerificationToken']) {\n          opts.headers['__RequestVerificationToken'] = el.value;\n        }\n      }\n    }\n    return originalFetch.call(this, url, opts);\n  };\n})();\n</script>\n  <div></div>\n</body>\n</html>",
      "purpose": "token"
    },
    {
      "path": "/api/health-summary/FetchHealthSummary",
      "method": "POST",
      "requestBody": {},
      "status": 200,
      "contentType": "application/json;charset=utf-8",
      "body": {
        "header": {
          "patientAge": "69",
          "height": {
            "value": "6' 0\"",
            "dateRecorded": "01/10/2026"
          },
          "weight": {
            "value": "260 lbs",
            "dateRecorded": "01/10/2026"
          },
          "bloodType": "O+"
        },
        "isPatientAdmitted": false,
        "isProxyContext": false,
        "patientFirstName": "Homer",
        "schoolReportInfo": {
          "schoolReportTitle": "",
          "schoolReportID": ""
        },
        "actionPlans": [],
        "canAccessSharingHub": false,
        "quickLinkDictionary": {
          "HealthIssues": "",
          "Allergies": "",
          "Immunizations": "",
          "Visits": "",
          "PreventiveCare": "",
          "SchoolHealthSummary": "",
          "CareJourneyDetails": "",
          "SendAMessage": "",
          "CareTeam": "",
          "MyConditions": ""
        },
        "conditionList": [],
        "journeyList": []
      }
    },
    {
      "path": "/api/health-summary/FetchH2GHeader",
      "method": "POST",
      "requestBody": {},
      "status": 200,
      "contentType": "application/json;charset=utf-8",
      "body": {
        "lastVisit": {
          "date": "01/10/2026",
          "visitType": "Annual Physical",
          "visitDetailsURL": "",
          "visitCategory": "",
          "openRemotely": false,
          "mode": ""
        },
        "nextVisit": {
          "date": "",
          "visitType": "",
          "visitDetailsURL": "",
          "visitCategory": "",
          "openRemotely": false,
          "mode": ""
        },
        "upcomingVisitsList": [],
        "pastVisitsList": []
      }
    }
  ]
}
```

</details>

<details>
<summary><code>mode: standard</code> (452 chars)</summary>

## header

- **patientAge**: 69
- **bloodType**: O+

### height

- **value**: 6' 0"
- **dateRecorded**: 01/10/2026

### weight

- **value**: 260 lbs
- **dateRecorded**: 01/10/2026
- **patientFirstName**: Homer
- **isPatientAdmitted**: false
- **conditionList**: (none)
- **journeyList**: (none)
- **actionPlans**: (none)

## lastVisit

- **date**: 01/10/2026
- **visitType**: Annual Physical

## nextVisit

- **date**: (empty)
- **visitType**: (empty)

</details>

<details>
<summary><code>mode: concise</code> (342 chars)</summary>

## header

- **patientAge**: 69
- **bloodType**: O+

### height

- **value**: 6' 0"
- **dateRecorded**: 01/10/2026

### weight

- **value**: 260 lbs
- **dateRecorded**: 01/10/2026
- **isPatientAdmitted**: false

## lastVisit

- **date**: 01/10/2026
- **visitType**: Annual Physical

## nextVisit

- **date**: (empty)
- **visitType**: (empty)

</details>

<details>
<summary><code>mode: json</code> (369 chars)</summary>

```json
{
  "header": {
    "patientAge": "69",
    "bloodType": "O+",
    "height": {
      "value": "6' 0\"",
      "dateRecorded": "01/10/2026"
    },
    "weight": {
      "value": "260 lbs",
      "dateRecorded": "01/10/2026"
    }
  },
  "patientFirstName": "Homer",
  "isPatientAdmitted": false,
  "conditionList": [],
  "journeyList": [],
  "actionPlans": [],
  "lastVisit": {
    "date": "01/10/2026",
    "visitType": "Annual Physical"
  },
  "nextVisit": {
    "date": "",
    "visitType": ""
  }
}
```

</details>

---

### `get_medications`

Current medications with dosage, instructions, prescriber and pharmacy.

<details>
<summary><code>mode: raw</code> (18278 chars)</summary>

```json
{
  "communityMembers": [
    {
      "context": 0,
      "isPossiblyFiltered": false,
      "medicationsVerified": false,
      "showPreviousTakingValues": false,
      "isExternal": false,
      "organization": {
        "organizationId": "",
        "organizationName": "",
        "logoUrl": "",
        "isLocal": false,
        "isSSO": false,
        "incompleteH2GSetup": false,
        "address": [],
        "linkType": 0,
        "currentlyLoadingData": false,
        "errorLoadingData": false,
        "hasValidRefreshToken": false,
        "shouldRemindForUpdate": false,
        "showInRefreshBanner": false,
        "disclaimerOverride": false,
        "isMyChartCentral": false
      },
      "prescriptionList": {
        "prescriptions": [
          {
            "target": "",
            "isSigRTL": false,
            "isTranslationFromOrderRTL": false,
            "dateDisplayKey": "",
            "dateToDisplay": "01/15/2026",
            "prescriptionNumber": "",
            "hasFutureStartDate": false,
            "authorizingProvider": {
              "type": 0,
              "hasPhotoOnBlob": false,
              "id": "",
              "name": "Julius Hibbert, MD"
            },
            "orderingProvider": {
              "type": 0,
              "hasPhotoOnBlob": false,
              "id": "",
              "name": "Julius Hibbert, MD"
            },
            "providerDisplayKey": "",
            "showProviderInMedsCard": false,
            "drawProviderDetailsLink": false,
            "isSelected": false,
            "classList": [],
            "isPatientReported": false,
            "showPrescriptionCardBottomDetails": false,
            "showPrescriptionCardBottom": false,
            "showDeleteButton": false,
            "showRefillButton": false,
            "showRefillStatus": false,
            "showWaitingForInsuranceAuth": false,
            "showOrderLevelStatus": false,
            "showBannerMessage": false,
            "showDuplicateWarning": false,
            "showHomeHealthPendingUpdateWarning": false,
            "isAnticoagulationMed": false,
            "isFrequencyPRN": false,
            "criticalMedMessage": "",
            "showSig": false,
            "showPendingUndoDeleteButton": false,
            "showPendingUndoAddButton": false,
            "disableValidation": false,
            "prescriptionListType": 0,
            "organization": {
              "organizationId": "",
              "organizationName": "",
              "logoUrl": "",
              "isLocal": false,
              "isSSO": false,
              "incompleteH2GSetup": false,
              "address": [],
              "linkType": 0,
              "currentlyLoadingData": false,
              "errorLoadingData": false,
              "hasValidRefreshToken": false,
              "shouldRemindForUpdate": false,
              "showInRefreshBanner": false,
              "disclaimerOverride": false,
              "isMyChartCentral": false
            },
            "hasPrescriptionColDetail": false,
            "hasRefillColDetail": false,
            "hasPharmacyColDetail": false,
            "showDrivingDirections": false,
            "showMessagePharmacyAction": false,
            "showCostDetails": false,
            "showPayButton": false,
            "highlightMedIsHidden": false,
            "proxiesWhoCantAccessConfMeds": [],
            "showProxiesWhoCantAccessList": false,
            "showOutpatientPauseWarning": false,
            "outpatientPauseSummary": "",
            "outpatientPauseExtraText": "",
            "outpatientPauseDupMismatchType": 0,
            "refillDetails": {
              "writtenDispenseQuantity": "30",
              "writtenDispenseUnit": "",
              "writtenDispenseAmount": "",
              "daySupply": "30",
              "nextDispenseDate": "",
              "owningPharmacy": {
                "id": "",
                "name": "Kwik-E-Mart Pharmacy",
                "isIntegrated": false,
                "phoneNumber": "(555) 636-2700",
                "formattedAddress": [
                  "742 Evergreen Terrace",
                  "Springfield, NT 49007"
                ],
                "hours": [],
                "supportedDeliveryMethods": [],
                "departmentID": "",
                "hasCreditCardPayments": false,
                "showDrivingDirections": false,
                "isPreferred": false,
                "isPatientMessagingEnabled": false
              },
              "lastDispense": {
                "dispenseQuantity": "",
                "dispenseUnit": "",
                "dispenseAmount": "",
                "dispenseDate": "",
                "amountDue": 0,
                "workRequestFee": 0,
                "workRequestFeeDue": 0,
                "isPaymentValidForDeliveryMethod": false,
                "isRxReady": false,
                "costDetails": {
                  "copay": 0,
                  "formattedCopay": "",
                  "isCopayPending": false,
                  "isBilledToAccount": false,
                  "paymentCards": [],
                  "hasPaymentCard": false
                },
                "dispenseType": 0,
                "delivery": {
                  "shipmentTrackingInfo": [],
                  "formattedAddress": [],
                  "formattedShipDate": ""
                }
              },
              "refillButtonHoverCode": "",
              "refillButtonStatus": 0,
              "refillsRemainingKey": "",
              "refillExpirationDate": "",
              "hasRefillsRemaining": false,
              "refillsRemaining": "",
              "isRefillable": true,
              "refillWarningCode": "",
              "arePharmaciesAvailableForRefill": false,
              "refillStatus": 0,
              "scheduledFillDate": "",
              "externalFillRequestDate": "",
              "showLastDispenseQuantity": false,
              "rxFlags": [],
              "costDetails": {
                "copay": 0,
                "formattedCopay": "",
                "isCopayPending": false,
                "isBilledToAccount": false,
                "paymentCards": [],
                "hasPaymentCard": false
              },
              "currentFillDat": "",
              "doesWorkRequestContainHiddenMed": false
            },
            "formattedDateNoted": "",
            "startDate": "01/15/2026",
            "sig": "Take 1 tablet by mouth as needed for relaxation",
            "sigTranslationFromOrder": "",
            "lastUpdateInstant": "",
            "id": "FAKE-MED-KEY-001",
            "name": "Duff Beer Extract 500mg",
            "patientFriendlyName": {
              "text": "Duff Beer Extract",
              "caption": "",
              "captionType": ""
            },
            "iconPath": "",
            "contentLinkURL": "",
            "pendingUpdateType": 0,
            "isPendingUpdate": false,
            "varianceReason": {
              "comment": "",
              "epic.Core.Data.ICommentable.CommentClientEditable": false
            },
            "varianceComment": "",
            "previousTakingDiffSig": "",
            "isPreviousTakingDiffSigRTL": false,
            "previousTakingDiffSigCSN": "",
            "previousTakingDiffSigInstant": "",
            "isClinicReported": false,
            "medicationKey": "FAKE-MED-KEY-001"
          },
          {
            "target": "",
            "isSigRTL": false,
            "isTranslationFromOrderRTL": false,
            "dateDisplayKey": "",
            "dateToDisplay": "01/15/2026",
            "prescriptionNumber": "",
            "hasFutureStartDate": false,
            "authorizingProvider": {
              "type": 0,
              "hasPhotoOnBlob": false,
              "id": "",
              "name": "Julius Hibbert, MD"
            },
            "orderingProvider": {
              "type": 0,
              "hasPhotoOnBlob": false,
              "id": "",
              "name": "Julius Hibbert, MD"
            },
            "providerDisplayKey": "",
            "showProviderInMedsCard": false,
            "drawProviderDetailsLink": false,
            "isSelected": false,
            "classList": [],
            "isPatientReported": false,
            "showPrescriptionCardBottomDetails": false,
            "showPrescriptionCardBottom": false,
            "showDeleteButton": false,
            "showRefillButton": false,
            "showRefillStatus": false,
            "showWaitingForInsuranceAuth": false,
            "showOrderLevelStatus": false,
            "showBannerMessage": false,
            "showDuplicateWarning": false,
            "showHomeHealthPendingUpdateWarning": false,
            "isAnticoagulationMed": false,
            "isFrequencyPRN": false,
            "criticalMedMessage": "",
            "showSig": false,
            "showPendingUndoDeleteButton": false,
            "showPendingUndoAddButton": false,
            "disableValidation": false,
            "prescriptionListType": 0,
            "organization": {
              "organizationId": "",
              "organizationName": "",
              "logoUrl": "",
              "isLocal": false,
              "isSSO": false,
              "incompleteH2GSetup": false,
              "address": [],
              "linkType": 0,
              "currentlyLoadingData": false,
              "errorLoadingData": false,
              "hasValidRefreshToken": false,
              "shouldRemindForUpdate": false,
              "showInRefreshBanner": false,
              "disclaimerOverride": false,
              "isMyChartCentral": false
            },
            "hasPrescriptionColDetail": false,
            "hasRefillColDetail": false,
            "hasPharmacyColDetail": false,
            "showDrivingDirections": false,
            "showMessagePharmacyAction": false,
            "showCostDetails": false,
            "showPayButton": false,
            "highlightMedIsHidden": false,
            "proxiesWhoCantAccessConfMeds": [],
            "showProxiesWhoCantAccessList": false,
            "showOutpatientPauseWarning": false,
            "outpatientPauseSummary": "",
            "outpatientPauseExtraText": "",
            "outpatientPauseDupMismatchType": 0,
            "refillDetails": {
              "writtenDispenseQuantity": "90",
              "writtenDispenseUnit": "",
              "writtenDispenseAmount": "",
              "daySupply": "90",
              "nextDispenseDate": "",
              "owningPharmacy": {
                "id": "",
                "name": "Kwik-E-Mart Pharmacy",
                "isIntegrated": false,
                "phoneNumber": "(555) 636-2700",
                "formattedAddress": [
                  "742 Evergreen Terrace",
                  "Springfield, NT 49007"
                ],
                "hours": [],
                "supportedDeliveryMethods": [],
                "departmentID": "",
                "hasCreditCardPayments": false,
                "showDrivingDirections": false,
                "isPreferred": false,
                "isPatientMessagingEnabled": false
              },
              "lastDispense": {
                "dispenseQuantity": "",
                "dispenseUnit": "",
                "dispenseAmount": "",
                "dispenseDate": "",
                "amountDue": 0,
                "workRequestFee": 0,
                "workRequestFeeDue": 0,
                "isPaymentValidForDeliveryMethod": false,
                "isRxReady": false,
                "costDetails": {
                  "copay": 0,
                  "formattedCopay": "",
                  "isCopayPending": false,
                  "isBilledToAccount": false,
                  "paymentCards": [],
                  "hasPaymentCard": false
                },
                "dispenseType": 0,
                "delivery": {
                  "shipmentTra
… (truncated; 18238 more characters)
```

</details>

<details>
<summary><code>mode: standard</code> (8910 chars)</summary>

- **getPatientFirstName**: Homer

## prescriptions (4)

### prescriptions 1

- **id**: FAKE-MED-KEY-001
- **name**: Duff Beer Extract 500mg

#### patientFriendlyName

- **text**: Duff Beer Extract
- **caption**: (empty)
- **captionType**: (empty)
- **sig**: Take 1 tablet by mouth as needed for relaxation
- **sigTranslationFromOrder**: (empty)
- **dateToDisplay**: 01/15/2026
- **dateDisplayKey**: (empty)
- **formattedDateNoted**: (empty)
- **startDate**: 01/15/2026
- **lastUpdateInstant**: (empty)
- **hasFutureStartDate**: false
- **prescriptionNumber**: (empty)

#### authorizingProvider

- **name**: Julius Hibbert, MD

#### orderingProvider

- **name**: Julius Hibbert, MD
- **isPatientReported**: false
- **isClinicReported**: false
- **isPendingUpdate**: false
- **pendingUpdateType**: 0
- **isAnticoagulationMed**: false
- **isFrequencyPRN**: false
- **criticalMedMessage**: (empty)
- **classList**: (none)
- **varianceComment**: (empty)
- **previousTakingDiffSig**: (empty)
- **previousTakingDiffSigInstant**: (empty)
- **previousTakingDiffSigCSN**: (empty)

#### refillDetails

- **isRefillable**: true
- **refillsRemaining**: (empty)
- **hasRefillsRemaining**: false
- **refillStatus**: 0
- **refillExpirationDate**: (empty)
- **refillWarningCode**: (empty)
- **scheduledFillDate**: (empty)
- **externalFillRequestDate**: (empty)
- **nextDispenseDate**: (empty)
- **writtenDispenseQuantity**: 30
- **writtenDispenseUnit**: (empty)
- **writtenDispenseAmount**: (empty)
- **daySupply**: 30

##### lastDispense

- **dispenseQuantity**: (empty)
- **dispenseUnit**: (empty)
- **dispenseAmount**: (empty)
- **dispenseDate**: (empty)
- **isRxReady**: false
- **dispenseType**: 0

###### costDetails

- **formattedCopay**: (empty)
- **copay**: 0
- **isCopayPending**: false

###### delivery

- **formattedShipDate**: (empty)
- **formattedAddress**: (none)
- **shipmentTrackingInfo**: (none)

##### costDetails

- **formattedCopay**: (empty)
- **copay**: 0
- **isCopayPending**: false

##### owningPharmacy

- **name**: Kwik-E-Mart Pharmacy
- **phoneNumber**: (555) 636-2700
- **formattedAddress**: 742 Evergreen Terrace, Springfield, NT 49007
- **hours**: (none)
- **isPreferred**: false
- **organizationName**: (empty)

### prescriptions 2

- **id**: FAKE-MED-KEY-002
- **name**: Donut Supplement 100mg

#### patientFriendlyName

- **text**: Donut Supplement
- **caption**: (empty)
- **captionType**: (empty)
- **sig**: Take 1 tablet by mouth daily with breakfast
- **sigTranslationFromOrder**: (empty)
- **dateToDisplay**: 01/15/2026
- **dateDisplayKey**: (empty)
- **formattedDateNoted**: (empty)
- **startDate**: 01/15/2026
- **lastUpdateInstant**: (empty)
- **hasFutureStartDate**: false
- **prescriptionNumber**: (empty)

#### authorizingProvider

- **name**: Julius Hibbert, MD

#### orderingProvider

- **name**: Julius Hibbert, MD
- **isPatientReported**: false
- **isClinicReported**: false
- **isPendingUpdate**: false
- **pendingUpdateType**: 0
- **isAnticoagulationMed**: false
- **isFrequencyPRN**: false
- **criticalMedMessage**: (empty)
- **classList**: (none)
- **varianceComment**: (empty)
- **previousTakingDiffSig**: (empty)
- **previousTakingDiffSigInstant**: (empty)
- **previousTakingDiffSigCSN**: (empty)

#### refillDetails

- **isRefillable**: true
- **refillsRemaining**: (empty)
- **hasRefillsRemaining**: false
- **refillStatus**: 0
- **refillExpirationDate**: (empty)
- **refillWarningCode**: (empty)
- **scheduledFillDate**: (empty)
- **externalFillRequestDate**: (empty)
- **nextDispenseDate**: (empty)
- **writtenDispenseQuantity**: 90
- **writtenDispenseUnit**: (empty)
- **writtenDispenseAmount**: (empty)
- **daySupply**: 90

##### lastDispense

- **dispenseQuantity**: (empty)
- **dispenseUnit**: (empty)
- **dispenseAmount**: (empty)
- **dispenseDate**: (empty)
- **isRxReady**: false
- **dispenseType**: 0

###### costDetails

- **formattedCopay**: (empty)
- **copay**: 0
- **isCopayPending**: false

###### delivery

- **formattedShipDate**: (empty)
- **formattedAddress**: (none)
- **shipmentTrackingInfo**: (none)

##### costDetails

- **formattedCopay**: (empty)
- **copay**: 0
- **isCopayPending**: false

##### owningPharmacy

- **name**: Kwik-E-Mart Pharmacy
- **phoneNumber**: (555) 636-2700
- **formattedAddress**: 742 Evergreen Terrace, Springfield, NT 49007
- **hours**: (none)
- **isPreferred**: false
- **organizationName**: (empty)

### prescriptions 3

- **id**: FAKE-MED-KEY-003
- **name**: Lisinopril 10mg

#### patientFriendlyName

- **text**: Lisinopril
- **caption**: (empty)
- **captionType**: (empty)
- **sig**: Take 1 tablet by mouth daily for blood pressure
- **sigTranslationFromOrder**: (empty)
- **dateToDisplay**: 06/01/2025
- **dateDisplayKey**: (empty)
- **formattedDateNoted**: (empty)
- **startDate**: 06/01/2025
- **lastUpdateInstant**: (empty)
- **hasFutureStartDate**: false
- **prescriptionNumber**: (empty)

#### authorizingProvider

- **name**: Julius Hibbert, MD

#### orderingProvider

- **name**: Julius Hibbert, MD
- **isPatientReported**: false
- **isClinicReported**: false
- **isPendingUpdate**: false
- **pendingUpdateType**: 0
- **isAnticoagulationMed**: false
- **isFrequencyPRN**: false
- **criticalMedMessage**: (empty)
- **classList**: (none)
- **varianceComment**: (empty)
- **previousTakingDiffSig**: (empty)
- **previousTakingDiffSigInstant**: (empty)
- **previousTakingDiffSigCSN**: (empty)

#### refillDetails

- **isRefillable**: true
- **refillsRemaining**: (empty)
- **hasRefillsRemaining**: false
- **refillStatus**: 0
- **refillExpirationDate**: (empty)
- **refillWarningCode**: (empty)
- **scheduledFillDate**: (empty)
- **externalFillRequestDate**: (empty)
- **nextDispenseDate**: (empty)
- **writtenDispenseQuantity**: 30
- **writtenDispenseUnit**: (empty)
- **writtenDispenseAmount**: (empty)
- **daySupply**: 30

##### lastDispense

- **dispenseQuantity**: (empty)
- **dispenseUnit**: (empty)
- **dispenseAmount**: (empty)
- **dispenseDate**: (empty)
- **isRxReady**: false
- **dispenseType**: 0

###### costDetails

- **formattedCopay**: (empty)
- **copay**: 0
- **isCopayPending**: false

###### delivery

- **formattedShipDate**: (empty)
- **formattedAddress**: (none)
- **shipmentTrackingInfo**: (none)

##### costDetails

- **formattedCopay**: (empty)
- **copay**: 0
- **isCopayPending**: false

##### owningPharmacy

- **name**: Kwik-E-Mart Pharmacy
- **phoneNumber**: (555) 636-2700
- **formattedAddress**: 742 Evergreen Terrace, Springfield, NT 49007
- **hours**: (none)
- **isPreferred**: false
- **organizationName**: (empty)

### prescriptions 4

- **id**: FAKE-MED-KEY-004
- **name**: Atorvastatin 20mg

#### patientFriendlyName

- **text**: Atorvastatin
- **caption**: (empty)
- **captionType**: (empty)
- **sig**: Take 1 tablet by mouth at bedtime for cholesterol
- **sigTranslationFromOrder**: (empty)
- **dateToDisplay**: 06/01/2025
- **dateDisplayKey**: (empty)
- **formattedDateNoted**: (empty)
- **startDate**: 06/01/2025
- **lastUpdateInstant**: (empty)
- **hasFutureStartDate**: false
- **prescriptionNumber**: (empty)

#### authorizingProvider

- **name**: Julius Hibbert, MD

#### orderingProvider

- **name**: Julius Hibbert, MD
- **isPatientReported**: false
- **isClinicReported**: false
- **isPendingUpdate**: false
- **pendingUpdateType**: 0
- **isAnticoagulationMed**: false
- **isFrequencyPRN**: false
- **criticalMedMessage**: (empty)
- **classList**: (none)
- **varianceComment**: (empty)
- **previousTakingDiffSig**: (empty)
- **previousTakingDiffSigInstant**: (empty)
- **previousTakingDiffSigCSN**: (empty)

#### refillDetails

- **isRefillable**: true
- **refillsRemaining**: (empty)
- **hasRefillsRemaining**: false
- **refillStatus**: 0
- **refillExpirationDate**: (empty)
- **refillWarningCode**: (empty)
- **scheduledFillDate**: (empty)
- **externalFillRequestDate**: (empty)
- **nextDispenseDate**: (empty)
- **writtenDispenseQuantity**: 30
- **writtenDispenseUnit**: (empty)
- **writtenDispenseAmount**: (empty)
- **daySupply**: 30

##### lastDispense

- **dispenseQuantity**: (empty)
- **dispenseUnit**: (empty)
- **dispenseAmount**: (empty)
- **dispenseDate**: (empty)
- **isRxReady**: false
- **dispenseType**: 0

###### costDetails

- **formattedCopay**: (empty)
- **copay**: 0
- **isCopayPending**: false

###### delivery

- **formattedShipDate**: (empty)
- **formattedAddress**: (none)
- **shipmentTrackingInfo**: (none)

##### costDetails

- **formattedCopay**: (empty)
- **copay**: 0
- **isCopayPending**: false

##### owningPharmacy

- **name**: Kwik-E-Mart Pharmacy
- **phoneNumber**: (555) 636-2700
- **formattedAddress**: 742 Evergreen Terrace, Springfield, NT 49007
- **hours**: (none)
- **isPreferred**: false
- **organizationName**: (empty)

## prescriptionLists (1)

| organizationName | numRefillsDueSoon | previousTakingValuesDate | pickups | deliveries | inProgressWorkRequests |
| - | - | - | - | - | - |
| (empty) | 0 | (empty) | | | |

</details>

<details>
<summary><code>mode: concise</code> (1100 chars)</summary>

## prescriptions (4)

| id | name | patientFriendlyName | sig | dateToDisplay | dateDisplayKey | authorizingProvider | isPatientReported | isRefillable | refillsRemaining | hasRefillsRemaining | owningPharmacy |
| - | - | - | - | - | - | - | - | - | - | - | - |
| FAKE-MED-KEY-001 | Duff Beer Extract 500mg | Duff Beer Extract | Take 1 tablet by mouth as needed for relaxation | 01/15/2026 | (empty) | Julius Hibbert, MD | false | true | (empty) | false | Kwik-E-Mart Pharmacy |
| FAKE-MED-KEY-002 | Donut Supplement 100mg | Donut Supplement | Take 1 tablet by mouth daily with breakfast | 01/15/2026 | (empty) | Julius Hibbert, MD | false | true | (empty) | false | Kwik-E-Mart Pharmacy |
| FAKE-MED-KEY-003 | Lisinopril 10mg | Lisinopril | Take 1 tablet by mouth daily for blood pressure | 06/01/2025 | (empty) | Julius Hibbert, MD | false | true | (empty) | false | Kwik-E-Mart Pharmacy |
| FAKE-MED-KEY-004 | Atorvastatin 20mg | Atorvastatin | Take 1 tablet by mouth at bedtime for cholesterol | 06/01/2025 | (empty) | Julius Hibbert, MD | false | true | (empty) | false | Kwik-E-Mart Pharmacy |

</details>

<details>
<summary><code>mode: json</code> (6894 chars)</summary>

```json
{
  "getPatientFirstName": "Homer",
  "prescriptions": [
    {
      "id": "FAKE-MED-KEY-001",
      "name": "Duff Beer Extract 500mg",
      "patientFriendlyName": {
        "text": "Duff Beer Extract",
        "caption": "",
        "captionType": ""
      },
      "sig": "Take 1 tablet by mouth as needed for relaxation",
      "sigTranslationFromOrder": "",
      "dateToDisplay": "01/15/2026",
      "dateDisplayKey": "",
      "formattedDateNoted": "",
      "startDate": "01/15/2026",
      "lastUpdateInstant": "",
      "hasFutureStartDate": false,
      "prescriptionNumber": "",
      "authorizingProvider": {
        "name": "Julius Hibbert, MD"
      },
      "orderingProvider": {
        "name": "Julius Hibbert, MD"
      },
      "isPatientReported": false,
      "isClinicReported": false,
      "isPendingUpdate": false,
      "pendingUpdateType": 0,
      "isAnticoagulationMed": false,
      "isFrequencyPRN": false,
      "criticalMedMessage": "",
      "classList": [],
      "varianceComment": "",
      "previousTakingDiffSig": "",
      "previousTakingDiffSigInstant": "",
      "previousTakingDiffSigCSN": "",
      "refillDetails": {
        "isRefillable": true,
        "refillsRemaining": "",
        "hasRefillsRemaining": false,
        "refillStatus": 0,
        "refillExpirationDate": "",
        "refillWarningCode": "",
        "scheduledFillDate": "",
        "externalFillRequestDate": "",
        "nextDispenseDate": "",
        "writtenDispenseQuantity": "30",
        "writtenDispenseUnit": "",
        "writtenDispenseAmount": "",
        "daySupply": "30",
        "lastDispense": {
          "dispenseQuantity": "",
          "dispenseUnit": "",
          "dispenseAmount": "",
          "dispenseDate": "",
          "isRxReady": false,
          "dispenseType": 0,
          "costDetails": {
            "formattedCopay": "",
            "copay": 0,
            "isCopayPending": false
          },
          "delivery": {
            "formattedShipDate": "",
            "formattedAddress": [],
            "shipmentTrackingInfo": []
          }
        },
        "costDetails": {
          "formattedCopay": "",
          "copay": 0,
          "isCopayPending": false
        },
        "owningPharmacy": {
          "name": "Kwik-E-Mart Pharmacy",
          "phoneNumber": "(555) 636-2700",
          "formattedAddress": [
            "742 Evergreen Terrace",
            "Springfield, NT 49007"
          ],
          "hours": [],
          "isPreferred": false
        }
      },
      "organizationName": ""
    },
    {
      "id": "FAKE-MED-KEY-002",
      "name": "Donut Supplement 100mg",
      "patientFriendlyName": {
        "text": "Donut Supplement",
        "caption": "",
        "captionType": ""
      },
      "sig": "Take 1 tablet by mouth daily with breakfast",
      "sigTranslationFromOrder": "",
      "dateToDisplay": "01/15/2026",
      "dateDisplayKey": "",
      "formattedDateNoted": "",
      "startDate": "01/15/2026",
      "lastUpdateInstant": "",
      "hasFutureStartDate": false,
      "prescriptionNumber": "",
      "authorizingProvider": {
        "name": "Julius Hibbert, MD"
      },
      "orderingProvider": {
        "name": "Julius Hibbert, MD"
      },
      "isPatientReported": false,
      "isClinicReported": false,
      "isPendingUpdate": false,
      "pendingUpdateType": 0,
      "isAnticoagulationMed": false,
      "isFrequencyPRN": false,
      "criticalMedMessage": "",
      "classList": [],
      "varianceComment": "",
      "previousTakingDiffSig": "",
      "previousTakingDiffSigInstant": "",
      "previousTakingDiffSigCSN": "",
      "refillDetails": {
        "isRefillable": true,
        "refillsRemaining": "",
        "hasRefillsRemaining": false,
        "refillStatus": 0,
        "refillExpirationDate": "",
        "refillWarningCode": "",
        "scheduledFillDate": "",
        "externalFillRequestDate": "",
        "nextDispenseDate": "",
        "writtenDispenseQuantity": "90",
        "writtenDispenseUnit": "",
        "writtenDispenseAmount": "",
        "daySupply": "90",
        "lastDispense": {
          "dispenseQuantity": "",
          "dispenseUnit": "",
          "dispenseAmount": "",
          "dispenseDate": "",
          "isRxReady": false,
          "dispenseType": 0,
          "costDetails": {
            "formattedCopay": "",
            "copay": 0,
            "isCopayPending": false
          },
          "delivery": {
            "formattedShipDate": "",
            "formattedAddress": [],
            "shipmentTrackingInfo": []
          }
        },
        "costDetails": {
          "formattedCopay": "",
          "copay": 0,
          "isCopayPending": false
        },
        "owningPharmacy": {
          "name": "Kwik-E-Mart Pharmacy",
          "phoneNumber": "(555) 636-2700",
          "formattedAddress": [
            "742 Evergreen Terrace",
            "Springfield, NT 49007"
          ],
          "hours": [],
          "isPreferred": false
        }
      },
      "organizationName": ""
    },
    {
      "id": "FAKE-MED-KEY-003",
      "name": "Lisinopril 10mg",
      "patientFriendlyName": {
        "text": "Lisinopril",
        "caption": "",
        "captionType": ""
      },
      "sig": "Take 1 tablet by mouth daily for blood pressure",
      "sigTranslationFromOrder": "",
      "dateToDisplay": "06/01/2025",
      "dateDisplayKey": "",
      "formattedDateNoted": "",
      "startDate": "06/01/2025",
      "lastUpdateInstant": "",
      "hasFutureStartDate": false,
      "prescriptionNumber": "",
      "authorizingProvider": {
        "name": "Julius Hibbert, MD"
      },
      "orderingProvider": {
        "name": "Julius Hibbert, MD"
      },
      "isPatientReported": false,
      "isClinicReported": false,
      "isPendingUpdate": false,
      "pendingUpdateType": 0,
      "isAnticoagulationMed": false,
      "isFrequencyPRN": false,
      "criticalMedMessage": "",
      "classList": [],
      "varianceComment": "",
      "previousTakingDiffSig": "",
      "previousTakingDiffSigInstant": "",
      "previousTakingDiffSigCSN": "",
      "refillDetails": {
        "isRefillable": true,
        "refillsRemaining": "",
        "hasRefillsRemaining": false,
        "refillStatus": 0,
        "refillExpirationDate": "",
        "refillWarningCode": "",
        "scheduledFillDate": "",
        "externalFillRequestDate": "",
        "nextDispenseDate": "",
        "writtenDispenseQuantity": "30",
        "writtenDispenseUnit": "",
        "writtenDispenseAmount": "",
        "daySupply": "30",
        "lastDispense": {
          "dispenseQuantity": "",
          "dispenseUnit": "",
          "dispenseAmount": "",
          "dispenseDate": "",
          "isRxReady": false,
          "dispenseType": 0,
          "costDetails": {
            "formattedCopay": "",
            "copay": 0,
            "isCopayPending": false
          },
          "delivery": {
            "formattedShipDate": "",
            "formattedAddress": [],
            "shipmentTrackingInfo": []
          }
        },
        "costDetails": {
          "formattedCopay": "",
          "copay": 0,
          "isCopayPending": false
        },
        "owningPharmacy": {
          "name": "Kwik-E-Mart Pharmacy",
          "phoneNumber": "(555) 636-2700",
          "formattedAddress": [
            "742 Evergreen Terrace",
            "Springfield, NT 49007"
          ],
          "hours": [],
          "isPreferred": false
        }
      },
      "organizationName": ""
    },
    {
      "id": "FAKE-MED-KEY-004",
      "name": "Atorvastatin 20mg",
      "patientFriendlyName": {
        "text": "Atorvastatin",
        "caption": "",
        "captionType": ""
      },
      "sig": "Take 1 tablet by mouth at bedtime for cholesterol",
      "sigTranslationFromOrder": "",
      "dateToDisplay": "06/01/2025",
      "dateDisplayKey": "",
      "formattedDateNoted": "",
      "startDate": "06/01/2025",
      "lastUpdateInstant": "",
      "hasFutureStartDate": false,
      "prescriptionNumber": "",
      "authorizingProvider": {
        "name": "Julius Hibbert, MD"
      },
      "orderingProvider": {
        "name": "Julius Hibbert, MD"
      },
      "isPatientReported": false,
      "isClinicReported": false,
      "isPendingUpdate": false,
      "pendingUpdateType": 0,
      "isAnticoagulationMed": false,
      "isFrequencyPRN": false,
      "criticalMedMessage": "",
      "classList": [],
      "varianceComment": "",
      "previousTakingDiffSig": "",
      "previousTakingDiffSigInstant": "",
      "previousTakingDiffSigCSN": "",
      "refillDetails": {
        "isRefillable": true,
        "refillsRemaining": "",
        "hasRefillsRemaining": false,
        "refillStatus": 0,
        "refillExpirationDate": "",
        "refillWarningCode": "",
        "scheduledFillDate": "",
        "externalFillRequestDate": "",
        "nextDispenseDate": "",
        "writtenDispenseQuantity": "30",
        "writtenDispenseUnit": "",
        "writtenDispenseAmount": "",
        "daySupply": "30",
        "lastDispense": {
          "dispenseQuantity": "",
          "dispenseUnit": "",
          "dispenseAmount": "",
          "dispenseDate": "",
          "isRxReady": false,
          "dispenseType": 0,
          "costDetails": {
            "formattedCopay": "",
            "copay": 0,
            "isCopayPending": false
          },
          "delivery": {
            "formattedShipDate": "",
            "formattedAddress": [],
            "shipmentTrackingInfo": []
          }
        },
        "costDetails": {
          "formattedCopay": "",
          "copay": 0,
          "isCopayPending": false
        },
        "owningPharmacy": {
          "name": "Kwik-E-Mart Pharmacy",
          "phoneNumber": "(555) 636-2700",
          "formattedAddress": [
            "742 Evergreen Terrace",
            "Springfield, NT 49007"
          ],
          "hours": [],
          "isPreferred": false
        }
      },
      "organizationName": ""
    }
  ],
  "prescriptionLists": [
    {
      "organizationName": "",
      "numRefillsDueSoon": 0,
      "previousTakingValuesDate": "",
      "pickups": [],
      "deliveries": [],
      "inProgressWorkRequests": []
    }
  ]
}
```

</details>

---

### `get_allergies`

Known allergies with reaction and severity.

<details>
<summary><code>mode: raw</code> (495 chars)</summary>

```json
{
  "dataList": [
    {
      "allergyItem": {
        "name": "Vegetables",
        "id": "ALLERGY-001",
        "formattedDateNoted": "03/15/1990",
        "type": "Food",
        "reaction": "Hives",
        "severity": "Severe"
      }
    },
    {
      "allergyItem": {
        "name": "Exercise",
        "id": "ALLERGY-002",
        "formattedDateNoted": "01/01/1985",
        "type": "Other",
        "reaction": "Shortness of breath",
        "severity": "Moderate"
      }
    }
  ],
  "dateOfBirth": "",
  "hasUpdateSecurity": false,
  "hasStandAloneUpdateSecurity": false,
  "showDxrRefreshBanner": false,
  "showDxrBannerAction": false,
  "preTextStringKey": "",
  "allergiesStatus": 0
}
```

</details>

<details>
<summary><code>mode: standard</code> (442 chars)</summary>

## dataList (2)

### dataList 1

#### allergyItem

- **name**: Vegetables
- **id**: ALLERGY-001
- **formattedDateNoted**: 03/15/1990
- **type**: Food
- **reaction**: Hives
- **severity**: Severe

### dataList 2

#### allergyItem

- **name**: Exercise
- **id**: ALLERGY-002
- **formattedDateNoted**: 01/01/1985
- **type**: Other
- **reaction**: Shortness of breath
- **severity**: Moderate

- **allergiesStatus**: 0
- **dateOfBirth**: (empty)

</details>

<details>
<summary><code>mode: concise</code> (415 chars)</summary>

## dataList (2)

### dataList 1

#### allergyItem

- **name**: Vegetables
- **id**: ALLERGY-001
- **formattedDateNoted**: 03/15/1990
- **type**: Food
- **reaction**: Hives
- **severity**: Severe

### dataList 2

#### allergyItem

- **name**: Exercise
- **id**: ALLERGY-002
- **formattedDateNoted**: 01/01/1985
- **type**: Other
- **reaction**: Shortness of breath
- **severity**: Moderate

- **allergiesStatus**: 0

</details>

<details>
<summary><code>mode: json</code> (354 chars)</summary>

```json
{
  "dataList": [
    {
      "allergyItem": {
        "name": "Vegetables",
        "id": "ALLERGY-001",
        "formattedDateNoted": "03/15/1990",
        "type": "Food",
        "reaction": "Hives",
        "severity": "Severe"
      }
    },
    {
      "allergyItem": {
        "name": "Exercise",
        "id": "ALLERGY-002",
        "formattedDateNoted": "01/01/1985",
        "type": "Other",
        "reaction": "Shortness of breath",
        "severity": "Moderate"
      }
    }
  ],
  "allergiesStatus": 0,
  "dateOfBirth": ""
}
```

</details>

---

### `get_health_issues`

Active health issues / problem list.

<details>
<summary><code>mode: raw</code> (1927 chars)</summary>

```json
{
  "dataList": [
    {
      "healthIssueItem": {
        "name": "Obesity",
        "id": "HI-001",
        "formattedDateNoted": "01/15/2000",
        "action": 0,
        "isReadOnly": false
      },
      "localItem": {
        "name": "",
        "id": "",
        "formattedDateNoted": "",
        "action": 0,
        "isReadOnly": false
      },
      "externalItems": [],
      "externalOrgs": [],
      "contentLinkURL": "",
      "contentLinkPath": "",
      "target": "",
      "hasLocalInstance": false
    },
    {
      "healthIssueItem": {
        "name": "High blood pressure",
        "id": "HI-002",
        "formattedDateNoted": "03/20/2010",
        "action": 0,
        "isReadOnly": false
      },
      "localItem": {
        "name": "",
        "id": "",
        "formattedDateNoted": "",
        "action": 0,
        "isReadOnly": false
      },
      "externalItems": [],
      "externalOrgs": [],
      "contentLinkURL": "",
      "contentLinkPath": "",
      "target": "",
      "hasLocalInstance": false
    },
    {
      "healthIssueItem": {
        "name": "High cholesterol",
        "id": "HI-003",
        "formattedDateNoted": "03/20/2010",
        "action": 0,
        "isReadOnly": false
      },
      "localItem": {
        "name": "",
        "id": "",
        "formattedDateNoted": "",
        "action": 0,
        "isReadOnly": false
      },
      "externalItems": [],
      "externalOrgs": [],
      "contentLinkURL": "",
      "contentLinkPath": "",
      "target": "",
      "hasLocalInstance": false
    },
    {
      "healthIssueItem": {
        "name": "Chronic radiation exposure (nuclear plant, Sector 7-G)",
        "id": "HI-004",
        "formattedDateNoted": "08/01/1990",
        "action": 0,
        "isReadOnly": false
      },
      "localItem": {
        "name": "",
        "id": "",
        "formattedDateNoted": "",
        "action": 0,
        "isReadOnly": false
      },
      "externalItems": [],
      "externalOrgs": [],
      "contentLinkURL": "",
      "contentLinkPath": "",
      "target": "",
      "hasLocalInstance": false
    },
    {
      "healthIssueItem": {
        "name": "Foreign body in brain (crayon, lodged since childhood)",
        "id": "HI-005",
        "formattedDateNoted": "05/09/1972",
        "action": 0,
        "isReadOnly": false
      },
      "localItem": {
        "name": "",
        "id": "",
        "formattedDateNoted": "",
        "action": 0,
        "isReadOnly": false
      },
      "externalItems": [],
      "externalOrgs": [],
      "contentLinkURL": "",
      "contentLinkPath": "",
      "target": "",
      "hasLocalInstance": false
    }
  ],
  "hasUpdateSecurity": false,
  "hasStandAloneUpdateSecurity": false,
  "alwaysShowSearchMore": false,
  "showDxrRefreshBanner": false,
  "showDxrBannerAction": false,
  "preTextStringKey": "",
  "dateOfBirth": "",
  "healthIssuesUrl": ""
}
```

</details>

<details>
<summary><code>mode: standard</code> (1241 chars)</summary>

## dataList (5)

### dataList 1

#### healthIssueItem

- **name**: Obesity
- **formattedDateNoted**: 01/15/2000
- **id**: HI-001
- **isReadOnly**: false
- **externalItems**: (none)
- **externalOrgs**: (none)
- **hasLocalInstance**: false

### dataList 2

#### healthIssueItem

- **name**: High blood pressure
- **formattedDateNoted**: 03/20/2010
- **id**: HI-002
- **isReadOnly**: false
- **externalItems**: (none)
- **externalOrgs**: (none)
- **hasLocalInstance**: false

### dataList 3

#### healthIssueItem

- **name**: High cholesterol
- **formattedDateNoted**: 03/20/2010
- **id**: HI-003
- **isReadOnly**: false
- **externalItems**: (none)
- **externalOrgs**: (none)
- **hasLocalInstance**: false

### dataList 4

#### healthIssueItem

- **name**: Chronic radiation exposure (nuclear plant, Sector 7-G)
- **formattedDateNoted**: 08/01/1990
- **id**: HI-004
- **isReadOnly**: false
- **externalItems**: (none)
- **externalOrgs**: (none)
- **hasLocalInstance**: false

### dataList 5

#### healthIssueItem

- **name**: Foreign body in brain (crayon, lodged since childhood)
- **formattedDateNoted**: 05/09/1972
- **id**: HI-005
- **isReadOnly**: false
- **externalItems**: (none)
- **externalOrgs**: (none)
- **hasLocalInstance**: false

</details>

<details>
<summary><code>mode: concise</code> (297 chars)</summary>

## dataList (5)

| name | formattedDateNoted |
| - | - |
| Obesity | 01/15/2000 |
| High blood pressure | 03/20/2010 |
| High cholesterol | 03/20/2010 |
| Chronic radiation exposure (nuclear plant, Sector 7-G) | 08/01/1990 |
| Foreign body in brain (crayon, lodged since childhood) | 05/09/1972 |

</details>

<details>
<summary><code>mode: json</code> (969 chars)</summary>

```json
{
  "dataList": [
    {
      "healthIssueItem": {
        "name": "Obesity",
        "formattedDateNoted": "01/15/2000",
        "id": "HI-001",
        "isReadOnly": false
      },
      "externalItems": [],
      "externalOrgs": [],
      "hasLocalInstance": false
    },
    {
      "healthIssueItem": {
        "name": "High blood pressure",
        "formattedDateNoted": "03/20/2010",
        "id": "HI-002",
        "isReadOnly": false
      },
      "externalItems": [],
      "externalOrgs": [],
      "hasLocalInstance": false
    },
    {
      "healthIssueItem": {
        "name": "High cholesterol",
        "formattedDateNoted": "03/20/2010",
        "id": "HI-003",
        "isReadOnly": false
      },
      "externalItems": [],
      "externalOrgs": [],
      "hasLocalInstance": false
    },
    {
      "healthIssueItem": {
        "name": "Chronic radiation exposure (nuclear plant, Sector 7-G)",
        "formattedDateNoted": "08/01/1990",
        "id": "HI-004",
        "isReadOnly": false
      },
      "externalItems": [],
      "externalOrgs": [],
      "hasLocalInstance": false
    },
    {
      "healthIssueItem": {
        "name": "Foreign body in brain (crayon, lodged since childhood)",
        "formattedDateNoted": "05/09/1972",
        "id": "HI-005",
        "isReadOnly": false
      },
      "externalItems": [],
      "externalOrgs": [],
      "hasLocalInstance": false
    }
  ]
}
```

</details>

---

### `get_vitals`

Vitals and tracked flowsheet readings (weight, blood pressure, heart rate, glucose, etc.).

<details>
<summary><code>mode: raw</code> (6406 chars)</summary>

```json
{
  "requests": [
    {
      "path": "/app/track-my-health",
      "method": "GET",
      "status": 200,
      "contentType": "text/html; charset=utf-8",
      "body": "<!DOCTYPE html>\n<html xmlns=\"http://www.w3.org/1999/xhtml\" lang=\"en\" dir=\"ltr\">\n<head>\n  <title>MyChart</title>\n  <meta http-equiv=\"content-type\" content=\"text/html; charset=utf-8\" />\n</head>\n<body>\n  <div class='hidden' id='__CSRFContainer'><input name=\"__RequestVerificationToken\" type=\"hidden\" value=\"fake-csrf-token-00000000000000000000000000000000\" /></div>\n  <script>\n(function () {\n  var originalFetch = window.fetch;\n  window.fetch = function (url, opts) {\n    opts = opts || {};\n    if ((opts.method || 'GET').toUpperCase() === 'POST') {\n      var el = document.querySelector('#__CSRFContainer input[name=__RequestVerificationToken]');\n      if (el) {\n        opts.headers = opts.headers || {};\n        if (!opts.headers['__RequestVerificationToken']) {\n          opts.headers['__RequestVerificationToken'] = el.value;\n        }\n      }\n    }\n    return originalFetch.call(this, url, opts);\n  };\n})();\n</script>\n  <div></div>\n</body>\n</html>",
      "purpose": "token"
    },
    {
      "path": "/api/track-my-health/GetFlowsheets",
      "method": "POST",
      "requestBody": {
        "organizationId": ""
      },
      "status": 200,
      "contentType": "application/json;charset=utf-8",
      "body": {
        "flowsheets": [
          {
            "episodeId": "EP-VITALS",
            "templateId": "EP-VITALS",
            "name": "Vitals Trending",
            "entryType": "1",
            "entryMode": "1",
            "status": "1",
            "startDateIso": "2114-10-15",
            "endDateIso": "",
            "instructions": "",
            "hasMoreData": false,
            "hasEpisodeData": false,
            "rowGroups": [
              {
                "id": "-1",
                "name": "",
                "rowIds": [
                  "row-bp",
                  "row-hr",
                  "row-wt"
                ]
              }
            ],
            "rows": [
              {
                "id": "row-bp",
                "name": "Blood Pressure",
                "rowType": "1",
                "valueType": "4",
                "decimalPlaces": 0,
                "unitsDisplayName": "mmHg"
              },
              {
                "id": "row-hr",
                "name": "Pulse",
                "rowType": "1",
                "valueType": "1",
                "decimalPlaces": 0
              },
              {
                "id": "row-wt",
                "name": "Weight",
                "rowType": "1",
                "valueType": "5",
                "decimalPlaces": 0,
                "units": "6",
                "unitsDisplayName": "lbs"
              }
            ],
            "readings": []
          }
        ],
        "userSettings": {
          "isAdmitted": false,
          "isH2GSession": false,
          "isMOContext": false,
          "isDataTileContext": false,
          "isProxyContext": false,
          "myChartPatientId": "",
          "myChartPatientName": "",
          "myChartUserId": "",
          "myChartUserName": "",
          "devicePlatform": "",
          "healthConnectAvailable": "",
          "moVersionSupportsBluetooth": false
        }
      }
    },
    {
      "path": "/api/track-my-health/GetFlowsheetReadings",
      "method": "POST",
      "requestBody": {
        "episodeId": "EP-VITALS",
        "endInstantIso": "2024-01-02T23:59:59",
        "numReadings": 1000
      },
      "status": 200,
      "contentType": "application/json;charset=utf-8",
      "body": {
        "flowsheet": {
          "episodeId": "EP-VITALS",
          "templateId": "EP-VITALS",
          "name": "Vitals Trending",
          "entryType": "",
          "entryMode": "",
          "status": "",
          "startDateIso": "2114-10-15",
          "endDateIso": "",
          "instructions": "",
          "hasMoreData": false,
          "hasEpisodeData": false,
          "rowGroups": [
            {
              "id": "-1",
              "name": "",
              "rowIds": [
                "row-bp",
                "row-hr",
                "row-wt"
              ]
            }
          ],
          "rows": [
            {
              "id": "row-bp",
              "name": "Blood Pressure",
              "rowType": "1",
              "valueType": "4",
              "decimalPlaces": 0,
              "unitsDisplayName": "mmHg"
            },
            {
              "id": "row-hr",
              "name": "Pulse",
              "rowType": "1",
              "valueType": "1",
              "decimalPlaces": 0
            },
            {
              "id": "row-wt",
              "name": "Weight",
              "rowType": "1",
              "valueType": "5",
              "decimalPlaces": 0,
              "units": "6",
              "unitsDisplayName": "lbs"
            }
          ],
          "readings": [
            {
              "id": "rd-bp-1",
              "fsdId": "fsd-1",
              "rowId": "row-bp",
              "valueType": "4",
              "entryType": "clinical",
              "instantTakenIso": "2026-01-10T09:00:00",
              "isAbnormal": true,
              "documentationSource": "34000",
              "stringValue": "145/95",
              "dataType": "32105",
              "line": 0,
              "decimalPlaces": 0,
              "timeZone": "America/Los_Angeles",
              "sourceRowId": ""
            },
            {
              "id": "rd-hr-1",
              "fsdId": "fsd-1",
              "rowId": "row-hr",
              "valueType": "1",
              "entryType": "clinical",
              "instantTakenIso": "2026-01-10T09:00:00",
              "isAbnormal": false,
              "documentationSource": "34000",
              "stringValue": "",
              "dataType": "32005",
              "line": 0,
              "decimalPlaces": 0,
              "timeZone": "America/Los_Angeles",
              "sourceRowId": "",
              "numericValue": 88
            },
            {
              "id": "rd-wt-1",
              "fsdId": "fsd-1",
              "rowId": "row-wt",
              "valueType": "5",
              "entryType": "clinical",
              "instantTakenIso": "2026-01-10T09:00:00",
              "isAbnormal": false,
              "documentationSource": "34000",
              "stringValue": "",
              "dataType": "32001",
              "line": 0,
              "decimalPlaces": 0,
              "timeZone": "America/Los_Angeles",
              "sourceRowId": "",
              "numericValue": 260,
              "units": "6"
            },
            {
              "id": "rd-bp-2",
              "fsdId": "fsd-2",
              "rowId": "row-bp",
              "valueType": "4",
              "entryType": "clinical",
              "instantTakenIso": "2025-07-15T10:30:00",
              "isAbnormal": true,
              "documentationSource": "34002",
              "stringValue": "150/98",
              "dataType": "32105",
              "line": 0,
              "decimalPlaces": 0,
              "timeZone": "America/Los_Angeles",
              "sourceRowId": ""
            },
            {
              "id": "rd-bp-3",
              "fsdId": "fsd-3",
              "rowId": "row-bp",
              "valueType": "4",
              "entryType": "clinical",
              "instantTakenIso": "2025-01-20T08:15:00",
              "isAbnormal": false,
              "documentationSource": "34002",
              "stringValue": "142/92",
              "dataType": "32105",
              "line": 0,
              "decimalPlaces": 0,
              "timeZone": "America/Los_Angeles",
              "sourceRowId": ""
            }
          ]
        },
        "userSettings": {
          "isAdmitted": false,
          "isH2GSession": false,
          "isMOContext": false,
          "isDataTileContext": false,
          "isProxyContext": false,
          "myChartPatientId": "",
          "myChartPatientName": "",
          "myChartUserId": "",
          "myChartUserName": "",
          "devicePlatform": "",
          "healthConnectAvailable": "",
          "moVersionSupportsBluetooth": false
        }
      }
    },
    {
      "path": "/api/track-my-health/GetFlowsheetReadings",
      "method": "POST",
      "requestBody": {
        "episodeId": "EP-VITALS",
        "endInstantIso": "2025-01-20T08:15:00",
        "numReadings": 1000
      },
      "status": 200,
      "contentType": "application/json;charset=utf-8",
      "body": {
        "flowsheet": {
          "episodeId": "EP-VITALS",
          "templateId": "EP-VITALS",
          "name": "Vitals Trending",
          "entryType": "",
          "entryMode": "",
          "status": "",
          "startDateIso": "2114-10-15",
          "endDateIso": "",
          "instructions": "",
          "hasMoreData": false,
          "hasEpisodeData": false,
          "rowGroups": [
            {
              "id": "-1",
              "name": "",
              "rowIds": [
                "row-bp",
                "row-hr",
                "row-wt"
              ]
            }
          ],
          "rows": [
            {
              "id": "row-bp",
              "name": "Blood Pressure",
              "rowType": "1",
              "valueType": "4",
              "decimalPlaces": 0,
              "unitsDisplayName": "mmHg"
            },
            {
              "id": "row-hr",
              "name": "Pulse",
              "rowType": "1",
              "valueType": "1",
              "decimalPlaces": 0
            },
            {
              "id": "row-wt",
              "name": "Weight",
              "rowType": "1",
              "valueType": "5",
              "decimalPlaces": 0,
              "units": "6",
              "unitsDisplayName": "lbs"
            }
          ],
          "readings": [
            {
              "id": "rd-bp-3",
              "fsdId": "fsd-3",
              "rowId": "row-bp",
              "valueType": "4",
              "entryType": "clinical",
              "instantTakenIso": "2025-01-20T08:15:00",
              "isAbnormal": false,
              "documentationSource": "34002",
              "stringValue": "142/92",
              "dataType": "32105",
              "line": 0,
              "decimalPlaces": 0,
              "timeZone": "America/Los_Angeles",
              "sourceRowId": ""
            }
          ]
        },
        "userSettings": {
          "isAdmitted": false,
          "isH2GSession": false,
          "isMOContext": false,
          "isDataTileContext": false,
          "isProxyContext": false,
          "myChartPatientId": "",
          "myChartPatientName": "",
          "myChartUserId": "",
          "myChartUserName": "",
          "devicePlatform": "",
          "healthConnectAvailable": "",
          "moVersionSupportsBluetooth": false
        }
      }
    }
  ]
}
```

</details>

<details>
<summary><code>mode: standard</code> (1216 chars)</summary>

## flowsheets (1)

### flowsheets 1

- **name**: Vitals Trending
- **status**: 1
- **startDateIso**: 2114-10-15
- **endDateIso**: (empty)
- **instructions**: (empty)

#### rows (3)

| id | name | unitsDisplayName | rowType | valueType | decimalPlaces |
| - | - | - | - | - | - |
| row-bp | Blood Pressure | mmHg | 1 | 4 | 0 |
| row-hr | Pulse | (none) | 1 | 1 | 0 |
| row-wt | Weight | lbs | 1 | 5 | 0 |

#### rowGroups (1)

| id | name | rowIds |
| - | - | - |
| -1 | (empty) | row-bp, row-hr, row-wt |

#### readings (5)

| rowId | instantTakenIso | timeZone | stringValue | numericValue | value | isAbnormal | entryType | documentationSource |
| - | - | - | - | - | - | - | - | - |
| row-bp | 2026-01-10T09:00:00 | America/Los_Angeles | 145/95 | (none) | 145/95 | true | clinical | 34000 |
| row-hr | 2026-01-10T09:00:00 | America/Los_Angeles | (empty) | 88 | 88 | false | clinical | 34000 |
| row-wt | 2026-01-10T09:00:00 | America/Los_Angeles | (empty) | 260 | 260 | false | clinical | 34000 |
| row-bp | 2025-07-15T10:30:00 | America/Los_Angeles | 150/98 | (none) | 150/98 | true | clinical | 34002 |
| row-bp | 2025-01-20T08:15:00 | America/Los_Angeles | 142/92 | (none) | 142/92 | false | clinical | 34002 |

</details>

<details>
<summary><code>mode: concise</code> (861 chars)</summary>

## flowsheets (1)

### flowsheets 1

- **name**: Vitals Trending

#### rows (3)

##### rows 1

- **name**: Blood Pressure
- **unitsDisplayName**: mmHg
- **readingCount**: 3

###### latestReading

- **instantTakenIso**: 2026-01-10T09:00:00
- **value**: 145/95
- **isAbnormal**: true

###### abnormalReadings (2)

| instantTakenIso | value |
| - | - |
| 2025-07-15T10:30:00 | 150/98 |
| 2026-01-10T09:00:00 | 145/95 |

##### rows 2

- **name**: Pulse
- **unitsDisplayName**: (none)
- **readingCount**: 1

###### latestReading

- **instantTakenIso**: 2026-01-10T09:00:00
- **value**: 88
- **isAbnormal**: false
- **abnormalReadings**: (none)

##### rows 3

- **name**: Weight
- **unitsDisplayName**: lbs
- **readingCount**: 1

###### latestReading

- **instantTakenIso**: 2026-01-10T09:00:00
- **value**: 260
- **isAbnormal**: false
- **abnormalReadings**: (none)

</details>

<details>
<summary><code>mode: json</code> (1632 chars)</summary>

```json
{
  "flowsheets": [
    {
      "name": "Vitals Trending",
      "status": "1",
      "startDateIso": "2114-10-15",
      "endDateIso": "",
      "instructions": "",
      "rows": [
        {
          "id": "row-bp",
          "name": "Blood Pressure",
          "unitsDisplayName": "mmHg",
          "rowType": "1",
          "valueType": "4",
          "decimalPlaces": 0
        },
        {
          "id": "row-hr",
          "name": "Pulse",
          "unitsDisplayName": null,
          "rowType": "1",
          "valueType": "1",
          "decimalPlaces": 0
        },
        {
          "id": "row-wt",
          "name": "Weight",
          "unitsDisplayName": "lbs",
          "rowType": "1",
          "valueType": "5",
          "decimalPlaces": 0
        }
      ],
      "rowGroups": [
        {
          "id": "-1",
          "name": "",
          "rowIds": [
            "row-bp",
            "row-hr",
            "row-wt"
          ]
        }
      ],
      "readings": [
        {
          "rowId": "row-bp",
          "instantTakenIso": "2026-01-10T09:00:00",
          "timeZone": "America/Los_Angeles",
          "stringValue": "145/95",
          "numericValue": null,
          "value": "145/95",
          "isAbnormal": true,
          "entryType": "clinical",
          "documentationSource": "34000"
        },
        {
          "rowId": "row-hr",
          "instantTakenIso": "2026-01-10T09:00:00",
          "timeZone": "America/Los_Angeles",
          "stringValue": "",
          "numericValue": 88,
          "value": "88",
          "isAbnormal": false,
          "entryType": "clinical",
          "documentationSource": "34000"
        },
        {
          "rowId": "row-wt",
          "instantTakenIso": "2026-01-10T09:00:00",
          "timeZone": "America/Los_Angeles",
          "stringValue": "",
          "numericValue": 260,
          "value": "260",
          "isAbnormal": false,
          "entryType": "clinical",
          "documentationSource": "34000"
        },
        {
          "rowId": "row-bp",
          "instantTakenIso": "2025-07-15T10:30:00",
          "timeZone": "America/Los_Angeles",
          "stringValue": "150/98",
          "numericValue": null,
          "value": "150/98",
          "isAbnormal": true,
          "entryType": "clinical",
          "documentationSource": "34002"
        },
        {
          "rowId": "row-bp",
          "instantTakenIso": "2025-01-20T08:15:00",
          "timeZone": "America/Los_Angeles",
          "stringValue": "142/92",
          "numericValue": null,
          "value": "142/92",
          "isAbnormal": false,
          "entryType": "clinical",
          "documentationSource": "34002"
        }
      ]
    }
  ]
}
```

</details>

---

### `get_immunizations`

Vaccination history.

<details>
<summary><code>mode: raw</code> (891 chars)</summary>

```json
{
  "organizationImmunizationList": [
    {
      "organization": {
        "organizationId": "",
        "organizationName": "Springfield General Hospital",
        "logoUrl": "",
        "isLocal": false,
        "isSSO": false,
        "incompleteH2GSetup": false,
        "address": [],
        "linkType": 0,
        "currentlyLoadingData": false,
        "errorLoadingData": false,
        "hasValidRefreshToken": false,
        "shouldRemindForUpdate": false,
        "showInRefreshBanner": false,
        "disclaimerOverride": false,
        "isMyChartCentral": false
      },
      "orgImmunizations": [
        {
          "id": "IMM-001",
          "name": "Influenza (Flu)",
          "formattedAdministeredDates": [
            "10/01/2025",
            "10/15/2024"
          ]
        },
        {
          "id": "IMM-002",
          "name": "Tdap",
          "formattedAdministeredDates": [
            "05/12/2020"
          ]
        },
        {
          "id": "IMM-003",
          "name": "COVID-19 Vaccine",
          "formattedAdministeredDates": [
            "09/01/2025",
            "03/15/2024"
          ]
        },
        {
          "id": "IMM-004",
          "name": "Hepatitis B",
          "formattedAdministeredDates": [
            "01/20/1990",
            "02/20/1990",
            "07/20/1990"
          ]
        }
      ],
      "showViewDetailsLink": false
    }
  ],
  "showPersonalNotes": false,
  "immunizationsUrl": ""
}
```

</details>

<details>
<summary><code>mode: standard</code> (432 chars)</summary>

## immunizations (4)

| name | formattedAdministeredDates | id | organizationName |
| - | - | - | - |
| Influenza (Flu) | 10/01/2025, 10/15/2024 | IMM-001 | Springfield General Hospital |
| Tdap | 05/12/2020 | IMM-002 | Springfield General Hospital |
| COVID-19 Vaccine | 09/01/2025, 03/15/2024 | IMM-003 | Springfield General Hospital |
| Hepatitis B | 01/20/1990, 02/20/1990, 07/20/1990 | IMM-004 | Springfield General Hospital |

</details>

<details>
<summary><code>mode: concise</code> (236 chars)</summary>

## immunizations (4)

| name | formattedAdministeredDates |
| - | - |
| Influenza (Flu) | 10/01/2025, 10/15/2024 |
| Tdap | 05/12/2020 |
| COVID-19 Vaccine | 09/01/2025, 03/15/2024 |
| Hepatitis B | 01/20/1990, 02/20/1990, 07/20/1990 |

</details>

<details>
<summary><code>mode: json</code> (601 chars)</summary>

```json
{
  "immunizations": [
    {
      "name": "Influenza (Flu)",
      "formattedAdministeredDates": [
        "10/01/2025",
        "10/15/2024"
      ],
      "id": "IMM-001",
      "organizationName": "Springfield General Hospital"
    },
    {
      "name": "Tdap",
      "formattedAdministeredDates": [
        "05/12/2020"
      ],
      "id": "IMM-002",
      "organizationName": "Springfield General Hospital"
    },
    {
      "name": "COVID-19 Vaccine",
      "formattedAdministeredDates": [
        "09/01/2025",
        "03/15/2024"
      ],
      "id": "IMM-003",
      "organizationName": "Springfield General Hospital"
    },
    {
      "name": "Hepatitis B",
      "formattedAdministeredDates": [
        "01/20/1990",
        "02/20/1990",
        "07/20/1990"
      ],
      "id": "IMM-004",
      "organizationName": "Springfield General Hospital"
    }
  ]
}
```

</details>

---

### `get_preventive_care`

Preventive care recommendations — overdue and upcoming screenings.

<details>
<summary><code>mode: raw</code> (14380 chars)</summary>

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MyChart - Preventive Care</title>
  <style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif; background: #f0f2f5; color: #1a1a2e; }
a { color: #1a6fa5; text-decoration: none; }
a:hover { text-decoration: underline; }

/* Header */
.mc-header { background: #1a5276; color: #fff; height: 56px; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; position: fixed; top: 0; left: 0; right: 0; z-index: 100; }
.mc-header .logo { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
.mc-header .logo span { color: #5dade2; }
.mc-header .user-info { display: flex; align-items: center; gap: 16px; font-size: 14px; }
.mc-header .user-info a { color: #aed6f1; }
.mc-header .user-info a:hover { color: #fff; }

/* Layout */
.mc-layout { display: flex; margin-top: 56px; min-height: calc(100vh - 56px); }

/* Sidebar */
.mc-sidebar { width: 240px; background: #fff; border-right: 1px solid #dde; padding: 16px 0; position: fixed; top: 56px; bottom: 0; overflow-y: auto; }
.mc-sidebar .nav-group { margin-bottom: 8px; }
.mc-sidebar .nav-group-title { font-size: 11px; font-weight: 600; text-transform: uppercase; color: #888; padding: 8px 20px 4px; letter-spacing: 0.5px; }
.mc-sidebar a { display: flex; align-items: center; gap: 10px; padding: 8px 20px; font-size: 14px; color: #333; transition: background 0.15s; }
.mc-sidebar a:hover { background: #e8f4fd; text-decoration: none; }
.mc-sidebar a.active { background: #d4eaf7; color: #1a5276; font-weight: 600; border-right: 3px solid #1a5276; }
.mc-sidebar .nav-icon { width: 18px; text-align: center; font-size: 15px; }

/* Main content */
.mc-main { margin-left: 240px; flex: 1; padding: 24px 32px; min-width: 0; }
.mc-main h1 { font-size: 24px; font-weight: 600; margin-bottom: 20px; color: #1a1a2e; }
.mc-main h2 { font-size: 18px; font-weight: 600; margin: 20px 0 12px; color: #333; }

/* Cards */
.card { background: #fff; border-radius: 8px; border: 1px solid #e0e0e0; padding: 16px 20px; margin-bottom: 12px; }
.card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.card h3 { font-size: 16px; font-weight: 600; margin-bottom: 6px; }
.card .meta { font-size: 13px; color: #666; margin-top: 4px; }
.card .detail { font-size: 14px; color: #444; margin-top: 4px; }

/* Grid cards */
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-bottom: 20px; }
.card-grid .card { margin-bottom: 0; }

/* Dashboard cards */
.dash-card { background: #fff; border-radius: 8px; border: 1px solid #e0e0e0; padding: 20px; text-align: center; }
.dash-card .dash-icon { font-size: 32px; margin-bottom: 8px; }
.dash-card .dash-value { font-size: 24px; font-weight: 700; color: #1a5276; }
.dash-card .dash-label { font-size: 13px; color: #666; margin-top: 4px; }

/* Badges */
.badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }
.badge-red { background: #fde8e8; color: #c0392b; }
.badge-yellow { background: #fef9e7; color: #b7950b; }
.badge-green { background: #e8f8f5; color: #1e8449; }
.badge-blue { background: #d4eaf7; color: #1a5276; }
.badge-gray { background: #eee; color: #666; }

/* Tables */
table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; border: 1px solid #e0e0e0; margin-bottom: 16px; }
th { background: #f7f8fa; text-align: left; padding: 10px 16px; font-size: 13px; font-weight: 600; color: #555; border-bottom: 2px solid #e0e0e0; }
td { padding: 10px 16px; font-size: 14px; border-bottom: 1px solid #f0f0f0; }
tr:last-child td { border-bottom: none; }
tr:hover td { background: #fafbfc; }
.abnormal { color: #c0392b; font-weight: 600; }

/* Messages */
.msg-list { display: flex; flex-direction: column; gap: 2px; }
.msg-item { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 14px 20px; cursor: pointer; transition: background 0.15s; }
.msg-item:hover { background: #f0f7fd; }
.msg-item.unread { border-left: 4px solid #1a5276; }
.msg-subject { font-weight: 600; font-size: 15px; }
.msg-preview { font-size: 13px; color: #666; margin-top: 2px; }
.msg-meta { font-size: 12px; color: #999; margin-top: 4px; }
.msg-thread { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin-top: 16px; display: none; }
.msg-thread.visible { display: block; }
.msg-bubble { padding: 12px 16px; border-radius: 12px; margin-bottom: 8px; max-width: 80%; }
.msg-bubble.provider { background: #f0f2f5; align-self: flex-start; }
.msg-bubble.patient { background: #d4eaf7; align-self: flex-end; margin-left: auto; }
.msg-bubble .author { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
.msg-bubble .time { font-size: 11px; color: #888; margin-top: 4px; }
.msg-bubble .body { font-size: 14px; line-height: 1.5; }

/* Tabs */
.tabs { display: flex; gap: 0; border-bottom: 2px solid #e0e0e0; margin-bottom: 20px; }
.tab { padding: 10px 20px; font-size: 14px; font-weight: 500; color: #666; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.15s; }
.tab:hover { color: #1a5276; }
.tab.active { color: #1a5276; font-weight: 600; border-bottom-color: #1a5276; }

/* Loading */
.loading { text-align: center; padding: 40px; color: #888; }

/* Print header (scraper compat) */
.proxy-switcher { position: relative; }
.proxy-switcher > summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 8px; background: #12405e; border: 1px solid #2e6f9c; color: #fff; padding: 6px 12px; border-radius: 999px; font-size: 14px; }
.proxy-switcher > summary::-webkit-details-marker { display: none; }
.proxy-switcher > summary:hover { background: #17527a; }
.proxy-switcher > summary .proxy-switcher-label { color: #aed6f1; font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; }
.proxy-switcher > summary .proxy-switcher-caret { color: #aed6f1; font-size: 11px; }
.proxy-switcher .proxySelectorDropDown { position: absolute; right: 0; top: calc(100% + 8px); background: #fff; border: 1px solid #dde; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.18); min-width: 260px; padding: 6px; z-index: 200; }
.proxy-switcher .proxySubjectLink { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border-radius: 6px; color: #1a1a2e; text-decoration: none; }
.proxy-switcher .proxySubjectLink:hover { background: #eef4f9; text-decoration: none; }
.proxy-switcher .proxySubjectLink.currentContext { background: #e8f4fb; font-weight: 600; }
.proxy-switcher .proxySubjectLink.currentContext::after { content: 'Viewing'; font-size: 11px; color: #1a6fa5; font-weight: 600; }
.proxy-switcher .proxy-switcher-heading { padding: 8px 12px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; color: #888; }
.printheader { font-size: 13px; color: #666; padding: 8px 0; margin-bottom: 16px; border-bottom: 1px solid #e0e0e0; }

/* Letter detail */
.letter-body { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px; line-height: 1.6; }
.letter-body h2 { margin: 0 0 12px; }
.letter-body p { margin: 8px 0; }

/* Vitals chart placeholder */
.vital-chart { display: flex; align-items: flex-end; gap: 4px; height: 60px; margin-top: 8px; }
.vital-bar { background: #5dade2; border-radius: 3px 3px 0 0; min-width: 24px; }
</style>
</head>
<body>
  <div class='hidden' style='display:none' id='__CSRFContainer'><input name="__RequestVerificationToken" type="hidden" value="fake-csrf-token-00000000000000000000000000000000" /></div>
  <script>
(function () {
  var originalFetch = window.fetch;
  window.fetch = function (url, opts) {
    opts = opts || {};
    if ((opts.method || 'GET').toUpperCase() === 'POST') {
      var el = document.querySelector('#__CSRFContainer input[name=__RequestVerificationToken]');
      if (el) {
        opts.headers = opts.headers || {};
        if (!opts.headers['__RequestVerificationToken']) {
          opts.headers['__RequestVerificationToken'] = el.value;
        }
      }
    }
    return originalFetch.call(this, url, opts);
  };
})();
</script>
  <header class="mc-header">
    <div class="logo">My<span>Chart</span></div>
    <div class="user-info">
      <details class="proxy-switcher">
      <summary><span class="proxy-switcher-label">Viewing</span><strong>Homer Jay Simpson</strong><span class="proxy-switcher-caret">▾</span></summary>
      <div class="proxySelectorDropDown">
        <div class="proxy-switcher-heading">Switch patient record</div>
        <a class="proxySubjectLink currentContext" data-id="WP-2KQZ8XVC5MJH4RTLN9PWY7BDF3SGA6EU1KXNQZ2RVJM8HTCBW5YLDP4FGS7AKEN3QRXZ6UVJ9MTHW1C" href="/MyChart/inside.asp" aria-label="Access your record"><span class="proxySelectorDropDownNameEllipsis">Homer Jay Simpson</span></a>
        <a class="proxySubjectLink" data-id="WP-7NQK4XZC2VJH8RTLM3PWY6BDF9SGA5EU1KXNQZ7RVJM2HTCBW4YLDP8FGS3AKEN6QRXZ9UVJ5MTHW2C" href="/MyChart/inside.asp?mode=proxyswitch&amp;action=switchcontext&amp;src=0&amp;eid=WP-7NQK4XZC2VJH8RTLM3PWY6BDF9SGA5EU1KXNQZ7RVJM2HTCBW4YLDP8FGS3AKEN6QRXZ9UVJ5MTHW2C" aria-label="Access Bart Simpson's record"><span class="proxySelectorDropDownNameEllipsis">Bart Simpson</span></a>
        <a class="proxySubjectLink" data-id="WP-3MFTJ9WQ2XKVN7RBZ5HLC8PYDA4GSEU6KMWJ1QRXTV9NZBHFC2LPD7YSGA5EK3UNQXWRJ8MVTZ6HC4" href="/MyChart/inside.asp?mode=proxyswitch&amp;action=switchcontext&amp;src=0&amp;eid=WP-3MFTJ9WQ2XKVN7RBZ5HLC8PYDA4GSEU6KMWJ1QRXTV9NZBHFC2LPD7YSGA5EK3UNQXWRJ8MVTZ6HC4" aria-label="Access Lisa Simpson's record"><span class="proxySelectorDropDownNameEllipsis">Lisa Simpson</span></a>
        <a class="proxySubjectLink" data-id="WP-9XVKZ2QM7WTNJ5RBH3LFC8PYDA6GSEU4KMWJ1QRXTV2NZBHFC9LPD5YSGA7EK3UNQXWRJ4MVTZ8HC6" href="/MyChart/inside.asp?mode=proxyswitch&amp;action=switchcontext&amp;src=0&amp;eid=WP-9XVKZ2QM7WTNJ5RBH3LFC8PYDA6GSEU4KMWJ1QRXTV2NZBHFC9LPD5YSGA7EK3UNQXWRJ4MVTZ8HC6" aria-label="Access Maggie Simpson's record"><span class="proxySelectorDropDownNameEllipsis">Maggie Simpson</span></a>
      </div>
    </details>
      <a href="/MyChart/Authentication/Login">Sign out</a>
    </div>
  </header>
  <div class="mc-layout">
    <nav class="mc-sidebar">
    <div class="nav-group">
      <div class="nav-group-title">Overview</div>
      
        <a href="/MyChart/Home" class="">
          <span class="nav-icon">🏠</span>Home
        </a>
      
        <a href="/MyChart/Messaging" class="">
          <span class="nav-icon">💬</span>Messages
        </a>
      
        <a href="/MyChart/Visits" class="">
          <span class="nav-icon">📅</span>Visits
        </a>
      
    </div>
  
    <div class="nav-group">
      <div class="nav-group-title">Health</div>
      
        <a href="/MyChart/TestResults" class="">
          <span class="nav-icon">🧪</span>Test Results
        </a>
      
        <a href="/MyChart/Clinical/Medications" class="">
          <span class="nav-icon">💊</span>Medications
        </a>
      
        <a href="/MyChart/Clinical/Allergies" class="">
          <span class="nav-icon">⚠️</span>Allergies
        </a>
      
        <a href="/MyChart/Clinical/HealthIssues" class="">
          <span class="nav-icon">🩺</span>Health Issues
        </a>
      
        <a href="/MyChart/Clinical/Immunizations" class="">
          <span class="nav-icon">💉</span>Immunizations
        </a>
      
        <a href="/MyChart/TrackMyHealth" class="">
          <span class="nav-icon">📊</span>Vitals
        </a>
      
        <a href="/MyChart/MedicalHistory" class="">
          <span class="nav-icon">📋</span>Medical History
        </a>
      
    </div>
  
    <div class="nav-group">
      <div class="nav-group-title">Care</div>
      
        <a href="/MyChart/Clinical/CareTeam" class="">
          <span class="nav-icon">👨‍⚕️</span>Care Team
        </a>
      
        <a href="/MyChart/Goals" class="">
          <span class="nav-icon">🎯</span>Goals
        </a>
      
        <a href="/MyChart/Referrals" class="">
          <span class="nav-icon">🔀</span>Referrals
        </a>
      
        <a href="/MyChart/HealthAdvisories" class="active">
          <span class="nav-icon">✅</span>Preventive Care
        </a>
      
        <a href="/MyChart/CareJourneys" class="">
          <span class="nav-icon">🛤️</span>Care Journeys
        </a>
      
    </div>
  
    <div class="nav-group">
      <div class="nav-group-title">Records</div>
      
        <a href="/MyChart/Letters" class="">
          <span class="nav-icon">✉️</span>Letters
        </a>
      
        <a href="/MyChart/Documents" class="">
          <span class="nav-icon">📄</span>Documents
        </a>
      
        <a href="/MyChart/Education" class="">
          <span class="nav-icon">📚</span>Education
        </a>
      
    </div>
  
    <div class="nav-group">
      <div class="nav-group-title">Account</div>
      
        <a href="/MyChart/Billing/Summary" class="">
          <span class="nav-icon">💳</span>Billing
        </a>
      
        <a href="/MyChart/Insurance" class="">
          <span class="nav-icon">🛡️</span>Insurance
        </a>
      
        <a href="/MyChart/PersonalInformation" class="">
          <span class="nav-icon">👤</span>Profile
        </a>
      
        <a href="/MyChart/EmergencyContacts" class="">
          <span class="nav-icon">📞</span>Emergency Contacts
        </a>
      
        <a href="/MyChart/Settings" class="">
          <span class="nav-icon">⚙️</span>Settings
        </a>
      
    </div>
  </nav>
    <main class="mc-main">
    <h1>Preventive Care</h1>
    <table><tr><th>Screening</th><th>Status</th><th>Details</th></tr><tr><td><strong>Colonoscopy</strong></td><td><span class="badge badge-red">Overdue</span></td><td>Overdue since 01/01/2024</td></tr><tr><td><strong>Influenza Vaccine</strong></td><td><span class="badge badge-yellow">Due</span></td><td>Not due until 10/01/2026</td></tr><tr><td><strong>Lipid Panel</strong></td><td><span class="badge badge-green">Completed</span></td><td>Completed on 01/10/2026</td></tr></table>
  </main>
  </div>
</body>
</html>

</details>

<details>
<summary><code>mode: standard</code> (311 chars)</summary>

## items (3)

| name | status | overdueSince | notDueUntil | completedDate | previouslyDone |
| - | - | - | - | - | - |
| Colonoscopy | overdue | 01/01/2024 | (empty) | (empty) | |
| Influenza Vaccine | not_due | (empty) | 10/01/2026 | (empty) | |
| Lipid Panel | completed | (empty) | (empty) | 01/10/2026 | |

</details>

<details>
<summary><code>mode: concise</code> (284 chars)</summary>

## items (3)

| name | status | overdueSince | notDueUntil | completedDate |
| - | - | - | - | - |
| Colonoscopy | overdue | 01/01/2024 | (empty) | (empty) |
| Influenza Vaccine | not_due | (empty) | 10/01/2026 | (empty) |
| Lipid Panel | completed | (empty) | (empty) | 01/10/2026 |

</details>

<details>
<summary><code>mode: json</code> (397 chars)</summary>

```json
{
  "items": [
    {
      "name": "Colonoscopy",
      "status": "overdue",
      "overdueSince": "01/01/2024",
      "notDueUntil": "",
      "completedDate": "",
      "previouslyDone": []
    },
    {
      "name": "Influenza Vaccine",
      "status": "not_due",
      "overdueSince": "",
      "notDueUntil": "10/01/2026",
      "completedDate": "",
      "previouslyDone": []
    },
    {
      "name": "Lipid Panel",
      "status": "completed",
      "overdueSince": "",
      "notDueUntil": "",
      "completedDate": "01/10/2026",
      "previouslyDone": []
    }
  ]
}
```

</details>

---

### `get_medical_history`

Past medical, surgical, family and social history.

<details>
<summary><code>mode: raw</code> (1602 chars)</summary>

```json
{
  "surgicalHistory": {
    "surgeries": [
      {
        "surgeryName": "Triple Bypass",
        "surgeryDate": "11/05/1995"
      },
      {
        "surgeryName": "Crayon Removal from Brain",
        "surgeryDate": "03/12/2001"
      }
    ],
    "surgicalHistoryNotes": ""
  },
  "medicalHistory": {
    "diagnoses": [
      {
        "diagnosisName": "Obesity",
        "diagnosisDate": "01/15/2000"
      },
      {
        "diagnosisName": "Hypertension",
        "diagnosisDate": "03/20/2010"
      }
    ],
    "medicalHistoryNotes": "Patient has a history of donut-related incidents."
  },
  "familyHistoryAndStatus": {
    "familyMembers": [
      {
        "nameOrAlias": "",
        "sexId": "",
        "sexName": "",
        "genderId": "",
        "relationshipToPatientId": "",
        "relationshipToPatientName": "Father",
        "statusId": "",
        "statusName": "Abraham Simpson - Living",
        "relativeAge": "",
        "relativeAgeEnd": "",
        "familyMemberId": "",
        "removeFamilyMember": false,
        "createdOnClient": false,
        "conditions": [
          "Heart disease",
          "Dementia"
        ],
        "changes": []
      },
      {
        "nameOrAlias": "",
        "sexId": "",
        "sexName": "",
        "genderId": "",
        "relationshipToPatientId": "",
        "relationshipToPatientName": "Mother",
        "statusId": "",
        "statusName": "Mona Simpson - Deceased",
        "relativeAge": "",
        "relativeAgeEnd": "",
        "familyMemberId": "",
        "removeFamilyMember": false,
        "createdOnClient": false,
        "conditions": [],
        "changes": []
      }
    ],
    "familyHistoryNotes": "",
    "familyStatusNotes": ""
  },
  "socialHistory": {
    "smokingHistory": {
      "smokingTobaccoStatus": "",
      "smokingTobaccoTypes": [],
      "tobaccoUse": "",
      "smokingTobaccoQuitDate": "",
      "showSmokingTobaccoQuitDate": false
    },
    "smokelessHistory": {
      "smokelessTobaccoStatus": "",
      "smokelessTobaccoTypes": [],
      "smokelessQuitDate": "",
      "showSmokelessTobaccoQuitDate": false
    },
    "alcoholHistory": {
      "alcoholUse": "",
      "alcoholAmount": "",
      "alcoholUnit": ""
    },
    "socialHistoryNotes": "",
    "isProxy": false
  },
  "isShareEverywhere": false
}
```

</details>

<details>
<summary><code>mode: standard</code> (1286 chars)</summary>

## medicalHistory

### diagnoses (2)

| diagnosisName | diagnosisDate |
| - | - |
| Obesity | 01/15/2000 |
| Hypertension | 03/20/2010 |
- **medicalHistoryNotes**: Patient has a history of donut-related incidents.

## surgicalHistory

### surgeries (2)

| surgeryName | surgeryDate |
| - | - |
| Triple Bypass | 11/05/1995 |
| Crayon Removal from Brain | 03/12/2001 |
- **surgicalHistoryNotes**: (empty)

## familyHistoryAndStatus

### familyMembers (2)

| relationshipToPatientName | conditions | statusName | nameOrAlias | sexName | relativeAge | relativeAgeEnd |
| - | - | - | - | - | - | - |
| Father | Heart disease, Dementia | Abraham Simpson - Living | (empty) | (empty) | (empty) | (empty) |
| Mother | | Mona Simpson - Deceased | (empty) | (empty) | (empty) | (empty) |
- **familyHistoryNotes**: (empty)
- **familyStatusNotes**: (empty)

## socialHistory

### smokingHistory

- **smokingTobaccoStatus**: (empty)
- **tobaccoUse**: (empty)
- **smokingTobaccoTypes**: (none)
- **smokingTobaccoQuitDate**: (empty)

### smokelessHistory

- **smokelessTobaccoStatus**: (empty)
- **smokelessTobaccoTypes**: (none)
- **smokelessQuitDate**: (empty)

### alcoholHistory

- **alcoholUse**: (empty)
- **alcoholAmount**: (empty)
- **alcoholUnit**: (empty)
- **socialHistoryNotes**: (empty)

</details>

<details>
<summary><code>mode: concise</code> (534 chars)</summary>

## diagnoses (2)

| diagnosisName | diagnosisDate |
| - | - |
| Obesity | 01/15/2000 |
| Hypertension | 03/20/2010 |

## surgeries (2)

| surgeryName | surgeryDate |
| - | - |
| Triple Bypass | 11/05/1995 |
| Crayon Removal from Brain | 03/12/2001 |

## familyMembers (2)

| relationshipToPatientName | statusName | conditions |
| - | - | - |
| Father | Abraham Simpson - Living | Heart disease, Dementia |
| Mother | Mona Simpson - Deceased | |
- **smokingTobaccoStatus**: (empty)
- **tobaccoUse**: (empty)
- **alcoholUse**: (empty)

</details>

<details>
<summary><code>mode: json</code> (1184 chars)</summary>

```json
{
  "medicalHistory": {
    "diagnoses": [
      {
        "diagnosisName": "Obesity",
        "diagnosisDate": "01/15/2000"
      },
      {
        "diagnosisName": "Hypertension",
        "diagnosisDate": "03/20/2010"
      }
    ],
    "medicalHistoryNotes": "Patient has a history of donut-related incidents."
  },
  "surgicalHistory": {
    "surgeries": [
      {
        "surgeryName": "Triple Bypass",
        "surgeryDate": "11/05/1995"
      },
      {
        "surgeryName": "Crayon Removal from Brain",
        "surgeryDate": "03/12/2001"
      }
    ],
    "surgicalHistoryNotes": ""
  },
  "familyHistoryAndStatus": {
    "familyMembers": [
      {
        "relationshipToPatientName": "Father",
        "conditions": [
          "Heart disease",
          "Dementia"
        ],
        "statusName": "Abraham Simpson - Living",
        "nameOrAlias": "",
        "sexName": "",
        "relativeAge": "",
        "relativeAgeEnd": ""
      },
      {
        "relationshipToPatientName": "Mother",
        "conditions": [],
        "statusName": "Mona Simpson - Deceased",
        "nameOrAlias": "",
        "sexName": "",
        "relativeAge": "",
        "relativeAgeEnd": ""
      }
    ],
    "familyHistoryNotes": "",
    "familyStatusNotes": ""
  },
  "socialHistory": {
    "smokingHistory": {
      "smokingTobaccoStatus": "",
      "tobaccoUse": "",
      "smokingTobaccoTypes": [],
      "smokingTobaccoQuitDate": ""
    },
    "smokelessHistory": {
      "smokelessTobaccoStatus": "",
      "smokelessTobaccoTypes": [],
      "smokelessQuitDate": ""
    },
    "alcoholHistory": {
      "alcoholUse": "",
      "alcoholAmount": "",
      "alcoholUnit": ""
    },
    "socialHistoryNotes": ""
  }
}
```

</details>

---

### `get_goals`

Care team goals and patient-set goals.

<details>
<summary><code>mode: raw</code> (2528 chars)</summary>

```json
{
  "requests": [
    {
      "path": "/app/goals",
      "method": "GET",
      "status": 200,
      "contentType": "text/html; charset=utf-8",
      "body": "<!DOCTYPE html>\n<html xmlns=\"http://www.w3.org/1999/xhtml\" lang=\"en\" dir=\"ltr\">\n<head>\n  <title>MyChart</title>\n  <meta http-equiv=\"content-type\" content=\"text/html; charset=utf-8\" />\n</head>\n<body>\n  <div class='hidden' id='__CSRFContainer'><input name=\"__RequestVerificationToken\" type=\"hidden\" value=\"fake-csrf-token-00000000000000000000000000000000\" /></div>\n  <script>\n(function () {\n  var originalFetch = window.fetch;\n  window.fetch = function (url, opts) {\n    opts = opts || {};\n    if ((opts.method || 'GET').toUpperCase() === 'POST') {\n      var el = document.querySelector('#__CSRFContainer input[name=__RequestVerificationToken]');\n      if (el) {\n        opts.headers = opts.headers || {};\n        if (!opts.headers['__RequestVerificationToken']) {\n          opts.headers['__RequestVerificationToken'] = el.value;\n        }\n      }\n    }\n    return originalFetch.call(this, url, opts);\n  };\n})();\n</script>\n  <div></div>\n</body>\n</html>",
      "purpose": "token"
    },
    {
      "path": "/api/goals/LoadCareTeamGoals",
      "method": "POST",
      "requestBody": {},
      "status": 200,
      "contentType": "application/json;charset=utf-8",
      "body": {
        "careTeamGoals": [
          {
            "name": "Lose 50 lbs",
            "description": "Reduce body weight from 260 lbs to 210 lbs through diet and exercise",
            "status": "In Progress",
            "startDate": "01/10/2026",
            "targetDate": "07/10/2026"
          },
          {
            "name": "Lower cholesterol",
            "description": "Reduce total cholesterol below 200 mg/dL",
            "status": "In Progress",
            "startDate": "01/10/2026",
            "targetDate": "04/10/2026"
          }
        ],
        "hasChartGraphSecurity": false,
        "isSharingNotesEnabled": false,
        "quickLinkDictionary": {
          "HealthSummary": "",
          "HealthIssues": "",
          "Allergies": "",
          "Immunizations": "",
          "PreventiveCare": "",
          "Medications": "",
          "TrackMyHealth": ""
        }
      }
    },
    {
      "path": "/api/goals/LoadPatientGoals",
      "method": "POST",
      "requestBody": {},
      "status": 200,
      "contentType": "application/json;charset=utf-8",
      "body": {
        "patientGoals": [
          {
            "goalId": "",
            "goalType": 0,
            "readings": [],
            "complianceType": 0,
            "lastUpdatedDate": "",
            "creationDate": "",
            "isSharingNotesEnabled": false,
            "name": "Eat one vegetable per week",
            "description": "Incorporate at least one serving of vegetables into weekly diet",
            "status": "Not Started",
            "startDate": "01/15/2026",
            "targetDate": "12/31/2026"
          }
        ],
        "hasChartGraphSecurity": false,
        "isSharingNotesEnabled": false,
        "quickLinkDictionary": {
          "HealthSummary": "",
          "HealthIssues": "",
          "Allergies": "",
          "Immunizations": "",
          "PreventiveCare": "",
          "Medications": "",
          "TrackMyHealth": ""
        }
      }
    }
  ]
}
```

</details>

<details>
<summary><code>mode: standard</code> (931 chars)</summary>

## careTeamGoals (2)

### careTeamGoals 1

- **name**: Lose 50 lbs
- **description**: Reduce body weight from 260 lbs to 210 lbs through diet and exercise
- **status**: In Progress
- **startDate**: 01/10/2026
- **targetDate**: 07/10/2026
- **source**: care_team

### careTeamGoals 2

- **name**: Lower cholesterol
- **description**: Reduce total cholesterol below 200 mg/dL
- **status**: In Progress
- **startDate**: 01/10/2026
- **targetDate**: 04/10/2026
- **source**: care_team

## patientGoals (1)

### patientGoals 1

- **goalId**: (empty)
- **goalType**: 0
- **readings**: (none)
- **complianceType**: 0
- **lastUpdatedDate**: (empty)
- **creationDate**: (empty)
- **isSharingNotesEnabled**: false
- **name**: Eat one vegetable per week
- **description**: Incorporate at least one serving of vegetables into weekly diet
- **status**: Not Started
- **startDate**: 01/15/2026
- **targetDate**: 12/31/2026
- **source**: patient

</details>

<details>
<summary><code>mode: concise</code> (931 chars)</summary>

## careTeamGoals (2)

### careTeamGoals 1

- **name**: Lose 50 lbs
- **description**: Reduce body weight from 260 lbs to 210 lbs through diet and exercise
- **status**: In Progress
- **startDate**: 01/10/2026
- **targetDate**: 07/10/2026
- **source**: care_team

### careTeamGoals 2

- **name**: Lower cholesterol
- **description**: Reduce total cholesterol below 200 mg/dL
- **status**: In Progress
- **startDate**: 01/10/2026
- **targetDate**: 04/10/2026
- **source**: care_team

## patientGoals (1)

### patientGoals 1

- **goalId**: (empty)
- **goalType**: 0
- **readings**: (none)
- **complianceType**: 0
- **lastUpdatedDate**: (empty)
- **creationDate**: (empty)
- **isSharingNotesEnabled**: false
- **name**: Eat one vegetable per week
- **description**: Incorporate at least one serving of vegetables into weekly diet
- **status**: Not Started
- **startDate**: 01/15/2026
- **targetDate**: 12/31/2026
- **source**: patient

</details>

<details>
<summary><code>mode: json</code> (758 chars)</summary>

```json
{
  "careTeamGoals": [
    {
      "name": "Lose 50 lbs",
      "description": "Reduce body weight from 260 lbs to 210 lbs through diet and exercise",
      "status": "In Progress",
      "startDate": "01/10/2026",
      "targetDate": "07/10/2026",
      "source": "care_team"
    },
    {
      "name": "Lower cholesterol",
      "description": "Reduce total cholesterol below 200 mg/dL",
      "status": "In Progress",
      "startDate": "01/10/2026",
      "targetDate": "04/10/2026",
      "source": "care_team"
    }
  ],
  "patientGoals": [
    {
      "goalId": "",
      "goalType": 0,
      "readings": [],
      "complianceType": 0,
      "lastUpdatedDate": "",
      "creationDate": "",
      "isSharingNotesEnabled": false,
      "name": "Eat one vegetable per week",
      "description": "Incorporate at least one serving of vegetables into weekly diet",
      "status": "Not Started",
      "startDate": "01/15/2026",
      "targetDate": "12/31/2026",
      "source": "patient"
    }
  ]
}
```

</details>

---

### `get_upcoming_visits`

Upcoming appointments.

<details>
<summary><code>mode: raw</code> (6341 chars)</summary>

```json
{
  "LaterVisitsList": [
    {
      "HasPaymentFeature": true,
      "HasQuestionnaireFeature": true,
      "HasNewPvdFeature": false,
      "PrimaryDate": "04/15/2026 09:00:00 AM",
      "CsnForECheckIn": "CSN-HOMER-001",
      "UnverifiedProxyJumpUrl": null,
      "RescheduledDatString": null,
      "IsNoShow": false,
      "LeftWithoutSeen": false,
      "DischargeDate": null,
      "HasDownloadSummaryLink": false,
      "HasTransmitSummaryLink": false,
      "CanRedirectToApptDetails": false,
      "PastVisitBucket": null,
      "IsClinicalInformationAvailable": false,
      "OwnedBy": 0,
      "AdmissionDateRange": null,
      "IsApptDetailsEnabled": true,
      "IsRequestCancelEnabled": true,
      "IsDirectCancelEnabled": true,
      "IsRescheduleEnabled": true,
      "IsCopayEnabled": true,
      "IsVisitSummaryEnabled": true,
      "IsDownloadSummaryEnabled": true,
      "IsTransmitCEEnabled": true,
      "IsTransmitDirectEnabled": false,
      "IsDischargeInstrEnabled": true,
      "IsPatHandoutsEnabled": false,
      "IsIPReviewEnabled": false,
      "IsDischargeSummaryEnabled": true,
      "IsProviderLinkEnabled": true,
      "IsPreadmissionEnabled": true,
      "IsEcheckInCompleted": false,
      "Csn": "CSN-HOMER-001",
      "Id": "VISIT-HOMER-001",
      "ReferenceID": "",
      "OrganizationLinks": [],
      "PrimaryOrganizationLink": null,
      "Organization": {
        "OrganizationId": "ORG-SPRINGFIELD",
        "OrganizationIdentifier": null,
        "RelatedOrganizations": null,
        "HasChildOrgs": false,
        "CELocationId": null,
        "WebsiteName": null,
        "OrganizationName": "",
        "MyChartAppName": null,
        "SsnLabel": null,
        "IsLocal": false,
        "LogoUrl": "",
        "TermsAndConditionsUrl": null,
        "ProxyTermsAndConditionsUrl": null,
        "Address": [],
        "DisplayAddress": null,
        "ContactInformation": null,
        "UrlList": null,
        "IsSSO": false,
        "IncompleteH2GSetup": false,
        "LastEncounterInfo": null,
        "IsGeneric": false,
        "PayerOrgDetails": {
          "OrganizationId": null,
          "IsPayerOnly": false,
          "IsPayvider": false,
          "IsPayer": false,
          "IsPayerLicensedForMyChart": false,
          "PayerChildWebsiteName": null,
          "PayerDXO": null,
          "PayerCvgLogo": null,
          "PayerCvgLogoMagicId": null,
          "PayerCvgToken": null,
          "PayerCvgName": null
        },
        "IsMyChartCentral": false,
        "IsSameOrganization": false
      },
      "EncodedOrgID": null,
      "Month": 4,
      "DateOfMonth": "15",
      "Year": "2026",
      "IsLocal": false,
      "IsNonEpic": false,
      "IsSingleProvider": true,
      "Telemedicine": null,
      "EVisit": null,
      "CanShowTelemedicine": false,
      "Dat": "67675",
      "Date": "Wednesday April 15, 2026",
      "Time": "9:00 AM",
      "IsAM": true,
      "IsClientTime": false,
      "ClientTimeZoneMarker": "",
      "EncounterType": 0,
      "VisitTypeName": "Annual Physical",
      "Instant": "/Date(1776243600000)/",
      "ArrivalTime": null,
      "CanShowArrivalTime": false,
      "EarlyArrivalReason": null,
      "DurationInMinutes": null,
      "HasDuration": false,
      "Copay": null,
      "CanShowPayments": false,
      "ShortDate": "4/15/2026",
      "IsTimeToBeDetermined": false,
      "IsHideVisitTime": false,
      "CanShowAppointmentTime": true,
      "TimeZone": "America/New_York",
      "Providers": [
        {
          "EncryptedId": "PROV-HIBBERT",
          "Name": "Julius Hibbert, MD",
          "Type": 0,
          "PhotoUrl": "",
          "PhotoLink": "",
          "WebPageUrl": "",
          "HasPhotoOnBlob": false,
          "PhotoBlobToken": "",
          "IsPerson": true,
          "Department": {
            "Id": "",
            "Name": "",
            "Address": [],
            "HasAddress": false,
            "PhoneNumber": "",
            "Instructions": [],
            "ShouldShowInstructions": false,
            "TimeZone": "",
            "ArrivalLocation": "",
            "Specialty": {
              "Value": "",
              "Title": "",
              "TitleUtf8": null,
              "Abbreviation": ""
            },
            "CanShowDrivingDirections": false,
            "IsPreadmissionLocation": false
          },
          "PhotoClass": ""
        }
      ],
      "OtherProviders": [],
      "NumberOfOthers": 0,
      "PrimaryProvider": {
        "EncryptedId": "PROV-HIBBERT",
        "Name": "Julius Hibbert, MD",
        "Type": 0,
        "PhotoUrl": "",
        "PhotoLink": "",
        "WebPageUrl": "",
        "HasPhotoOnBlob": false,
        "PhotoBlobToken": "",
        "IsPerson": true,
        "Department": {
          "Id": "",
          "Name": "",
          "Address": [],
          "HasAddress": false,
          "PhoneNumber": "",
          "Instructions": [],
          "ShouldShowInstructions": false,
          "TimeZone": "",
          "ArrivalLocation": "",
          "Specialty": {
            "Value": "",
            "Title": "",
            "TitleUtf8": null,
            "Abbreviation": ""
          },
          "CanShowDrivingDirections": false,
          "IsPreadmissionLocation": false
        },
        "PhotoClass": ""
      },
      "PrimaryProviderName": "Julius Hibbert, MD",
      "PrimaryDepartment": {
        "Id": "DEP-SGH-PRIMARY",
        "Name": "Springfield General Hospital",
        "Address": [
          "123 Main Street",
          "Springfield, NT 49007"
        ],
        "HasAddress": true,
        "PhoneNumber": "555-0100",
        "Instructions": [],
        "ShouldShowInstructions": false,
        "TimeZone": "America/New_York",
        "ArrivalLocation": "",
        "Specialty": {
          "Value": "",
          "Title": "",
          "TitleUtf8": null,
          "Abbreviation": ""
        },
        "CanShowDrivingDirections": false,
        "IsPreadmissionLocation": false
      },
      "CanRequestCancel": false,
      "IsCanceled": false,
      "CanReschedule": false,
      "RescheduledDat": "",
      "IsDetailsEnabled": false,
      "IsInHomeVisit": false,
      "ECheckIn": {
        "Status": {
          "Value": "",
          "Title": "",
          "Abbreviation": ""
        },
        "IsNotStarted": false,
        "IsInProgress": false,
        "IsComplete": false,
        "Barcode": "",
        "HasBarcodeStep": false,
        "ClinicSteps": [],
        "RequiredECheckInSteps": [],
        "OptionalECheckInSteps": null,
        "UnavailableECheckInSteps": null,
        "HasQuestionnaireLink": false,
        "IsAdmission": false,
        "IsSurgery": false,
        "IsQnrAfterBarcode": false,
        "IsConfirmationView": false,
        "SignUpLink": null,
        "HasSignUpLink": false,
        "IsRequiredForTelemedicine": false,
        "CanShow": false,
        "HasPaymentECheckInStep": false,
        "HasQuestionnaireStep": false,
        "IsInHelloPatientWindow": false,
        "MultiPhaseOn": false
      },
      "CanShowECheckIn": false,
      "ShouldDeprecateECheckInBrand": false,
      "CanShowECheckInComplete": false,
      "IsECheckInComplete": false,
      "NextIncompleteVisitECheckInCsn": null,
      "IsEcheckInEnabled": false,
      "IsECheckInIncomplete": false,
      "CanECheckIn": false,
      "ShouldShowECheckInInGuideBanner": false,
      "CanShowAddToCalendar": false,
      "IsPastVisit": false,
      "HighlightDate": "4/15/2026",
      "IsDrivingDirectionsEnabled": false,
      "ConfirmationStatus": 0,
      "IsConfirmed": false,
      "IsCancelRequestSent": false,
      "CanDirectlyCancel": false,
      "IsUsingFallbackVisitTypeName": false,
      "ChiefComplaint": "",
      "Diagnoses": null,
      "HasSentUpgradeRequest": false,
      "CanSendUpgradeRequest": false,
      "IsUserInitiatedArrivalAllowed": false,
      "SelfArrivalMechanism": 0,
      "SelfArrivalBannerViewModel": null,
      "GeolocationArrival": 0,
      "ArrivalStatus": 0,
      "PatientNextStepInstructions": "",
      "ArrivalAdditionalActions": [],
      "IsProxyRequestMinorFormOn": false,
      "ProxyRequestMinorForm": "",
      "GuestPatientFirstName": null,
      "TelehealthMode": 0,
      "IsUnverifiedOnDemandVideoVisit": false,
      "EncryptedLvvId": null,
      "InProgress": false,
      "IsResidentialMed": false,
      "ShowPFIOLink": false,
      "IsCEOptedIn": false,
      "UserMyChartStatus": 0,
      "EncounterIsSurgery": false,
      "EncounterIsEDVisit": false,
      "IsPreadmission": false,
      "SurgeryTimeOfDay": null,
      "PreadmissionLocation": null,
      "Cases": null,
      "IsHovPreadmission": false,
      "HasProcedures": false,
      "NumberOfProcedures": 0,
      "SurgicalProcedures": null,
      "ComponentVisits": null,
      "HasComponentVisits": false,
      "HasPaymentInfo": false,
      "IsFullyPaid": false,
      "CompleteECheckInCount": 0,
      "TotalECheckInCount": 0
    }
  ],
  "NextNDaysVisits": [],
  "InProgressVisits": [],
  "HighlightDays": [
    "4/15/2026"
  ],
  "HasPVG": false
}
```

</details>

<details>
<summary><code>mode: standard</code> (2493 chars)</summary>

- **count**: 1

## visits (1)

### visits 1

- **Csn**: CSN-HOMER-001
- **CsnForECheckIn**: CSN-HOMER-001
- **Id**: VISIT-HOMER-001
- **ReferenceID**: (empty)
- **Instant**: /Date(1776243600000)/
- **instantISO**: 2026-04-15T09:00:00.000Z
- **PrimaryDate**: 04/15/2026 09:00:00 AM
- **TimeZone**: America/New_York
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **DurationInMinutes**: (none)
- **HasDuration**: false
- **ArrivalTime**: (none)
- **EarlyArrivalReason**: (none)
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **RescheduledDatString**: (none)
- **VisitTypeName**: Annual Physical
- **IsUsingFallbackVisitTypeName**: false
- **EncounterType**: 0
- **EncounterIsSurgery**: false
- **EncounterIsEDVisit**: false
- **IsPreadmission**: false
- **IsHovPreadmission**: false
- **IsResidentialMed**: false
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **Cases**: (none)
- **ComponentVisits**: (none)
- **HasComponentVisits**: false
- **PatientNextStepInstructions**: (empty)

#### EpisodeDetails

- **GestationalAge**: (none)
- **SurgeryTimeOfDay**: (none)
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryProvider

- **Name**: Julius Hibbert, MD

#### Providers (1)

##### Providers 1

- **Name**: Julius Hibbert, MD

###### Department

- **Name**: (empty)
- **Address**: (none)
- **PhoneNumber**: (empty)

- **OtherProviders**: (none)
- **GuestPatientFirstName**: (none)

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **Address**: 123 Main Street, Springfield, NT 49007
- **PhoneNumber**: 555-0100

##### Specialty

- **Title**: (empty)
- **Instructions**: (none)
- **ArrivalLocation**: (empty)
- **TimeZone**: America/New_York
- **PreadmissionLocation**: (none)
- **organizationName**: (empty)
- **IsCanceled**: false
- **IsNoShow**: false
- **LeftWithoutSeen**: false
- **InProgress**: false
- **IsArrived**: (none)
- **IsConfirmed**: false
- **IsCancelRequestSent**: false
- **status**: scheduled
- **ConfirmationStatus**: 0
- **ArrivalStatus**: 0
- **Telemedicine**: (none)
- **TelehealthMode**: 0
- **EVisit**: (none)
- **IsInHomeVisit**: false
- **Copay**: (none)
- **HasPaymentInfo**: false
- **IsFullyPaid**: false
- **IsClinicalNoteAvailable**: (none)
- **IsNotesOnly**: (none)
- **IsClinicalInformationAvailable**: false
- **IsVisitSummaryEnabled**: true
- **HasDownloadSummaryLink**: false
- **IsNotViewed**: (none)
- **IsVisitAmbulatory**: (none)
- **bucket**: later

</details>

<details>
<summary><code>mode: concise</code> (620 chars)</summary>

- **count**: 1

## visits (1)

### visits 1

- **Csn**: CSN-HOMER-001
- **PrimaryDate**: 04/15/2026 09:00:00 AM
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **VisitTypeName**: Annual Physical
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **organizationName**: (empty)
- **status**: scheduled
- **IsClinicalNoteAvailable**: (none)
- **IsVisitSummaryEnabled**: true
- **bucket**: later

</details>

<details>
<summary><code>mode: json</code> (1982 chars)</summary>

```json
{
  "count": 1,
  "visits": [
    {
      "Csn": "CSN-HOMER-001",
      "CsnForECheckIn": "CSN-HOMER-001",
      "Id": "VISIT-HOMER-001",
      "ReferenceID": "",
      "Instant": "/Date(1776243600000)/",
      "instantISO": "2026-04-15T09:00:00.000Z",
      "PrimaryDate": "04/15/2026 09:00:00 AM",
      "TimeZone": "America/New_York",
      "IsTimeToBeDetermined": false,
      "IsHideVisitTime": false,
      "DurationInMinutes": null,
      "HasDuration": false,
      "ArrivalTime": null,
      "EarlyArrivalReason": null,
      "AdmissionDateRange": null,
      "DischargeDate": null,
      "RescheduledDatString": null,
      "VisitTypeName": "Annual Physical",
      "IsUsingFallbackVisitTypeName": false,
      "EncounterType": 0,
      "EncounterIsSurgery": false,
      "EncounterIsEDVisit": false,
      "IsPreadmission": false,
      "IsHovPreadmission": false,
      "IsResidentialMed": false,
      "ChiefComplaint": "",
      "Diagnoses": [],
      "SurgicalProcedures": [],
      "Cases": [],
      "ComponentVisits": [],
      "HasComponentVisits": false,
      "PatientNextStepInstructions": "",
      "EpisodeDetails": {
        "GestationalAge": null
      },
      "SurgeryTimeOfDay": null,
      "PrimaryProviderName": "Julius Hibbert, MD",
      "PrimaryProvider": {
        "Name": "Julius Hibbert, MD"
      },
      "Providers": [
        {
          "Name": "Julius Hibbert, MD",
          "Department": {
            "Name": "",
            "Address": [],
            "PhoneNumber": ""
          }
        }
      ],
      "OtherProviders": [],
      "GuestPatientFirstName": null,
      "PrimaryDepartment": {
        "Name": "Springfield General Hospital",
        "Address": [
          "123 Main Street",
          "Springfield, NT 49007"
        ],
        "PhoneNumber": "555-0100",
        "Specialty": {
          "Title": ""
        },
        "Instructions": [],
        "ArrivalLocation": "",
        "TimeZone": "America/New_York"
      },
      "PreadmissionLocation": null,
      "organizationName": "",
      "IsCanceled": false,
      "IsNoShow": false,
      "LeftWithoutSeen": false,
      "InProgress": false,
      "IsArrived": null,
      "IsConfirmed": false,
      "IsCancelRequestSent": false,
      "status": "scheduled",
      "ConfirmationStatus": 0,
      "ArrivalStatus": 0,
      "Telemedicine": null,
      "TelehealthMode": 0,
      "EVisit": null,
      "IsInHomeVisit": false,
      "Copay": null,
      "HasPaymentInfo": false,
      "IsFullyPaid": false,
      "IsClinicalNoteAvailable": null,
      "IsNotesOnly": null,
      "IsClinicalInformationAvailable": false,
      "IsVisitSummaryEnabled": true,
      "HasDownloadSummaryLink": false,
      "IsNotViewed": null,
      "IsVisitAmbulatory": null,
      "bucket": "later"
    }
  ]
}
```

</details>

---

### `get_past_visits`

Past visits within the last `years_back` years (default 2).

<details>
<summary><code>mode: raw</code> (130565 chars)</summary>

```json
{
  "requests": [
    {
      "path": "/Visits/VisitsList",
      "method": "GET",
      "status": 200,
      "contentType": "text/html; charset=utf-8",
      "body": "<!DOCTYPE html>\n<html xmlns=\"http://www.w3.org/1999/xhtml\" lang=\"en\" dir=\"ltr\">\n<head>\n  <title>MyChart</title>\n  <meta http-equiv=\"content-type\" content=\"text/html; charset=utf-8\" />\n</head>\n<body>\n  <div class='hidden' id='__CSRFContainer'><input name=\"__RequestVerificationToken\" type=\"hidden\" value=\"fake-csrf-token-00000000000000000000000000000000\" /></div>\n  <script>\n(function () {\n  var originalFetch = window.fetch;\n  window.fetch = function (url, opts) {\n    opts = opts || {};\n    if ((opts.method || 'GET').toUpperCase() === 'POST') {\n      var el = document.querySelector('#__CSRFContainer input[name=__RequestVerificationToken]');\n      if (el) {\n        opts.headers = opts.headers || {};\n        if (!opts.headers['__RequestVerificationToken']) {\n          opts.headers['__RequestVerificationToken'] = el.value;\n        }\n      }\n    }\n    return originalFetch.call(this, url, opts);\n  };\n})();\n</script>\n  <div></div>\n</body>\n</html>",
      "purpose": "token"
    },
    {
      "path": "/Visits/VisitsList/LoadPast?loadpast=1&searchString=&oldestRenderedDate=2024-01-01T00:00:00.000Z&ComponentNumber=7",
      "method": "POST",
      "status": 200,
      "contentType": "application/json;charset=utf-8",
      "body": {
        "ViewBagProperties": {
          "LoadingOrgNames": "",
          "ErrorOrgNames": "",
          "ManualOrgNames": ""
        },
        "SerializedIndex": "10",
        "List": {
          "ORG-SPRINGFIELD": {
            "ViewbagProperties": {},
            "Organization": {
              "OrganizationId": "ORG-SPRINGFIELD",
              "OrganizationIdentifier": null,
              "RelatedOrganizations": null,
              "HasChildOrgs": false,
              "CELocationId": null,
              "CELocationHSI": null,
              "WebsiteName": null,
              "OrganizationName": "Springfield General Hospital",
              "MyChartAppName": null,
              "SsnLabel": null,
              "IsLocal": true,
              "LogoUrl": "",
              "TermsAndConditionsUrl": null,
              "ProxyTermsAndConditionsUrl": null,
              "Address": [],
              "DisplayAddress": null,
              "DiscreteAddress": {
                "StreetAddress": [],
                "City": "",
                "State": "",
                "StateName": "",
                "Zip": "",
                "Country": ""
              },
              "ContactInformation": null,
              "UrlList": null,
              "IsSSO": false,
              "IncompleteH2GSetup": false,
              "LastEncounterInfo": null,
              "IsGeneric": false,
              "PayerOrgDetails": {
                "OrganizationId": null,
                "IsPayerOnly": false,
                "IsPayvider": false,
                "IsPayer": false,
                "IsPayerLicensedForMyChart": false,
                "PayerChildWebsiteName": null,
                "PayerDXO": null,
                "PayerCvgLogo": null,
                "PayerCvgLogoMagicId": null,
                "PayerCvgToken": null,
                "PayerCvgName": null
              },
              "IsMyChartCentral": false,
              "IsSameOrganization": false
            },
            "List": [
              {
                "HasPaymentFeature": true,
                "HasQuestionnaireFeature": false,
                "HasNewPvdFeature": false,
                "IsNotViewed": false,
                "IsViewStatusVisible": false,
                "IsClinicalNoteAvailable": false,
                "IsNotesOnly": false,
                "IsVisitAmbulatory": false,
                "FeedbackQnrIDs": [],
                "IsAmbPastVisitDetailsEnabled": false,
                "IsAllIPSecurityPointsDisabled": false,
                "IsIPPastVisitDetailsEnabled": false,
                "IsPastVisitDetailsEnabled": false,
                "ShowVisitDetails": false,
                "PrimaryDate": "01/10/2026 09:00:00 AM",
                "CsnForECheckIn": "CSN-HOMER-002",
                "UnverifiedProxyJumpUrl": null,
                "RescheduledDatString": null,
                "IsNoShow": false,
                "LeftWithoutSeen": false,
                "DischargeDate": null,
                "HasDownloadSummaryLink": true,
                "HasTransmitSummaryLink": true,
                "CanRedirectToApptDetails": true,
                "PastVisitBucket": null,
                "IsClinicalInformationAvailable": true,
                "OwnedBy": 0,
                "AdmissionDateRange": null,
                "IsApptDetailsEnabled": true,
                "IsRequestCancelEnabled": false,
                "IsDirectCancelEnabled": false,
                "IsRescheduleEnabled": false,
                "IsCopayEnabled": false,
                "IsVisitSummaryEnabled": true,
                "IsDownloadSummaryEnabled": true,
                "IsTransmitCEEnabled": true,
                "IsTransmitDirectEnabled": false,
                "IsDischargeInstrEnabled": true,
                "IsPatHandoutsEnabled": false,
                "IsIPReviewEnabled": false,
                "IsDischargeSummaryEnabled": true,
                "IsProviderLinkEnabled": true,
                "IsPreadmissionEnabled": false,
                "IsEcheckInCompleted": false,
                "Csn": "CSN-HOMER-002",
                "Id": "VISIT-HOMER-002",
                "ReferenceID": "",
                "OrganizationLinks": [],
                "PrimaryOrganizationLink": null,
                "Organization": {
                  "OrganizationId": "ORG-SPRINGFIELD",
                  "OrganizationIdentifier": null,
                  "RelatedOrganizations": null,
                  "HasChildOrgs": false,
                  "CELocationId": null,
                  "CELocationHSI": null,
                  "WebsiteName": null,
                  "OrganizationName": "",
                  "MyChartAppName": null,
                  "SsnLabel": null,
                  "IsLocal": false,
                  "LogoUrl": "",
                  "TermsAndConditionsUrl": null,
                  "ProxyTermsAndConditionsUrl": null,
                  "Address": [],
                  "DisplayAddress": null,
                  "DiscreteAddress": {
                    "StreetAddress": [],
                    "City": "",
                    "State": "",
                    "StateName": "",
                    "Zip": "",
                    "Country": ""
                  },
                  "ContactInformation": null,
                  "UrlList": null,
                  "IsSSO": false,
                  "IncompleteH2GSetup": false,
                  "LastEncounterInfo": null,
                  "IsGeneric": false,
                  "PayerOrgDetails": {
                    "OrganizationId": null,
                    "IsPayerOnly": false,
                    "IsPayvider": false,
                    "IsPayer": false,
                    "IsPayerLicensedForMyChart": false,
                    "PayerChildWebsiteName": null,
                    "PayerDXO": null,
                    "PayerCvgLogo": null,
                    "PayerCvgLogoMagicId": null,
                    "PayerCvgToken": null,
                    "PayerCvgName": null
                  },
                  "IsMyChartCentral": false,
                  "IsSameOrganization": false
                },
                "EncodedOrgID": null,
                "Month": 1,
                "DateOfMonth": "10",
                "Year": "2026",
                "IsLocal": false,
                "IsNonEpic": false,
                "IsSingleProvider": true,
                "Telemedicine": null,
                "EVisit": null,
                "CanShowTelemedicine": false,
                "Dat": "67580",
                "Date": "Saturday January 10, 2026",
                "Time": "9:00 AM",
                "IsClientTime": false,
                "ClientTimeZoneMarker": "",
                "EncounterType": 0,
                "VisitTypeName": "Annual Physical",
                "Instant": "/Date(1768035600000)/",
                "ArrivalTime": null,
                "CanShowArrivalTime": false,
                "EarlyArrivalReason": null,
                "DurationInMinutes": null,
                "HasDuration": false,
                "Copay": null,
                "CanShowPayments": false,
                "ShortDate": "1/10/2026",
                "IsTimeToBeDetermined": false,
                "IsHideVisitTime": false,
                "CanShowAppointmentTime": true,
                "TimeZone": "America/New_York",
                "Providers": [
                  {
                    "EncryptedId": "PROV-HIBBERT",
                    "Name": "Julius Hibbert, MD",
                    "Type": 0,
                    "PhotoUrl": "",
                    "PhotoLink": null,
                    "WebPageUrl": "",
                    "HasPhotoOnBlob": false,
                    "PhotoBlobToken": "",
                    "IsPerson": true,
                    "Department": {
                      "Id": "",
                      "Name": "",
                      "Address": [],
                      "HasAddress": false,
                      "PhoneNumber": "",
                      "Instructions": [],
                      "ShouldShowInstructions": false,
                      "TimeZone": "",
                      "ArrivalLocation": "",
                      "Specialty": {
                        "Value": "",
                        "Title": "",
                        "TitleUtf8": null,
                        "Abbreviation": ""
                      },
                      "CanShowDrivingDirections": false,
                      "IsPreadmissionLocation": false
                    },
                    "PhotoClass": ""
                  }
                ],
                "OtherProviders": [],
                "NumberOfOthers": 0,
                "PrimaryProvider": {
                  "EncryptedId": "PROV-HIBBERT",
                  "Name": "Julius Hibbert, MD",
                  "Type": 0,
                  "PhotoUrl": "",
                  "PhotoLink": null,
                  "WebPageUrl": "",
                  "HasPhotoOnBlob": false,
                  "PhotoBlobToken": "",
                  "IsPerson": true,
                  "Department": {
                    "Id": "",
                    "Name": "",
                    "Address": [],
                    "HasAddress": false,
                    "PhoneNumber": "",
                    "Instructions": [],
                    "ShouldShowInstructions": false,
                    "TimeZone": "",
                    "ArrivalLocation": "",
                    "Specialty": {
                      "Value": "",
                      "Title": "",
                      "TitleUtf8": null,
                      "Abbreviation": ""
                    },
                    "CanShowDrivingDirections": false,
                    "IsPreadmissionLocation": false
                  },
                  "PhotoClass": ""
                },
                "PrimaryProviderName": "Julius Hibbert, MD",
                "PrimaryDepartment": {
                  "Id": "DEP-SGH-PRIMARY",
                  "Name": "Springfield General Hospital",
                  "Address": [
                    "123 Main Street",
                    "Springfield, NT 49007"
                  ],
                  "HasAddress": true,
                  "PhoneNumber": "555-0100",
                  "Instructions": [],
                  "ShouldShowInstructions": false,
                  "TimeZone": "America/New_York",
                  "ArrivalLocation": "",
                  "Specialty": {
                    "Value": "",
                    "Title": "",
… (truncated; 233907 more characters)
```

</details>

<details>
<summary><code>mode: standard</code> (48756 chars)</summary>

- **count**: 20
- **hasOlderVisits**: true

## visits (20)

### visits 1

- **Csn**: CSN-HOMER-002
- **CsnForECheckIn**: CSN-HOMER-002
- **Id**: VISIT-HOMER-002
- **ReferenceID**: (empty)
- **Instant**: /Date(1768035600000)/
- **instantISO**: 2026-01-10T09:00:00.000Z
- **PrimaryDate**: 01/10/2026 09:00:00 AM
- **TimeZone**: America/New_York
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **DurationInMinutes**: (none)
- **HasDuration**: false
- **ArrivalTime**: (none)
- **EarlyArrivalReason**: (none)
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **RescheduledDatString**: (none)
- **VisitTypeName**: Annual Physical
- **IsUsingFallbackVisitTypeName**: false
- **EncounterType**: 0
- **EncounterIsSurgery**: false
- **EncounterIsEDVisit**: false
- **IsPreadmission**: false
- **IsHovPreadmission**: false
- **IsResidentialMed**: false
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **Cases**: (none)
- **ComponentVisits**: (none)
- **HasComponentVisits**: false
- **PatientNextStepInstructions**: (empty)

#### EpisodeDetails

- **GestationalAge**: (empty)
- **SurgeryTimeOfDay**: 0
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryProvider

- **Name**: Julius Hibbert, MD

#### Providers (1)

##### Providers 1

- **Name**: Julius Hibbert, MD

###### Department

- **Name**: (empty)
- **Address**: (none)
- **PhoneNumber**: (empty)

- **OtherProviders**: (none)
- **GuestPatientFirstName**: (none)

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **Address**: 123 Main Street, Springfield, NT 49007
- **PhoneNumber**: 555-0100

##### Specialty

- **Title**: (empty)
- **Instructions**: (none)
- **ArrivalLocation**: (empty)
- **TimeZone**: America/New_York
- **PreadmissionLocation**: (none)
- **organizationName**: (empty)
- **IsCanceled**: false
- **IsNoShow**: false
- **LeftWithoutSeen**: false
- **InProgress**: false
- **IsArrived**: false
- **IsConfirmed**: false
- **IsCancelRequestSent**: false
- **status**: completed
- **ConfirmationStatus**: 0
- **ArrivalStatus**: (none)
- **Telemedicine**: (none)
- **TelehealthMode**: 0
- **EVisit**: (none)
- **IsInHomeVisit**: false
- **Copay**: (none)
- **HasPaymentInfo**: false
- **IsFullyPaid**: false
- **IsClinicalNoteAvailable**: false
- **IsNotesOnly**: false
- **IsClinicalInformationAvailable**: true
- **IsVisitSummaryEnabled**: true
- **HasDownloadSummaryLink**: true
- **IsNotViewed**: false
- **IsVisitAmbulatory**: false

### visits 2

- **Csn**: CSN-HOMER-003
- **CsnForECheckIn**: CSN-HOMER-003
- **Id**: VISIT-HOMER-003
- **ReferenceID**: (empty)
- **Instant**: /Date(1763649000000)/
- **instantISO**: 2025-11-20T14:30:00.000Z
- **PrimaryDate**: 11/20/2025 02:30:00 PM
- **TimeZone**: America/New_York
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **DurationInMinutes**: (none)
- **HasDuration**: false
- **ArrivalTime**: (none)
- **EarlyArrivalReason**: (none)
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **RescheduledDatString**: (none)
- **VisitTypeName**: ER Visit - Donut Incident
- **IsUsingFallbackVisitTypeName**: false
- **EncounterType**: 0
- **EncounterIsSurgery**: false
- **EncounterIsEDVisit**: true
- **IsPreadmission**: false
- **IsHovPreadmission**: false
- **IsResidentialMed**: false
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **Cases**: (none)
- **ComponentVisits**: (none)
- **HasComponentVisits**: false
- **PatientNextStepInstructions**: (empty)

#### EpisodeDetails

- **GestationalAge**: (empty)
- **SurgeryTimeOfDay**: 0
- **PrimaryProviderName**: Nick Riviera, MD

#### PrimaryProvider

- **Name**: Nick Riviera, MD

#### Providers (1)

##### Providers 1

- **Name**: Nick Riviera, MD

###### Department

- **Name**: (empty)
- **Address**: (none)
- **PhoneNumber**: (empty)

- **OtherProviders**: (none)
- **GuestPatientFirstName**: (none)

#### PrimaryDepartment

- **Name**: Springfield General Hospital ER
- **Address**: 123 Main Street, Springfield, NT 49007
- **PhoneNumber**: 555-0100

##### Specialty

- **Title**: (empty)
- **Instructions**: (none)
- **ArrivalLocation**: (empty)
- **TimeZone**: America/New_York
- **PreadmissionLocation**: (none)
- **organizationName**: (empty)
- **IsCanceled**: false
- **IsNoShow**: false
- **LeftWithoutSeen**: false
- **InProgress**: false
- **IsArrived**: false
- **IsConfirmed**: false
- **IsCancelRequestSent**: false
- **status**: completed
- **ConfirmationStatus**: 0
- **ArrivalStatus**: (none)
- **Telemedicine**: (none)
- **TelehealthMode**: 0
- **EVisit**: (none)
- **IsInHomeVisit**: false
- **Copay**: (none)
- **HasPaymentInfo**: false
- **IsFullyPaid**: false
- **IsClinicalNoteAvailable**: false
- **IsNotesOnly**: false
- **IsClinicalInformationAvailable**: true
- **IsVisitSummaryEnabled**: true
- **HasDownloadSummaryLink**: true
- **IsNotViewed**: false
- **IsVisitAmbulatory**: false

### visits 3

- **Csn**: CSN-HOMER-004
- **CsnForECheckIn**: CSN-HOMER-004
- **Id**: VISIT-HOMER-004
- **ReferenceID**: (empty)
- **Instant**: /Date(1754388000000)/
- **instantISO**: 2025-08-05T10:00:00.000Z
- **PrimaryDate**: 08/05/2025 10:00:00 AM
- **TimeZone**: America/New_York
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **DurationInMinutes**: (none)
- **HasDuration**: false
- **ArrivalTime**: (none)
- **EarlyArrivalReason**: (none)
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **RescheduledDatString**: (none)
- **VisitTypeName**: Radiation Screening
- **IsUsingFallbackVisitTypeName**: false
- **EncounterType**: 0
- **EncounterIsSurgery**: false
- **EncounterIsEDVisit**: false
- **IsPreadmission**: false
- **IsHovPreadmission**: false
- **IsResidentialMed**: false
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **Cases**: (none)
- **ComponentVisits**: (none)
- **HasComponentVisits**: false
- **PatientNextStepInstructions**: (empty)

#### EpisodeDetails

- **GestationalAge**: (empty)
- **SurgeryTimeOfDay**: 0
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryProvider

- **Name**: Julius Hibbert, MD

#### Providers (1)

##### Providers 1

- **Name**: Julius Hibbert, MD

###### Department

- **Name**: (empty)
- **Address**: (none)
- **PhoneNumber**: (empty)

- **OtherProviders**: (none)
- **GuestPatientFirstName**: (none)

#### PrimaryDepartment

- **Name**: Springfield Nuclear Power Plant Health Center
- **Address**: 100 Industrial Way, Springfield, NT 49007
- **PhoneNumber**: 555-0100

##### Specialty

- **Title**: (empty)
- **Instructions**: (none)
- **ArrivalLocation**: (empty)
- **TimeZone**: America/New_York
- **PreadmissionLocation**: (none)
- **organizationName**: (empty)
- **IsCanceled**: false
- **IsNoShow**: false
- **LeftWithoutSeen**: false
- **InProgress**: false
- **IsArrived**: false
- **IsConfirmed**: false
- **IsCancelRequestSent**: false
- **status**: completed
- **ConfirmationStatus**: 0
- **ArrivalStatus**: (none)
- **Telemedicine**: (none)
- **TelehealthMode**: 0
- **EVisit**: (none)
- **IsInHomeVisit**: false
- **Copay**: (none)
- **HasPaymentInfo**: false
- **IsFullyPaid**: false
- **IsClinicalNoteAvailable**: false
- **IsNotesOnly**: false
- **IsClinicalInformationAvailable**: true
- **IsVisitSummaryEnabled**: true
- **HasDownloadSummaryLink**: true
- **IsNotViewed**: false
- **IsVisitAmbulatory**: false

### visits 4

- **Csn**: CSN-HOMER-005
- **CsnForECheckIn**: (empty)
- **Id**: VISIT-CSN-HOMER-005
- **ReferenceID**: (empty)
- **Instant**: /Date(1749978000000)/
- **instantISO**: 2025-06-15T09:00:00.000Z
- **PrimaryDate**: 06/15/2025 09:00:00 AM
- **TimeZone**: America/New_York
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **DurationInMinutes**: (none)
- **HasDuration**: false
- **ArrivalTime**: (none)
- **EarlyArrivalReason**: (none)
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **RescheduledDatString**: (none)
- **VisitTypeName**: Office Visit
- **IsUsingFallbackVisitTypeName**: false
- **EncounterType**: 0
- **EncounterIsSurgery**: false
- **EncounterIsEDVisit**: false
- **IsPreadmission**: false
- **IsHovPreadmission**: false
- **IsResidentialMed**: false
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **Cases**: (none)
- **ComponentVisits**: (none)
- **HasComponentVisits**: false
- **PatientNextStepInstructions**: (empty)

#### EpisodeDetails

- **GestationalAge**: (empty)
- **SurgeryTimeOfDay**: 0
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryProvider

- **Name**: Julius Hibbert, MD

#### Providers (1)

##### Providers 1

- **Name**: Julius Hibbert, MD

###### Department

- **Name**: (empty)
- **Address**: (none)
- **PhoneNumber**: (empty)

- **OtherProviders**: (none)
- **GuestPatientFirstName**: (none)

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **Address**: 123 Main Street, Springfield, NT 49007
- **PhoneNumber**: 555-0100

##### Specialty

- **Title**: (empty)
- **Instructions**: (none)
- **ArrivalLocation**: (empty)
- **TimeZone**: America/New_York
- **PreadmissionLocation**: (none)
- **organizationName**: (empty)
- **IsCanceled**: false
- **IsNoShow**: false
- **LeftWithoutSeen**: false
- **InProgress**: false
- **IsArrived**: false
- **IsConfirmed**: false
- **IsCancelRequestSent**: false
- **status**: completed
- **ConfirmationStatus**: 0
- **ArrivalStatus**: (none)
- **Telemedicine**: (none)
- **TelehealthMode**: 0
- **EVisit**: (none)
- **IsInHomeVisit**: false
- **Copay**: (none)
- **HasPaymentInfo**: false
- **IsFullyPaid**: false
- **IsClinicalNoteAvailable**: false
- **IsNotesOnly**: false
- **IsClinicalInformationAvailable**: false
- **IsVisitSummaryEnabled**: false
- **HasDownloadSummaryLink**: false
- **IsNotViewed**: false
- **IsVisitAmbulatory**: false

### visits 5

- **Csn**: CSN-HOMER-006
- **CsnForECheckIn**: (empty)
- **Id**: VISIT-CSN-HOMER-006
- **ReferenceID**: (empty)
- **Instant**: /Date(1743593400000)/
- **instantISO**: 2025-04-02T11:30:00.000Z
- **PrimaryDate**: 04/02/2025 11:30:00 AM
- **TimeZone**: America/New_York
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **DurationInMinutes**: (none)
- **HasDuration**: false
- **ArrivalTime**: (none)
- **EarlyArrivalReason**: (none)
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **RescheduledDatString**: (none)
- **VisitTypeName**: Telephone
- **IsUsingFallbackVisitTypeName**: false
- **EncounterType**: 0
- **EncounterIsSurgery**: false
- **EncounterIsEDVisit**: false
- **IsPreadmission**: false
- **IsHovPreadmission**: false
- **IsResidentialMed**: false
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **Cases**: (none)
- **ComponentVisits**: (none)
- **HasComponentVisits**: false
- **PatientNextStepInstructions**: (empty)

#### EpisodeDetails

- **GestationalAge**: (empty)
- **SurgeryTimeOfDay**: 0
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryProvider

- **Name**: Julius Hibbert, MD

#### Providers (1)

##### Providers 1

- **Name**: Julius Hibbert, MD

###### Department

- **Name**: (empty)
- **Address**: (none)
- **PhoneNumber**: (empty)

- **OtherProviders**: (none)
- **GuestPatientFirstName**: (none)

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **Address**: 123 Main Street, Springfield, NT 49007
- **PhoneNumber**: 555-0100

##### Specialty

- **Title**: (empty)
- **Instructions**: (none)
- **ArrivalLocation**: (empty)
- **TimeZone**: America/New_York
- **PreadmissionLocation**: (none)
- **organizationName**: (empty)
- **IsCanceled**: false
- **IsNoShow**: false
- **LeftWithoutSeen**: false
- **InProgress**: false
- **IsArrived**: false
- **IsConfirmed**: false
- **IsCancelRequestSent**: false
- **status**: completed
- **ConfirmationStatus**: 0
- **ArrivalStatus**: (none)
- **Telemedicine**: (none)
- **TelehealthMode**: 0
- **EVisit**: (none)
- **IsInHomeVisit**: false
- **Copay**: (none)
- **HasPaymentInfo**: false
- **IsFullyPaid**: false
- **IsClinicalNoteAvailable**: false
- **IsNotesOnly**: false
- **IsClinicalInformationAvailable**: false
- **IsVisitSummaryEnabled**: false
- **HasDownloadSummaryLink**: false
- **IsNotViewed**: false
- **IsVisitAmbulatory**: false

### visits 6

- **Csn**: CSN-HOMER-007
- **CsnForECheckIn**: (empty)
- **Id**: VISIT-CSN-HOMER-007
- **ReferenceID**: (empty)
- **Instant**: /Date(1739887200000)/
- **instantISO**: 2025-02-18T14:00:00.000Z
- **PrimaryDate**: 02/18/2025 02:00:00 PM
- **TimeZone**: America/New_York
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **DurationInMinutes**: (none)
- **HasDuration**: false
- **ArrivalTime**: (none)
- **EarlyArrivalReason**: (none)
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **RescheduledDatString**: (none)
- **VisitTypeName**: Office Visit
- **IsUsingFallbackVisitTypeName**: false
- **EncounterType**: 0
- **EncounterIsSurgery**: false
- **EncounterIsEDVisit**: false
- **IsPreadmission**: false
- **IsHovPreadmission**: false
- **IsResidentialMed**: false
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **Cases**: (none)
- **ComponentVisits**: (none)
- **HasComponentVisits**: false
- **PatientNextStepInstructions**: (empty)

#### EpisodeDetails

- **GestationalAge**: (empty)
- **SurgeryTimeOfDay**: 0
- **PrimaryProviderName**: Nick Riviera, MD

#### PrimaryProvider

- **Name**: Nick Riviera, MD

#### Providers (1)

##### Providers 1

- **Name**: Nick Riviera, MD

###### Department

- **Name**: (empty)
- **Address**: (none)
- **PhoneNumber**: (empty)

- **OtherProviders**: (none)
- **GuestPatientFirstName**: (none)

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **Address**: 123 Main Street, Springfield, NT 49007
- **PhoneNumber**: 555-0100

##### Specialty

- **Title**: (empty)
- **Instructions**: (none)
- **ArrivalLocation**: (empty)
- **TimeZone**: America/New_York
- **PreadmissionLocation**: (none)
- **organizationName**: (empty)
- **IsCanceled**: false
- **IsNoShow**: false
- **LeftWithoutSeen**: false
- **InProgress**: false
- **IsArrived**: false
- **IsConfirmed**: false
- **IsCancelRequestSent**: false
- **status**: completed
- **ConfirmationStatus**: 0
- **ArrivalStatus**: (none)
- **Telemedicine**: (none)
- **TelehealthMode**: 0
- **EVisit**: (none)
- **IsInHomeVisit**: false
- **Copay**: (none)
- **HasPaymentInfo**: false
- **IsFullyPaid**: false
- **IsClinicalNoteAvailable**: false
- **IsNotesOnly**: false
- **IsClinicalInformationAvailable**: false
- **IsVisitSummaryEnabled**: false
- **HasDownloadSummaryLink**: false
- **IsNotViewed**: false
- **IsVisitAmbulatory**: false

### visits 7

- **Csn**: CSN-HOMER-008
- **CsnForECheckIn**: (empty)
- **Id**: VISIT-CSN-HOMER-008
- **ReferenceID**: (empty)
- **Instant**: /Date(1733393700000)/
- **instantISO**: 2024-12-05T10:15:00.000Z
- **PrimaryDate**: 12/05/2024 10:15:00 AM
- **TimeZone**: America/New_York
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **DurationInMinutes**: (none)
- **HasDuration**: false
- **ArrivalTime**: (none)
- **EarlyArrivalReason**: (none)
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **RescheduledDatString**: (none)
- **VisitTypeName**: Lab Work
- **IsUsingFallbackVisitTypeName**: false
- **EncounterType**: 0
- **EncounterIsSurgery**: false
- **EncounterIsEDVisit**: false
- **IsPreadmission**: false
- **IsHovPreadmission**: false
- **IsResidentialMed**: false
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **Cases**: (none)
- **ComponentVisits**: (none)
- **HasComponentVisits**: false
- **PatientNextStepInstructions**: (empty)

#### EpisodeDetails

- **GestationalAge**: (empty)
- **SurgeryTimeOfDay**: 0
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryProvider

- **Name**: Julius Hibbert, MD

#### Providers (1)

##### Providers 1

- **Name**: Julius Hibbert, MD

###### Department

- **Name**: (empty)
- **Address**: (none)
- **PhoneNumber**: (empty)

- **OtherProviders**: (none)
- **GuestPatientFirstName**: (none)

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **Address**: 123 Main Street, Springfield, NT 49007
- **PhoneNumber**: 555-0100

##### Specialty

- **Title**: (empty)
- **Instructions**: (none)
- **ArrivalLocation**: (empty)
- **TimeZone**: America/New_York
- **PreadmissionLocation**: (none)
- **organizationName**: (empty)
- **IsCanceled**: false
- **IsNoShow**: false
- **LeftWithoutSeen**: false
- **InProgress**: false
- **IsArrived**: false
- **IsConfirmed**: false
- **IsCancelRequestSent**: false
- **status**: completed
- **ConfirmationStatus**: 0
- **ArrivalStatus**: (none)
- **Telemedicine**: (none)
- **TelehealthMode**: 0
- **EVisit**: (none)
- **IsInHomeVisit**: false
- **Copay**: (none)
- **HasPaymentInfo**: false
- **IsFullyPaid**: false
- **IsClinicalNoteAvailable**: false
- **IsNotesOnly**: false
- **IsClinicalInformationAvailable**: false
- **IsVisitSummaryEnabled**: false
- **HasDownloadSummaryLink**: false
- **IsNotViewed**: false
- **IsVisitAmbulatory**: false

### visits 8

- **Csn**: CSN-HOMER-009
- **CsnForECheckIn**: (empty)
- **Id**: VISIT-CSN-HOMER-009
- **ReferenceID**: (empty)
- **Instant**: /Date(1731426300000)/
- **instantISO**: 2024-11-12T15:45:00.000Z
- **PrimaryDate**: 11/12/2024 03:45:00 PM
- **TimeZone**: America/New_York
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **DurationInMinutes**: (none)
- **HasDuration**: false
- **ArrivalTime**: (none)
- **EarlyArrivalReason**: (none)
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **RescheduledDatString**: (none)
- **VisitTypeName**: Office Visit
- **IsUsingFallbackVisitTypeName**: false
- **EncounterType**: 0
- **EncounterIsSurgery**: false
- **EncounterIsEDVisit**: false
- **IsPreadmission**: false
- **IsHovPreadmission**: false
- **IsResidentialMed**: false
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **Cases**: (none)
- **ComponentVisits**: (none)
- **HasComponentVisits**: false
- **PatientNextStepInstructions**: (empty)

#### EpisodeDetails

- **GestationalAge**: (empty)
- **SurgeryTimeOfDay**: 0
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryProvider

- **Name**: Julius Hibbert, MD

#### Providers (1)

##### Providers 1

- **Name**: Julius Hibbert, MD

###### Department

- **Name**: (empty)
- **Address**: (none)
- **PhoneNumber**: (empty)

- **OtherProviders**: (none)
- **GuestPatientFirstName**: (none)

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **Address**: 123 Main Street, Springfield, NT 49007
- **PhoneNumber**: 555-0100

##### Specialty

- **Title**: (empty)
- **Instructions**: (none)
- **ArrivalLocation**: (empty)
- **TimeZone**: America/New_York
- **PreadmissionLocation**: (none)
- **organizationName**: (empty)
- **IsCanceled**: false
- **IsNoShow**: false
- **LeftWithoutSeen**: false
- **InProgress**: false
- **IsArrived**: false
- **IsConfirmed**: false
- **IsCancelRequestSent**: false
- **status**: completed
- **ConfirmationStatus**: 0
- **ArrivalStatus**: (none)
- **Telemedicine**: (none)
- **TelehealthMode**: 0
- **EVisit**: (none)
- **IsInHomeVisit**: false
- **Copay**: (none)
- **HasPaymentInfo**: false
- **IsFullyPaid**: false
- **IsClinicalNoteAvailable**: false
- **IsNotesOnly**: false
- **IsClinicalInformationAvailable**: false
- **IsVisitSummaryEnabled**: false
- **HasDownloadSummaryLink**: false
- **IsNotViewed**: false
- **IsVisitAmbulatory**: false

### visits 9

- **Csn**: CSN-HOMER-010
- **CsnForECheckIn**: (empty)
- **Id**: VISIT-CSN-HOMER-010
- **ReferenceID**: (empty)
- **Instant**: /Date(1727771400000)/
- **instantISO**: 2024-10-01T08:30:00.000Z
- **PrimaryDate**: 10/01/2024 08:30:00 AM
- **TimeZone**: America/New_York
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **DurationInMinutes**: (none)
- **HasDuration**: false
- **ArrivalTime**: (none)
- **EarlyArrivalReason**: (none)
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **RescheduledDatString**: (none)
- **VisitTypeName**: Procedure
- **IsUsingFallbackVisitTypeName**: false
- **EncounterType**: 0
- **EncounterIsSurgery**: false
- **EncounterIsEDVisit**: false
- **IsPreadmission**: false
- **IsHovPreadmission**: false
- **IsResidentialMed**: false
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **Cases**: (none)
- **ComponentVisits**: (none)
- **HasComponentVisits**: false
- **PatientNextStepInstructions**: (empty)

#### EpisodeDetails

- **GestationalAge**: (empty)
- **SurgeryTimeOfDay**: 0
- **PrimaryProviderName**: Nick Riviera, MD

#### PrimaryProvider

- **Name**: Nick Riviera, MD

#### Providers (1)

##### Providers 1

- **Name**: Nick Riviera, MD

###### Department

- **Name**: (empty)
- **Address**: (none)
- **PhoneNumber**: (empty)

- **OtherProviders**: (none)
- **GuestPatientFirstName**: (none)

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **Address**: 123 Main Street, Springfield, NT 49007
- **PhoneNumber**: 555-0100

##### Specialty

- **Title**: (empty)
- **Instructions**: (none)
- **ArrivalLocation**: (empty)
- **TimeZone**: America/New_York
- **PreadmissionLocation**: (none)
- **organizationName**: (empty)
- **IsCanceled**: false
- **IsNoShow**: false
- **LeftWithoutSeen**: false
- **InProgress**: false
- **IsArrived**: false
- **IsConfirmed**: false
- **IsCancelRequestSent**: false
- **status**: completed
- **ConfirmationStatus**: 0
- **ArrivalStatus**: (none)
- **Telemedicine**: (none)
- **TelehealthMode**: 0
- **EVisit**: (none)
- **IsInHomeVisit**: false
- **Copay**: (none)
- **HasPaymentInfo**: false
- **IsFullyPaid**: false
- **IsClinicalNoteAvailable**: false
- **IsNotesOnly**: false
- **IsClinicalInformationAvailable**: false
- **IsVisitSummaryEnabled**: false
- **HasDownloadSummaryLink**: false
- **IsNotViewed**: false
- **IsVisitAmbulatory**: false

### visits 10

- **Csn**: CSN-HOMER-011
- **CsnForECheckIn**: (empty)
- **Id**: VISIT-CSN-HOMER-011
- **ReferenceID**: (empty)
- **Instant**: /Date(1726405200000)/
- **instantISO**: 2024-09-15T13:00:00.000Z
- **PrimaryDate**: 09/15/2024 01:00:00 PM
- **TimeZone**: America/New_York
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **DurationInMinutes**: (none)
- **HasDuration**: false
- **ArrivalTime**: (none)
- **EarlyArrivalReason**: (none)
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **RescheduledDatString**: (none)
- **VisitTypeName**: Office Visit
- **IsUsingFallbackVisitTypeName**: false
- **EncounterType**: 0
- **EncounterIsSurgery**: false
- **EncounterIsEDVisit**: false
- **IsPreadmission**: false
- **IsHovPreadmission**: false
- **IsResidentialMed**: false
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **Cases**: (none)
- **ComponentVisits**: (none)
- **HasComponentVisits**: false
- **PatientNextStepInstructions**: (empty)

#### EpisodeDetails

- **GestationalAge**: (empty)
- **SurgeryTimeOfDay**: 0
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryProvider

- **Name**: Julius Hibbert, MD

#### Providers (1)

##### Providers 1

- **Name**: Julius Hibbert, MD

###### Department

- **Name**: (empty)
- **Address**: (none)
- **PhoneNumber**: (empty)

- **OtherProviders**: (none)
- **GuestPatientFirstName**: (none)

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **Address**: 123 Main Street, Springfield, NT 49007
- **PhoneNumber**: 555-0100

##### Specialty

- **Title**: (empty)
- **Instructions**: (none)
- **ArrivalLocation**: (empty)
- **TimeZone**: America/New_York
- **PreadmissionLocation**: (none)
- **organizationName**: (empty)
- **IsCanceled**: false
- **IsNoShow**: false
- **LeftWithoutSeen**: false
- **InProgress**: false
- **IsArrived**: false
- **IsConfirmed**: false
- **IsCancelRequestSent**: false
- **status**: completed
- **ConfirmationStatus**: 0
- **ArrivalStatus**: (none)
- **Telemedicine**: (none)
- **TelehealthMode**: 0
- **EVisit**: (none)
- **IsInHomeVisit**: false
- **Copay**: (none)
- **HasPaymentInfo**: false
- **IsFullyPaid**: false
- **IsClinicalNoteAvailable**: false
- **IsNotesOnly**: false
- **IsClinicalInformationAvailable**: false
- **IsVisitSummaryEnabled**: false
- **HasDownloadSummaryLink**: false
- **IsNotViewed**: false
- **IsVisitAmbulatory**: false

### visits 11

- **Csn**: CSN-HOMER-012
- **CsnForECheckIn**: (empty)
- **Id**: VISIT-CSN-HOMER-012
- **ReferenceID**: (empty)
- **Instant**: /Date(1724147100000)/
- **instantISO**: 2024-08-20T09:45:00.000Z
- **PrimaryDate**: 08/20/2024 09:45:00 AM
- **TimeZone**: America/New_York
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **DurationInMinutes**: (none)
- **HasDuration**: false
- **ArrivalTime**: (none)
- **EarlyArrivalReason**: (none)
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **RescheduledDatString**: (none)
- **VisitTypeName**: Telephone
- **IsUsingFallbackVisitTypeName**: false
- **EncounterType**: 0
- **EncounterIsSurgery**: false
- **EncounterIsEDVisit**: false
- **IsPreadmission**: false
- **IsHovPreadmission**: false
- **IsResidentialMed**: false
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **Cases**: (none)
- **ComponentVisits**: (none)
- **HasComponentVisits**: false
- **PatientNextStepInstructions**: (empty)

#### EpisodeDetails

- **GestationalAge**: (empty)
- **SurgeryTimeOfDay**: 0
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryProvider

- **Name**: Julius Hibbert, MD

#### Providers (1)

##### Providers 1

- **Name**: Julius Hibbert, MD

###### Department

- **Name**: (empty)
- **Address**: (none)
- **PhoneNumber**: (empty)

- **OtherProviders**: (none)
- **GuestPatientFirstName**: (none)

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **Address**: 123 Main Street, Springfield, NT 49007
- **PhoneNumber**: 555-0100

##### Specialty

- **Title**: (empty)
- **Instructions**: (none)
- **ArrivalLocation**: (empty)
- **TimeZone**: America/New_York
- **PreadmissionLocation**: (none)
- **organizationName**: (empty)
- **IsCanceled**: false
- **IsNoShow**: false
- **LeftWithoutSeen**: false
- **InProgress**: false
- **IsArrived**: false
- **IsConfirmed**: false
- **IsCancelRequestSent**: false
- **status**: completed
- **ConfirmationStatus**: 0
- **ArrivalStatus**: (none)
- **Telemedicine**: (none)
- **TelehealthMode**: 0
- **EVisit**: (none)
- **IsInHomeVisit**: false
- **Copay**: (none)
- **HasPaymentInfo**: false
- **IsFullyPaid**: false
- **IsClinicalNoteAvailable**: false
- **IsNotesOnly**: false
- **IsClinicalInformationAvailable**: false
- **IsVisitSummaryEnabled**: false
- **HasDownloadSummaryLink**: false
- **IsNotViewed**: false
- **IsVisitAmbulatory**: false

### visits 12

- **Csn**: CSN-HOMER-013
- **CsnForECheckIn**: (empty)
- **Id**: VISIT-CSN-HOMER-013
- **ReferenceID**: (empty)
- **Instant**: /Date(1720612800000)/
- **instantISO**: 2024-07-10T12:00:00.000Z
- **PrimaryDate**: 07/10/2024 12:00:00 PM
- **TimeZone**: America/New_York
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **DurationInMinutes**: (none)
- **HasDuration**: false
- **ArrivalTime**: (none)
- **EarlyArrivalReason**: (none)
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **RescheduledDatString**: (none)
- **VisitTypeName**: Office Visit
- **IsUsingFallbackVisitTypeName**: false
- **EncounterType**: 0
- **EncounterIsSurgery**: false
- **EncounterIsEDVisit**: false
- **IsPreadmission**: false
- **IsHovPreadmission**: false
- **IsResidentialMed**: false
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **Cases**: (none)
- **ComponentVisits**: (none)
- **HasComponentVisits**: false
- **PatientNextStepInstructions**: (empty)

#### EpisodeDetails

- **GestationalAge**: (empty)
- **SurgeryTimeOfDay**: 0
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryProvider

- **Name**: Julius Hibbert, MD

#### Providers (1)

##### Providers 1

- **Name**: Julius Hibbert, MD

###### Department

- **Name**: (empty)
- **Address**: (none)
- **PhoneNumber**: (empty)

- **OtherProviders**: (none)
- **GuestPatientFirstName**: (none)

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **Address**: 123 Main Street, Springfield, NT 49007
- **PhoneNumber**: 555-0100

##### Specialty

- **Title**: (empty)
- **Instructions**: (none)
- **ArrivalLocation**: (empty)
- **TimeZone**: America/New_York
- **PreadmissionLocation**: (none)
- **organizationName**: (empty)
- **IsCanceled**: false
- **IsNoShow**: false
- **LeftWithoutSeen**: false
- **InProgress**: false
- **IsArrived**: false
- **IsConfirmed**: false
- **IsCancelRequestSent**: false
- **status**: completed
- **ConfirmationStatus**: 0
- **ArrivalStatus**: (none)
- **Telemedicine**: (none)
- **TelehealthMode**: 0
- **EVisit**: (none)
- **IsInHomeVisit**: false
- **Copay**: (none)
- **HasPaymentInfo**: false
- **IsFullyPaid**: false
- **IsClinicalNoteAvailable**: false
- **IsNotesOnly**: false
- **IsClinicalInformationAvailable**: false
- **IsVisitSummaryEnabled**: false
- **HasDownloadSummaryLink**: false
- **IsNotViewed**: false
- **IsVisitAmbulatory**: false

### visits 13

- **Csn**: CSN-HOMER-014
- **CsnForECheckIn**: (empty)
- **Id**: VISIT-CSN-HOMER-014
- **ReferenceID**: (empty)
- **Instant**: /Date(1716373800000)/
- **instantISO**: 2024-05-22T10:30:00.000Z
- **PrimaryDate**: 05/22/2024 10:30:00 AM
- **TimeZone**: America/New_York
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **DurationInMinutes**: (none)
- **HasDuration**: false
- **ArrivalTime**: (none)
- **EarlyArrivalReason**: (none)
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **RescheduledDatString**: (none)
- **VisitTypeName**: Office Visit
- **IsUsingFallbackVisitTypeName**: false
- **EncounterType**: 0
- **EncounterIsSurgery**: false
- **EncounterIsEDVisit**: false
- **IsPreadmission**: false
- **IsHovPreadmission**: false
- **IsResidentialMed**: false
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **Cases**: (none)
- **ComponentVisits**: (none)
- **HasComponentVisits**: false
- **PatientNextStepInstructions**: (empty)

#### EpisodeDetails

- **GestationalAge**: (empty)
- **SurgeryTimeOfDay**: 0
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryProvider

- **Name**: Julius Hibbert, MD

#### Providers (1)

##### Providers 1

- **Name**: Julius Hibbert, MD

###### Department

- **Name**: (empty)
- **Address**: (none)
- **PhoneNumber**: (empty)

- **OtherProviders**: (none)
- **GuestPatientFirstName**: (none)

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **Address**: 123 Main Street, Springfield, NT 49007
- **PhoneNumber**: 555-0100

##### Specialty

- **Title**: (empty)
- **Instructions**: (none)
- **ArrivalLocation**: (empty)
- **TimeZone**: America/New_York
- **PreadmissionLocation**: (none)
- **organizationName**: (empty)
- **IsCanceled**: false
- **IsNoShow**: false
- **LeftWithoutSeen**: false
- **InProgress**: false
- **IsArrived**: false
- **IsConfirmed**: false
- **IsCancelRequestSent**: false
- **status**: completed
- **ConfirmationStatus**: 0
- **ArrivalStatus**: (none)
- **Telemedicine**: (none)
- **TelehealthMode**: 0
- **EVisit**: (none)
- **IsInHomeVisit**: false
- **Copay**: (none)
- **HasPaymentInfo**: false
- **IsFullyPaid**: false
- **IsClinicalNoteAvailable**: false
- **IsNotesOnly**: false
- **IsClinicalInformationAvailable**: false
- **IsVisitSummaryEnabled**: false
- **HasDownloadSummaryLink**: false
- **IsNotViewed**: false
- **IsVisitAmbulatory**: false

### visits 14

- **Csn**: CSN-HOMER-015
- **CsnForECheckIn**: (empty)
- **Id**: VISIT-CSN-HOMER-015
- **ReferenceID**: (empty)
- **Instant**: /Date(1710407700000)/
- **instantISO**: 2024-03-14T09:15:00.000Z
- **PrimaryDate**: 03/14/2024 09:15:00 AM
- **TimeZone**: America/New_York
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **DurationInMinutes**: (none)
- **HasDuration**: false
- **ArrivalTime**: (none)
- **EarlyArrivalReason**: (none)
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **RescheduledDatString**: (none)
- **VisitTypeName**: Procedure
- **IsUsingFallbackVisitTypeName**: false
- **EncounterType**: 0
- **EncounterIsSurgery**: false
- **EncounterIsEDVisit**: false
- **IsPreadmission**: false
- **IsHovPreadmission**: false
- **IsResidentialMed**: false
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **Cases**: (none)
- **ComponentVisits**: (none)
- **HasComponentVisits**: false
- **PatientNextStepInstructions**: (empty)

#### EpisodeDetails

- **GestationalAge**: (empty)
- **SurgeryTimeOfDay**: 0
- **PrimaryProviderName**: Nick Riviera, MD

#### PrimaryProvider

- **Name**: Nick Riviera, MD

#### Providers (1)

##### Providers 1

- **Name**: Nick Riviera, MD

###### Department

- **Name**: (empty)
- **Address**: (none)
- **PhoneNumber**: (empty)

- **OtherProviders**: (none)
- **GuestPatientFirstName**: (none)

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **Address**: 123 Main Street, Springfield, NT 49007
- **PhoneNumber**: 555-0100

##### Specialty

- **Title**: (empty)
- **Instructions**: (none)
- **ArrivalLocation**: (empty)
- **TimeZone**: America/New_York
- **PreadmissionLocation**: (none)
- **organizationName**: (empty)
- **IsCanceled**: false
- **IsNoShow**: false
- **LeftWithoutSeen**: false
- **InProgress**: false
- **IsArrived**: false
- **IsConfirmed**: false
- **IsCancelRequestSent**: false
- **status**: completed
- **ConfirmationStatus**: 0
- **ArrivalStatus**: (none)
- **Telemedicine**: (none)
- **TelehealthMode**: 0
- **EVisit**: (none)
- **IsInHomeVisit**: false
- **Copay**: (none)
- **HasPaymentInfo**: false
- **IsFullyPaid**: false
- **IsClinicalNoteAvailable**: false
- **IsNotesOnly**: false
- **IsClinicalInformationAvailable**: false
- **IsVisitSummaryEnabled**: false
- **HasDownloadSummaryLink**: false
- **IsNotViewed**: false
- **IsVisitAmbulatory**: false

### visits 15

- **Csn**: CSN-HOMER-016
- **CsnForECheckIn**: (empty)
- **Id**: VISIT-CSN-HOMER-016
- **ReferenceID**: (empty)
- **Instant**: /Date(1706625900000)/
- **instantISO**: 2024-01-30T14:45:00.000Z
- **PrimaryDate**: 01/30/2024 02:45:00 PM
- **TimeZone**: America/New_York
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **DurationInMinutes**: (none)
- **HasDuration**: false
- **ArrivalTime**: (none)
- **EarlyArrivalReason**: (none)
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **RescheduledDatString**: (none)
- **VisitTypeName**: Telephone
- **IsUsingFallbackVisitTypeName**: false
- **EncounterType**: 0
- **EncounterIsSurgery**: false
- **EncounterIsEDVisit**: false
- **IsPreadmission**: false
- **IsHovPreadmission**: false
- **IsResidentialMed**: false
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **Cases**: (none)
- **ComponentVisits**: (none)
- **HasComponentVisits**: false
- **PatientNextStepInstructions**: (empty)

#### EpisodeDetails

- **GestationalAge**: (empty)
- **SurgeryTimeOfDay**: 0
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryProvider

- **Name**: Julius Hibbert, MD

#### Providers (1)

##### Providers 1

- **Name**: Julius Hibbert, MD

###### Department

- **Name**: (empty)
- **Address**: (none)
- **PhoneNumber**: (empty)

- **OtherProviders**: (none)
- **GuestPatientFirstName**: (none)

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **Address**: 123 Main Street, Springfield, NT 49007
- **PhoneNumber**: 555-0100

##### Specialty

- **Title**: (empty)
- **Instructions**: (none)
- **ArrivalLocation**: (empty)
- **TimeZone**: America/New_York
- **PreadmissionLocation**: (none)
- **organizationName**: (empty)
- **IsCanceled**: false
- **IsNoShow**: false
- **LeftWithoutSeen**: false
- **InProgress**: false
- **IsArrived**: false
- **IsConfirmed**: false
- **IsCancelRequestSent**: false
- **status**: completed
- **ConfirmationStatus**: 0
- **ArrivalStatus**: (none)
- **Telemedicine**: (none)
- **TelehealthMode**: 0
- **EVisit**: (none)
- **IsInHomeVisit**: false
- **Copay**: (none)
- **HasPaymentInfo**: false
- **IsFullyPaid**: false
- **IsClinicalNoteAvailable**: false
- **IsNotesOnly**: false
- **IsClinicalInformationAvailable**: false
- **IsVisitSummaryEnabled**: false
- **HasDownloadSummaryLink**: false
- **IsNotViewed**: false
- **IsVisitAmbulatory**: false

### visits 16

- **Csn**: CSN-HOMER-017
- **CsnForECheckIn**: (empty)
- **Id**: VISIT-CSN-HOMER-017
- **ReferenceID**: (empty)
- **Instant**: /Date(1699441200000)/
- **instantISO**: 2023-11-08T11:00:00.000Z
- **PrimaryDate**: 11/08/2023 11:00:00 AM
- **TimeZone**: America/New_York
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **DurationInMinutes**: (none)
- **HasDuration**: false
- **ArrivalTime**: (none)
- **EarlyArrivalReason**: (none)
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **RescheduledDatString**: (none)
- **VisitTypeName**: Office Visit
- **IsUsingFallbackVisitTypeName**: false
- **EncounterType**: 0
- **EncounterIsSurgery**: false
- **EncounterIsEDVisit**: false
- **IsPreadmission**: false
- **IsHovPreadmission**: false
- **IsResidentialMed**: false
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **Cases**: (none)
- **ComponentVisits**: (none)
- **HasComponentVisits**: false
- **PatientNextStepInstructions**: (empty)

#### EpisodeDetails

- **GestationalAge**: (empty)
- **SurgeryTimeOfDay**: 0
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryProvider

- **Name**: Julius Hibbert, MD

#### Providers (1)

##### Providers 1

- **Name**: Julius Hibbert, MD

###### Department

- **Name**: (empty)
- **Address**: (none)
- **PhoneNumber**: (empty)

- **OtherProviders**: (none)
- **GuestPatientFirstName**: (none)

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **Address**: 123 Main Street, Springfield, NT 49007
- **PhoneNumber**: 555-0100

##### Specialty

- **Title**: (empty)
- **Instructions**: (none)
- **ArrivalLocation**: (empty)
- **TimeZone**: America/New_York
- **PreadmissionLocation**: (none)
- **organizationName**: (empty)
- **IsCanceled**: false
- **IsNoShow**: false
- **LeftWithoutSeen**: false
- **InProgress**: false
- **IsArrived**: false
- **IsConfirmed**: false
- **IsCancelRequestSent**: false
- **status**: completed
- **ConfirmationStatus**: 0
- **ArrivalStatus**: (none)
- **Telemedicine**: (none)
- **TelehealthMode**: 0
- **EVisit**: (none)
- **IsInHomeVisit**: false
- **Copay**: (none)
- **HasPaymentInfo**: false
- **IsFullyPaid**: false
- **IsClinicalNoteAvailable**: false
- **IsNotesOnly**: false
- **IsClinicalInformationAvailable**: false
- **IsVisitSummaryEnabled**: false
- **HasDownloadSummaryLink**: false
- **IsNotViewed**: false
- **IsVisitAmbulatory**: false

### visits 17

- **Csn**: CSN-HOMER-018
- **CsnForECheckIn**: (empty)
- **Id**: VISIT-CSN-HOMER-018
- **ReferenceID**: (empty)
- **Instant**: /Date(1695113100000)/
- **instantISO**: 2023-09-19T08:45:00.000Z
- **PrimaryDate**: 09/19/2023 08:45:00 AM
- **TimeZone**: America/New_York
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **DurationInMinutes**: (none)
- **HasDuration**: false
- **ArrivalTime**: (none)
- **EarlyArrivalReason**: (none)
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **RescheduledDatString**: (none)
- **VisitTypeName**: Lab Work
- **IsUsingFallbackVisitTypeName**: false
- **EncounterType**: 0
- **EncounterIsSurgery**: false
- **EncounterIsEDVisit**: false
- **IsPreadmission**: false
- **IsHovPreadmission**: false
- **IsResidentialMed**: false
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **Cases**: (none)
- **ComponentVisits**: (none)
- **HasComponentVisits**: false
- **PatientNextStepInstructions**: (empty)

#### EpisodeDetails

- **GestationalAge**: (empty)
- **SurgeryTimeOfDay**: 0
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryProvider

- **Name**: Julius Hibbert, MD

#### Providers (1)

##### Providers 1

- **Name**: Julius Hibbert, MD

###### Department

- **Name**: (empty)
- **Address**: (none)
- **PhoneNumber**: (empty)

- **OtherProviders**: (none)
- **GuestPatientFirstName**: (none)

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **Address**: 123 Main Street, Springfield, NT 49007
- **PhoneNumber**: 555-0100

##### Specialty

- **Title**: (empty)
- **Instructions**: (none)
- **ArrivalLocation**: (empty)
- **TimeZone**: America/New_York
- **PreadmissionLocation**: (none)
- **organizationName**: (empty)
- **IsCanceled**: false
- **IsNoShow**: false
- **LeftWithoutSeen**: false
- **InProgress**: false
- **IsArrived**: false
- **IsConfirmed**: false
- **IsCancelRequestSent**: false
- **status**: completed
- **ConfirmationStatus**: 0
- **ArrivalStatus**: (none)
- **Telemedicine**: (none)
- **TelehealthMode**: 0
- **EVisit**: (none)
- **IsInHomeVisit**: false
- **Copay**: (none)
- **HasPaymentInfo**: false
- **IsFullyPaid**: false
- **IsClinicalNoteAvailable**: false
- **IsNotesOnly**: false
- **IsClinicalInformationAvailable**: false
- **IsVisitSummaryEnabled**: false
- **HasDownloadSummaryLink**: false
- **IsNotViewed**: false
- **IsVisitAmbulatory**: false

### visits 18

- **Csn**: CSN-HOMER-019
- **CsnForECheckIn**: (empty)
- **Id**: VISIT-CSN-HOMER-019
- **ReferenceID**: (empty)
- **Instant**: /Date(1688650200000)/
- **instantISO**: 2023-07-06T13:30:00.000Z
- **PrimaryDate**: 07/06/2023 01:30:00 PM
- **TimeZone**: America/New_York
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **DurationInMinutes**: (none)
- **HasDuration**: false
- **ArrivalTime**: (none)
- **EarlyArrivalReason**: (none)
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **RescheduledDatString**: (none)
- **VisitTypeName**: Office Visit
- **IsUsingFallbackVisitTypeName**: false
- **EncounterType**: 0
- **EncounterIsSurgery**: false
- **EncounterIsEDVisit**: false
- **IsPreadmission**: false
- **IsHovPreadmission**: false
- **IsResidentialMed**: false
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **Cases**: (none)
- **ComponentVisits**: (none)
- **HasComponentVisits**: false
- **PatientNextStepInstructions**: (empty)

#### EpisodeDetails

- **GestationalAge**: (empty)
- **SurgeryTimeOfDay**: 0
- **PrimaryProviderName**: Nick Riviera, MD

#### PrimaryProvider

- **Name**: Nick Riviera, MD

#### Providers (1)

##### Providers 1

- **Name**: Nick Riviera, MD

###### Department

- **Name**: (empty)
- **Address**: (none)
- **PhoneNumber**: (empty)

- **OtherProviders**: (none)
- **GuestPatientFirstName**: (none)

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **Address**: 123 Main Street, Springfield, NT 49007
- **PhoneNumber**: 555-0100

##### Specialty

- **Title**: (empty)
- **Instructions**: (none)
- **ArrivalLocation**: (empty)
- **TimeZone**: America/New_York
- **PreadmissionLocation**: (none)
- **organizationName**: (empty)
- **IsCanceled**: false
- **IsNoShow**: false
- **LeftWithoutSeen**: false
- **InProgress**: false
- **IsArrived**: false
- **IsConfirmed**: false
- **IsCancelRequestSent**: false
- **status**: completed
- **ConfirmationStatus**: 0
- **ArrivalStatus**: (none)
- **Telemedicine**: (none)
- **TelehealthMode**: 0
- **EVisit**: (none)
- **IsInHomeVisit**: false
- **Copay**: (none)
- **HasPaymentInfo**: false
- **IsFullyPaid**: false
- **IsClinicalNoteAvailable**: false
- **IsNotesOnly**: false
- **IsClinicalInformationAvailable**: false
- **IsVisitSummaryEnabled**: false
- **HasDownloadSummaryLink**: false
- **IsNotViewed**: false
- **IsVisitAmbulatory**: false

### visits 19

- **Csn**: CSN-HOMER-020
- **CsnForECheckIn**: (empty)
- **Id**: VISIT-CSN-HOMER-020
- **ReferenceID**: (empty)
- **Instant**: /Date(1682416800000)/
- **instantISO**: 2023-04-25T10:00:00.000Z
- **PrimaryDate**: 04/25/2023 10:00:00 AM
- **TimeZone**: America/New_York
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **DurationInMinutes**: (none)
- **HasDuration**: false
- **ArrivalTime**: (none)
- **EarlyArrivalReason**: (none)
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **RescheduledDatString**: (none)
- **VisitTypeName**: Office Visit
- **IsUsingFallbackVisitTypeName**: false
- **EncounterType**: 0
- **EncounterIsSurgery**: false
- **EncounterIsEDVisit**: false
- **IsPreadmission**: false
- **IsHovPreadmission**: false
- **IsResidentialMed**: false
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **Cases**: (none)
- **ComponentVisits**: (none)
- **HasComponentVisits**: false
- **PatientNextStepInstructions**: (empty)

#### EpisodeDetails

- **GestationalAge**: (empty)
- **SurgeryTimeOfDay**: 0
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryProvider

- **Name**: Julius Hibbert, MD

#### Providers (1)

##### Providers 1

- **Name**: Julius Hibbert, MD

###### Department

- **Name**: (empty)
- **Address**: (none)
- **PhoneNumber**: (empty)

- **OtherProviders**: (none)
- **GuestPatientFirstName**: (none)

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **Address**: 123 Main Street, Springfield, NT 49007
- **PhoneNumber**: 555-0100

##### Specialty

- **Title**: (empty)
- **Instructions**: (none)
- **ArrivalLocation**: (empty)
- **TimeZone**: America/New_York
- **PreadmissionLocation**: (none)
- **organizationName**: (empty)
- **IsCanceled**: false
- **IsNoShow**: false
- **LeftWithoutSeen**: false
- **InProgress**: false
- **IsArrived**: false
- **IsConfirmed**: false
- **IsCancelRequestSent**: false
- **status**: completed
- **ConfirmationStatus**: 0
- **ArrivalStatus**: (none)
- **Telemedicine**: (none)
- **TelehealthMode**: 0
- **EVisit**: (none)
- **IsInHomeVisit**: false
- **Copay**: (none)
- **HasPaymentInfo**: false
- **IsFullyPaid**: false
- **IsClinicalNoteAvailable**: false
- **IsNotesOnly**: false
- **IsClinicalInformationAvailable**: false
- **IsVisitSummaryEnabled**: false
- **HasDownloadSummaryLink**: false
- **IsNotViewed**: false
- **IsVisitAmbulatory**: false

### visits 20

- **Csn**: CSN-HOMER-021
- **CsnForECheckIn**: (empty)
- **Id**: VISIT-CSN-HOMER-021
- **ReferenceID**: (empty)
- **Instant**: /Date(1676128500000)/
- **instantISO**: 2023-02-11T15:15:00.000Z
- **PrimaryDate**: 02/11/2023 03:15:00 PM
- **TimeZone**: America/New_York
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **DurationInMinutes**: (none)
- **HasDuration**: false
- **ArrivalTime**: (none)
- **EarlyArrivalReason**: (none)
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **RescheduledDatString**: (none)
- **VisitTypeName**: Telephone
- **IsUsingFallbackVisitTypeName**: false
- **EncounterType**: 0
- **EncounterIsSurgery**: false
- **EncounterIsEDVisit**: false
- **IsPreadmission**: false
- **IsHovPreadmission**: false
- **IsResidentialMed**: false
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **Cases**: (none)
- **ComponentVisits**: (none)
- **HasComponentVisits**: false
- **PatientNextStepInstructions**: (empty)

#### EpisodeDetails

- **GestationalAge**: (empty)
- **SurgeryTimeOfDay**: 0
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryProvider

- **Name**: Julius Hibbert, MD

#### Providers (1)

##### Providers 1

- **Name**: Julius Hibbert, MD

###### Department

- **Name**: (empty)
- **Address**: (none)
- **PhoneNumber**: (empty)

- **OtherProviders**: (none)
- **GuestPatientFirstName**: (none)

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **Address**: 123 Main Street, Springfield, NT 49007
- **PhoneNumber**: 555-0100

##### Specialty

- **Title**: (empty)
- **Instructions**: (none)
- **ArrivalLocation**: (empty)
- **TimeZone**: America/New_York
- **PreadmissionLocation**: (none)
- **organizationName**: (empty)
- **IsCanceled**: false
- **IsNoShow**: false
- **LeftWithoutSeen**: false
- **InProgress**: false
- **IsArrived**: false
- **IsConfirmed**: false
- **IsCancelRequestSent**: false
- **status**: completed
- **ConfirmationStatus**: 0
- **ArrivalStatus**: (none)
- **Telemedicine**: (none)
- **TelehealthMode**: 0
- **EVisit**: (none)
- **IsInHomeVisit**: false
- **Copay**: (none)
- **HasPaymentInfo**: false
- **IsFullyPaid**: false
- **IsClinicalNoteAvailable**: false
- **IsNotesOnly**: false
- **IsClinicalInformationAvailable**: false
- **IsVisitSummaryEnabled**: false
- **HasDownloadSummaryLink**: false
- **IsNotViewed**: false
- **IsVisitAmbulatory**: false

</details>

<details>
<summary><code>mode: concise</code> (11414 chars)</summary>

- **count**: 20
- **hasOlderVisits**: true

## visits (20)

### visits 1

- **Csn**: CSN-HOMER-002
- **PrimaryDate**: 01/10/2026 09:00:00 AM
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **VisitTypeName**: Annual Physical
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **organizationName**: (empty)
- **status**: completed
- **IsClinicalNoteAvailable**: false
- **IsVisitSummaryEnabled**: true

### visits 2

- **Csn**: CSN-HOMER-003
- **PrimaryDate**: 11/20/2025 02:30:00 PM
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **VisitTypeName**: ER Visit - Donut Incident
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **PrimaryProviderName**: Nick Riviera, MD

#### PrimaryDepartment

- **Name**: Springfield General Hospital ER
- **organizationName**: (empty)
- **status**: completed
- **IsClinicalNoteAvailable**: false
- **IsVisitSummaryEnabled**: true

### visits 3

- **Csn**: CSN-HOMER-004
- **PrimaryDate**: 08/05/2025 10:00:00 AM
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **VisitTypeName**: Radiation Screening
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryDepartment

- **Name**: Springfield Nuclear Power Plant Health Center
- **organizationName**: (empty)
- **status**: completed
- **IsClinicalNoteAvailable**: false
- **IsVisitSummaryEnabled**: true

### visits 4

- **Csn**: CSN-HOMER-005
- **PrimaryDate**: 06/15/2025 09:00:00 AM
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **VisitTypeName**: Office Visit
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **organizationName**: (empty)
- **status**: completed
- **IsClinicalNoteAvailable**: false
- **IsVisitSummaryEnabled**: false

### visits 5

- **Csn**: CSN-HOMER-006
- **PrimaryDate**: 04/02/2025 11:30:00 AM
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **VisitTypeName**: Telephone
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **organizationName**: (empty)
- **status**: completed
- **IsClinicalNoteAvailable**: false
- **IsVisitSummaryEnabled**: false

### visits 6

- **Csn**: CSN-HOMER-007
- **PrimaryDate**: 02/18/2025 02:00:00 PM
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **VisitTypeName**: Office Visit
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **PrimaryProviderName**: Nick Riviera, MD

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **organizationName**: (empty)
- **status**: completed
- **IsClinicalNoteAvailable**: false
- **IsVisitSummaryEnabled**: false

### visits 7

- **Csn**: CSN-HOMER-008
- **PrimaryDate**: 12/05/2024 10:15:00 AM
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **VisitTypeName**: Lab Work
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **organizationName**: (empty)
- **status**: completed
- **IsClinicalNoteAvailable**: false
- **IsVisitSummaryEnabled**: false

### visits 8

- **Csn**: CSN-HOMER-009
- **PrimaryDate**: 11/12/2024 03:45:00 PM
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **VisitTypeName**: Office Visit
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **organizationName**: (empty)
- **status**: completed
- **IsClinicalNoteAvailable**: false
- **IsVisitSummaryEnabled**: false

### visits 9

- **Csn**: CSN-HOMER-010
- **PrimaryDate**: 10/01/2024 08:30:00 AM
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **VisitTypeName**: Procedure
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **PrimaryProviderName**: Nick Riviera, MD

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **organizationName**: (empty)
- **status**: completed
- **IsClinicalNoteAvailable**: false
- **IsVisitSummaryEnabled**: false

### visits 10

- **Csn**: CSN-HOMER-011
- **PrimaryDate**: 09/15/2024 01:00:00 PM
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **VisitTypeName**: Office Visit
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **organizationName**: (empty)
- **status**: completed
- **IsClinicalNoteAvailable**: false
- **IsVisitSummaryEnabled**: false

### visits 11

- **Csn**: CSN-HOMER-012
- **PrimaryDate**: 08/20/2024 09:45:00 AM
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **VisitTypeName**: Telephone
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **organizationName**: (empty)
- **status**: completed
- **IsClinicalNoteAvailable**: false
- **IsVisitSummaryEnabled**: false

### visits 12

- **Csn**: CSN-HOMER-013
- **PrimaryDate**: 07/10/2024 12:00:00 PM
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **VisitTypeName**: Office Visit
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **organizationName**: (empty)
- **status**: completed
- **IsClinicalNoteAvailable**: false
- **IsVisitSummaryEnabled**: false

### visits 13

- **Csn**: CSN-HOMER-014
- **PrimaryDate**: 05/22/2024 10:30:00 AM
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **VisitTypeName**: Office Visit
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **organizationName**: (empty)
- **status**: completed
- **IsClinicalNoteAvailable**: false
- **IsVisitSummaryEnabled**: false

### visits 14

- **Csn**: CSN-HOMER-015
- **PrimaryDate**: 03/14/2024 09:15:00 AM
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **VisitTypeName**: Procedure
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **PrimaryProviderName**: Nick Riviera, MD

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **organizationName**: (empty)
- **status**: completed
- **IsClinicalNoteAvailable**: false
- **IsVisitSummaryEnabled**: false

### visits 15

- **Csn**: CSN-HOMER-016
- **PrimaryDate**: 01/30/2024 02:45:00 PM
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **VisitTypeName**: Telephone
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **organizationName**: (empty)
- **status**: completed
- **IsClinicalNoteAvailable**: false
- **IsVisitSummaryEnabled**: false

### visits 16

- **Csn**: CSN-HOMER-017
- **PrimaryDate**: 11/08/2023 11:00:00 AM
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **VisitTypeName**: Office Visit
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **organizationName**: (empty)
- **status**: completed
- **IsClinicalNoteAvailable**: false
- **IsVisitSummaryEnabled**: false

### visits 17

- **Csn**: CSN-HOMER-018
- **PrimaryDate**: 09/19/2023 08:45:00 AM
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **VisitTypeName**: Lab Work
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **organizationName**: (empty)
- **status**: completed
- **IsClinicalNoteAvailable**: false
- **IsVisitSummaryEnabled**: false

### visits 18

- **Csn**: CSN-HOMER-019
- **PrimaryDate**: 07/06/2023 01:30:00 PM
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **VisitTypeName**: Office Visit
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **PrimaryProviderName**: Nick Riviera, MD

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **organizationName**: (empty)
- **status**: completed
- **IsClinicalNoteAvailable**: false
- **IsVisitSummaryEnabled**: false

### visits 19

- **Csn**: CSN-HOMER-020
- **PrimaryDate**: 04/25/2023 10:00:00 AM
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **VisitTypeName**: Office Visit
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **organizationName**: (empty)
- **status**: completed
- **IsClinicalNoteAvailable**: false
- **IsVisitSummaryEnabled**: false

### visits 20

- **Csn**: CSN-HOMER-021
- **PrimaryDate**: 02/11/2023 03:15:00 PM
- **IsTimeToBeDetermined**: false
- **IsHideVisitTime**: false
- **AdmissionDateRange**: (none)
- **DischargeDate**: (none)
- **VisitTypeName**: Telephone
- **ChiefComplaint**: (empty)
- **Diagnoses**: (none)
- **SurgicalProcedures**: (none)
- **PrimaryProviderName**: Julius Hibbert, MD

#### PrimaryDepartment

- **Name**: Springfield General Hospital
- **organizationName**: (empty)
- **status**: completed
- **IsClinicalNoteAvailable**: false
- **IsVisitSummaryEnabled**: false

</details>

<details>
<summary><code>mode: json</code> (38752 chars)</summary>

```json
{
  "count": 20,
  "hasOlderVisits": true,
  "visits": [
    {
      "Csn": "CSN-HOMER-002",
      "CsnForECheckIn": "CSN-HOMER-002",
      "Id": "VISIT-HOMER-002",
      "ReferenceID": "",
      "Instant": "/Date(1768035600000)/",
      "instantISO": "2026-01-10T09:00:00.000Z",
      "PrimaryDate": "01/10/2026 09:00:00 AM",
      "TimeZone": "America/New_York",
      "IsTimeToBeDetermined": false,
      "IsHideVisitTime": false,
      "DurationInMinutes": null,
      "HasDuration": false,
      "ArrivalTime": null,
      "EarlyArrivalReason": null,
      "AdmissionDateRange": null,
      "DischargeDate": null,
      "RescheduledDatString": null,
      "VisitTypeName": "Annual Physical",
      "IsUsingFallbackVisitTypeName": false,
      "EncounterType": 0,
      "EncounterIsSurgery": false,
      "EncounterIsEDVisit": false,
      "IsPreadmission": false,
      "IsHovPreadmission": false,
      "IsResidentialMed": false,
      "ChiefComplaint": "",
      "Diagnoses": [],
      "SurgicalProcedures": [],
      "Cases": [],
      "ComponentVisits": [],
      "HasComponentVisits": false,
      "PatientNextStepInstructions": "",
      "EpisodeDetails": {
        "GestationalAge": ""
      },
      "SurgeryTimeOfDay": 0,
      "PrimaryProviderName": "Julius Hibbert, MD",
      "PrimaryProvider": {
        "Name": "Julius Hibbert, MD"
      },
      "Providers": [
        {
          "Name": "Julius Hibbert, MD",
          "Department": {
            "Name": "",
            "Address": [],
            "PhoneNumber": ""
          }
        }
      ],
      "OtherProviders": [],
      "GuestPatientFirstName": null,
      "PrimaryDepartment": {
        "Name": "Springfield General Hospital",
        "Address": [
          "123 Main Street",
          "Springfield, NT 49007"
        ],
        "PhoneNumber": "555-0100",
        "Specialty": {
          "Title": ""
        },
        "Instructions": [],
        "ArrivalLocation": "",
        "TimeZone": "America/New_York"
      },
      "PreadmissionLocation": null,
      "organizationName": "",
      "IsCanceled": false,
      "IsNoShow": false,
      "LeftWithoutSeen": false,
      "InProgress": false,
      "IsArrived": false,
      "IsConfirmed": false,
      "IsCancelRequestSent": false,
      "status": "completed",
      "ConfirmationStatus": 0,
      "ArrivalStatus": null,
      "Telemedicine": null,
      "TelehealthMode": 0,
      "EVisit": null,
      "IsInHomeVisit": false,
      "Copay": null,
      "HasPaymentInfo": false,
      "IsFullyPaid": false,
      "IsClinicalNoteAvailable": false,
      "IsNotesOnly": false,
      "IsClinicalInformationAvailable": true,
      "IsVisitSummaryEnabled": true,
      "HasDownloadSummaryLink": true,
      "IsNotViewed": false,
      "IsVisitAmbulatory": false
    },
    {
      "Csn": "CSN-HOMER-003",
      "CsnForECheckIn": "CSN-HOMER-003",
      "Id": "VISIT-HOMER-003",
      "ReferenceID": "",
      "Instant": "/Date(1763649000000)/",
      "instantISO": "2025-11-20T14:30:00.000Z",
      "PrimaryDate": "11/20/2025 02:30:00 PM",
      "TimeZone": "America/New_York",
      "IsTimeToBeDetermined": false,
      "IsHideVisitTime": false,
      "DurationInMinutes": null,
      "HasDuration": false,
      "ArrivalTime": null,
      "EarlyArrivalReason": null,
      "AdmissionDateRange": null,
      "DischargeDate": null,
      "RescheduledDatString": null,
      "VisitTypeName": "ER Visit - Donut Incident",
      "IsUsingFallbackVisitTypeName": false,
      "EncounterType": 0,
      "EncounterIsSurgery": false,
      "EncounterIsEDVisit": true,
      "IsPreadmission": false,
      "IsHovPreadmission": false,
      "IsResidentialMed": false,
      "ChiefComplaint": "",
      "Diagnoses": [],
      "SurgicalProcedures": [],
      "Cases": [],
      "ComponentVisits": [],
      "HasComponentVisits": false,
      "PatientNextStepInstructions": "",
      "EpisodeDetails": {
        "GestationalAge": ""
      },
      "SurgeryTimeOfDay": 0,
      "PrimaryProviderName": "Nick Riviera, MD",
      "PrimaryProvider": {
        "Name": "Nick Riviera, MD"
      },
      "Providers": [
        {
          "Name": "Nick Riviera, MD",
          "Department": {
            "Name": "",
            "Address": [],
            "PhoneNumber": ""
          }
        }
      ],
      "OtherProviders": [],
      "GuestPatientFirstName": null,
      "PrimaryDepartment": {
        "Name": "Springfield General Hospital ER",
        "Address": [
          "123 Main Street",
          "Springfield, NT 49007"
        ],
        "PhoneNumber": "555-0100",
        "Specialty": {
          "Title": ""
        },
        "Instructions": [],
        "ArrivalLocation": "",
        "TimeZone": "America/New_York"
      },
      "PreadmissionLocation": null,
      "organizationName": "",
      "IsCanceled": false,
      "IsNoShow": false,
      "LeftWithoutSeen": false,
      "InProgress": false,
      "IsArrived": false,
      "IsConfirmed": false,
      "IsCancelRequestSent": false,
      "status": "completed",
      "ConfirmationStatus": 0,
      "ArrivalStatus": null,
      "Telemedicine": null,
      "TelehealthMode": 0,
      "EVisit": null,
      "IsInHomeVisit": false,
      "Copay": null,
      "HasPaymentInfo": false,
      "IsFullyPaid": false,
      "IsClinicalNoteAvailable": false,
      "IsNotesOnly": false,
      "IsClinicalInformationAvailable": true,
      "IsVisitSummaryEnabled": true,
      "HasDownloadSummaryLink": true,
      "IsNotViewed": false,
      "IsVisitAmbulatory": false
    },
    {
      "Csn": "CSN-HOMER-004",
      "CsnForECheckIn": "CSN-HOMER-004",
      "Id": "VISIT-HOMER-004",
      "ReferenceID": "",
      "Instant": "/Date(1754388000000)/",
      "instantISO": "2025-08-05T10:00:00.000Z",
      "PrimaryDate": "08/05/2025 10:00:00 AM",
      "TimeZone": "America/New_York",
      "IsTimeToBeDetermined": false,
      "IsHideVisitTime": false,
      "DurationInMinutes": null,
      "HasDuration": false,
      "ArrivalTime": null,
      "EarlyArrivalReason": null,
      "AdmissionDateRange": null,
      "DischargeDate": null,
      "RescheduledDatString": null,
      "VisitTypeName": "Radiation Screening",
      "IsUsingFallbackVisitTypeName": false,
      "EncounterType": 0,
      "EncounterIsSurgery": false,
      "EncounterIsEDVisit": false,
      "IsPreadmission": false,
      "IsHovPreadmission": false,
      "IsResidentialMed": false,
      "ChiefComplaint": "",
      "Diagnoses": [],
      "SurgicalProcedures": [],
      "Cases": [],
      "ComponentVisits": [],
      "HasComponentVisits": false,
      "PatientNextStepInstructions": "",
      "EpisodeDetails": {
        "GestationalAge": ""
      },
      "SurgeryTimeOfDay": 0,
      "PrimaryProviderName": "Julius Hibbert, MD",
      "PrimaryProvider": {
        "Name": "Julius Hibbert, MD"
      },
      "Providers": [
        {
          "Name": "Julius Hibbert, MD",
          "Department": {
            "Name": "",
            "Address": [],
            "PhoneNumber": ""
          }
        }
      ],
      "OtherProviders": [],
      "GuestPatientFirstName": null,
      "PrimaryDepartment": {
        "Name": "Springfield Nuclear Power Plant Health Center",
        "Address": [
          "100 Industrial Way",
          "Springfield, NT 49007"
        ],
        "PhoneNumber": "555-0100",
        "Specialty": {
          "Title": ""
        },
        "Instructions": [],
        "ArrivalLocation": "",
        "TimeZone": "America/New_York"
      },
      "PreadmissionLocation": null,
      "organizationName": "",
      "IsCanceled": false,
      "IsNoShow": false,
      "LeftWithoutSeen": false,
      "InProgress": false,
      "IsArrived": false,
      "IsConfirmed": false,
      "IsCancelRequestSent": false,
      "status": "completed",
      "ConfirmationStatus": 0,
      "ArrivalStatus": null,
      "Telemedicine": null,
      "TelehealthMode": 0,
      "EVisit": null,
      "IsInHomeVisit": false,
      "Copay": null,
      "HasPaymentInfo": false,
      "IsFullyPaid": false,
      "IsClinicalNoteAvailable": false,
      "IsNotesOnly": false,
      "IsClinicalInformationAvailable": true,
      "IsVisitSummaryEnabled": true,
      "HasDownloadSummaryLink": true,
      "IsNotViewed": false,
      "IsVisitAmbulatory": false
    },
    {
      "Csn": "CSN-HOMER-005",
      "CsnForECheckIn": "",
      "Id": "VISIT-CSN-HOMER-005",
      "ReferenceID": "",
      "Instant": "/Date(1749978000000)/",
      "instantISO": "2025-06-15T09:00:00.000Z",
      "PrimaryDate": "06/15/2025 09:00:00 AM",
      "TimeZone": "America/New_York",
      "IsTimeToBeDetermined": false,
      "IsHideVisitTime": false,
      "DurationInMinutes": null,
      "HasDuration": false,
      "ArrivalTime": null,
      "EarlyArrivalReason": null,
      "AdmissionDateRange": null,
      "DischargeDate": null,
      "RescheduledDatString": null,
      "VisitTypeName": "Office Visit",
      "IsUsingFallbackVisitTypeName": false,
      "EncounterType": 0,
      "EncounterIsSurgery": false,
      "EncounterIsEDVisit": false,
      "IsPreadmission": false,
      "IsHovPreadmission": false,
      "IsResidentialMed": false,
      "ChiefComplaint": "",
      "Diagnoses": [],
      "SurgicalProcedures": [],
      "Cases": [],
      "ComponentVisits": [],
      "HasComponentVisits": false,
      "PatientNextStepInstructions": "",
      "EpisodeDetails": {
        "GestationalAge": ""
      },
      "SurgeryTimeOfDay": 0,
      "PrimaryProviderName": "Julius Hibbert, MD",
      "PrimaryProvider": {
        "Name": "Julius Hibbert, MD"
      },
      "Providers": [
        {
          "Name": "Julius Hibbert, MD",
          "Department": {
            "Name": "",
            "Address": [],
            "PhoneNumber": ""
          }
        }
      ],
      "OtherProviders": [],
      "GuestPatientFirstName": null,
      "PrimaryDepartment": {
        "Name": "Springfield General Hospital",
        "Address": [
          "123 Main Street",
          "Springfield, NT 49007"
        ],
        "PhoneNumber": "555-0100",
        "Specialty": {
          "Title": ""
        },
        "Instructions": [],
        "ArrivalLocation": "",
        "TimeZone": "America/New_York"
      },
      "PreadmissionLocation": null,
      "organizationName": "",
      "IsCanceled": false,
      "IsNoShow": false,
      "LeftWithoutSeen": false,
      "InProgress": false,
      "IsArrived": false,
      "IsConfirmed": false,
      "IsCancelRequestSent": false,
      "status": "completed",
      "ConfirmationStatus": 0,
      "ArrivalStatus": null,
      "Telemedicine": null,
      "TelehealthMode": 0,
      "EVisit": null,
      "IsInHomeVisit": false,
      "Copay": null,
      "HasPaymentInfo": false,
      "IsFullyPaid": false,
      "IsClinicalNoteAvailable": false,
      "IsNotesOnly": false,
      "IsClinicalInformationAvailable": false,
      "IsVisitSummaryEnabled": false,
      "HasDownloadSummaryLink": false,
      "IsNotViewed": false,
      "IsVisitAmbulatory": false
    },
    {
      "Csn": "CSN-HOMER-006",
      "CsnForECheckIn": "",
      "Id": "VISIT-CSN-HOMER-006",
      "ReferenceID": "",
      "Instant": "/Date(1743593400000)/",
      "instantISO": "2025-04-02T11:30:00.000Z",
      "PrimaryDate": "04/02/2025 11:30:00 AM",
      "TimeZone": "America/New_York",
      "IsTimeToBeDetermined": false,
      "IsHideVisitTime": false,
      "DurationInMinutes": null,
      "HasDuration": false,
      "ArrivalTime": null,
      "EarlyArrivalReason": null,
      "AdmissionDateRange": null,
      "DischargeDate": null,
      "RescheduledDatString": null,
      "VisitTypeName": "Telephone",
      "IsUsingFallbackVisitTypeName": false,
      "EncounterType": 0,
      "EncounterIsSurgery": false,
      "EncounterIsEDVisit": false,
      "IsPreadmission": false,
      "IsHovPreadmission": false,
      "IsResidentialMed": false,
      "ChiefComplaint": "",
      "Diagnoses": [],
      "SurgicalProc
… (truncated; 42828 more characters)
```

</details>

---

### `get_visit_notes`

List the clinical notes (operative, progress, anesthesia, …) attached to a past visit. Returns lrpID and, per note, hnoID and hnoDAT — pass those to get_note_content.

Arguments: ```json
{"csn":"CSN-HOMER-002"}
```

<details>
<summary><code>mode: raw</code> (353 chars)</summary>

```json
{
  "lrpID": "LRP-HOMER-002",
  "depPhoneNumber": "555-0100",
  "isAtLeastOneNoteSensitive": false,
  "noteList": [
    {
      "hnoID": "HNO-HOMER-002-A",
      "hnoDAT": "67800",
      "displayName": "Progress Note",
      "iso": "2026-01-10T09:30:00Z",
      "isAddendum": false,
      "provider": {
        "name": "Julius Hibbert, MD",
        "hasPhotoOnBlob": false,
        "magicID": "PROV-HIBBERT"
      },
      "isNoteSensitive": false,
      "attachments": []
    }
  ]
}
```

</details>

<details>
<summary><code>mode: standard</code> (424 chars)</summary>

- **csn**: CSN-HOMER-002
- **lrpID**: LRP-HOMER-002
- **depPhoneNumber**: 555-0100
- **isAtLeastOneNoteSensitive**: false

## noteList (1)

### noteList 1

- **hnoID**: HNO-HOMER-002-A
- **hnoDAT**: 67800
- **displayName**: Progress Note
- **iso**: 2026-01-10T09:30:00Z

#### provider

- **name**: Julius Hibbert, MD
- **magicID**: PROV-HIBBERT
- **isAddendum**: false
- **isNoteSensitive**: false
- **attachments**: (none)

</details>

<details>
<summary><code>mode: concise</code> (247 chars)</summary>

- **csn**: CSN-HOMER-002
- **lrpID**: LRP-HOMER-002

## noteList (1)

### noteList 1

- **hnoID**: HNO-HOMER-002-A
- **hnoDAT**: 67800
- **displayName**: Progress Note
- **iso**: 2026-01-10T09:30:00Z

#### provider

- **name**: Julius Hibbert, MD

</details>

<details>
<summary><code>mode: json</code> (352 chars)</summary>

```json
{
  "csn": "CSN-HOMER-002",
  "lrpID": "LRP-HOMER-002",
  "depPhoneNumber": "555-0100",
  "isAtLeastOneNoteSensitive": false,
  "noteList": [
    {
      "hnoID": "HNO-HOMER-002-A",
      "hnoDAT": "67800",
      "displayName": "Progress Note",
      "iso": "2026-01-10T09:30:00Z",
      "provider": {
        "name": "Julius Hibbert, MD",
        "magicID": "PROV-HIBBERT"
      },
      "isAddendum": false,
      "isNoteSensitive": false,
      "attachments": []
    }
  ]
}
```

</details>

---

### `get_note_content`

Fetch the rendered content of a single clinical note listed by get_visit_notes.

Arguments: ```json
{"csn":"CSN-HOMER-002","lrp_id":"LRP-HOMER-002","hno_id":"HNO-HOMER-002-A","hno_dat":"67800"}
```

<details>
<summary><code>mode: raw</code> (687 chars)</summary>

```json
{
  "reportContent": "<div class=\"note-body\"><h3>Progress Note - Annual Physical</h3><p><strong>Patient:</strong> Homer J. Simpson, age 69</p><p><strong>Provider:</strong> Julius Hibbert, MD</p><p><strong>Subjective:</strong> Patient reports overall feeling well. No acute complaints. Continues to work at Springfield Nuclear Power Plant.</p><p><strong>Objective:</strong> BP 145/95, HR 88, BMI 35.3 (obese).</p><p><strong>Assessment:</strong> Obesity. Hypertension, not at goal. Hypercholesterolemia.</p><p><strong>Plan:</strong> Reinforce dietary counseling. Continue current medications. Return in 3 months for re-evaluation.</p></div>",
  "reportCss": "",
  "baseFontSize": 0,
  "stylesheets": []
}
```

</details>

<details>
<summary><code>mode: standard</code> (497 chars)</summary>

- **reportContentText**:

Progress Note - Annual Physical  
  
Patient: Homer J. Simpson, age 69  
  
Provider: Julius Hibbert, MD  
  
Subjective: Patient reports overall feeling well. No acute complaints. Continues to work at Springfield Nuclear Power Plant.  
  
Objective: BP 145/95, HR 88, BMI 35.3 (obese).  
  
Assessment: Obesity. Hypertension, not at goal. Hypercholesterolemia.  
  
Plan: Reinforce dietary counseling. Continue current medications. Return in 3 months for re-evaluation.

</details>

<details>
<summary><code>mode: concise</code> (497 chars)</summary>

- **reportContentText**:

Progress Note - Annual Physical  
  
Patient: Homer J. Simpson, age 69  
  
Provider: Julius Hibbert, MD  
  
Subjective: Patient reports overall feeling well. No acute complaints. Continues to work at Springfield Nuclear Power Plant.  
  
Objective: BP 145/95, HR 88, BMI 35.3 (obese).  
  
Assessment: Obesity. Hypertension, not at goal. Hypercholesterolemia.  
  
Plan: Reinforce dietary counseling. Continue current medications. Return in 3 months for re-evaluation.

</details>

<details>
<summary><code>mode: json</code> (482 chars)</summary>

```json
{
  "reportContentText": "Progress Note - Annual Physical\n\nPatient: Homer J. Simpson, age 69\n\nProvider: Julius Hibbert, MD\n\nSubjective: Patient reports overall feeling well. No acute complaints. Continues to work at Springfield Nuclear Power Plant.\n\nObjective: BP 145/95, HR 88, BMI 35.3 (obese).\n\nAssessment: Obesity. Hypertension, not at goal. Hypercholesterolemia.\n\nPlan: Reinforce dietary counseling. Continue current medications. Return in 3 months for re-evaluation."
}
```

</details>

---

### `get_visit_avs`

The After Visit Summary for a past visit.

Arguments: ```json
{"csn":"CSN-HOMER-002"}
```

<details>
<summary><code>mode: raw</code> (712 chars)</summary>

```json
{
  "reportContent": "<div class=\"avs-body\"><h2>After Visit Summary</h2><p><strong>Patient:</strong> Homer J. Simpson</p><p><strong>Visit Date:</strong> January 10, 2026</p><p><strong>Provider:</strong> Julius Hibbert, MD</p><p><strong>Reason for Visit:</strong> Annual Physical</p><h3>What we discussed today</h3><ul><li>Weight management - referred to dietitian</li><li>Blood pressure not at goal - continue current medications</li><li>Lipid panel results - reviewed</li></ul><h3>Medications</h3><ul><li>Lisinopril 10mg daily</li><li>Atorvastatin 20mg daily</li></ul><h3>Next Steps</h3><p>Follow up in 3 months. Schedule lipid panel before next visit.</p></div>",
  "reportCss": "",
  "baseFontSize": 0,
  "stylesheets": []
}
```

</details>

<details>
<summary><code>mode: standard</code> (526 chars)</summary>

- **reportContentText**:

After Visit Summary  
  
Patient: Homer J. Simpson  
  
Visit Date: January 10, 2026  
  
Provider: Julius Hibbert, MD  
  
Reason for Visit: Annual Physical  
  
  
What we discussed today  
  
- Weight management - referred to dietitian  
- Blood pressure not at goal - continue current medications  
- Lipid panel results - reviewed  
  
  
Medications  
  
- Lisinopril 10mg daily  
- Atorvastatin 20mg daily  
  
  
Next Steps  
  
Follow up in 3 months. Schedule lipid panel before next visit.

</details>

<details>
<summary><code>mode: concise</code> (526 chars)</summary>

- **reportContentText**:

After Visit Summary  
  
Patient: Homer J. Simpson  
  
Visit Date: January 10, 2026  
  
Provider: Julius Hibbert, MD  
  
Reason for Visit: Annual Physical  
  
  
What we discussed today  
  
- Weight management - referred to dietitian  
- Blood pressure not at goal - continue current medications  
- Lipid panel results - reviewed  
  
  
Medications  
  
- Lisinopril 10mg daily  
- Atorvastatin 20mg daily  
  
  
Next Steps  
  
Follow up in 3 months. Schedule lipid panel before next visit.

</details>

<details>
<summary><code>mode: json</code> (497 chars)</summary>

```json
{
  "reportContentText": "After Visit Summary\n\nPatient: Homer J. Simpson\n\nVisit Date: January 10, 2026\n\nProvider: Julius Hibbert, MD\n\nReason for Visit: Annual Physical\n\n\nWhat we discussed today\n\n- Weight management - referred to dietitian\n- Blood pressure not at goal - continue current medications\n- Lipid panel results - reviewed\n\n\nMedications\n\n- Lisinopril 10mg daily\n- Atorvastatin 20mg daily\n\n\nNext Steps\n\nFollow up in 3 months. Schedule lipid panel before next visit."
}
```

</details>

---

### `get_lab_results`

Lab results with reference ranges and prior values for trending.

<details>
<summary><code>mode: raw</code> (41884 chars)</summary>

```json
{
  "requests": [
    {
      "path": "/app/test-results",
      "method": "GET",
      "status": 200,
      "contentType": "text/html; charset=utf-8",
      "body": "<!DOCTYPE html>\n<html xmlns=\"http://www.w3.org/1999/xhtml\" lang=\"en\" dir=\"ltr\">\n<head>\n  <title>MyChart</title>\n  <meta http-equiv=\"content-type\" content=\"text/html; charset=utf-8\" />\n</head>\n<body>\n  <div class='hidden' id='__CSRFContainer'><input name=\"__RequestVerificationToken\" type=\"hidden\" value=\"fake-csrf-token-00000000000000000000000000000000\" /></div>\n  <script>\n(function () {\n  var originalFetch = window.fetch;\n  window.fetch = function (url, opts) {\n    opts = opts || {};\n    if ((opts.method || 'GET').toUpperCase() === 'POST') {\n      var el = document.querySelector('#__CSRFContainer input[name=__RequestVerificationToken]');\n      if (el) {\n        opts.headers = opts.headers || {};\n        if (!opts.headers['__RequestVerificationToken']) {\n          opts.headers['__RequestVerificationToken'] = el.value;\n        }\n      }\n    }\n    return originalFetch.call(this, url, opts);\n  };\n})();\n</script>\n  <div></div>\n</body>\n</html>",
      "purpose": "token"
    },
    {
      "path": "/api/test-results/GetList",
      "method": "POST",
      "requestBody": {
        "groupType": 0,
        "searchString": "",
        "maxResults": 1000,
        "isCurAdmFilterEnabled": false
      },
      "status": 200,
      "contentType": "application/json;charset=utf-8",
      "body": {
        "areResultsFullyLoaded": true,
        "isGroupingFullyLoaded": true,
        "groupBy": "ORDER",
        "newResultGroups": [
          {
            "key": "GRP-CMP",
            "contactType": "",
            "resultList": [
              "RES-CMP"
            ],
            "isInpatient": false,
            "isEDVisit": false,
            "isCurrentAdmission": false,
            "formattedAdmitDate": "",
            "formattedDischargeDate": "",
            "visitProviderID": "PROV-HIBBERT",
            "organizationID": "ORG-SPRINGFIELD",
            "sortDate": "2026-01-10T10:30:00",
            "admitInstant": {
              "instantISO": "",
              "includesTime": false
            },
            "dischargeInstant": {
              "instantISO": "",
              "includesTime": false
            },
            "formattedDate": "Jan 10, 2026",
            "isLargeGroup": false
          },
          {
            "key": "GRP-LIPID",
            "contactType": "",
            "resultList": [
              "RES-LIPID"
            ],
            "isInpatient": false,
            "isEDVisit": false,
            "isCurrentAdmission": false,
            "formattedAdmitDate": "",
            "formattedDischargeDate": "",
            "visitProviderID": "PROV-HIBBERT",
            "organizationID": "ORG-SPRINGFIELD",
            "sortDate": "2026-01-10T10:30:00",
            "admitInstant": {
              "instantISO": "",
              "includesTime": false
            },
            "dischargeInstant": {
              "instantISO": "",
              "includesTime": false
            },
            "formattedDate": "Jan 10, 2026",
            "isLargeGroup": false
          },
          {
            "key": "GRP-CBC",
            "contactType": "",
            "resultList": [
              "RES-CBC"
            ],
            "isInpatient": false,
            "isEDVisit": false,
            "isCurrentAdmission": false,
            "formattedAdmitDate": "",
            "formattedDischargeDate": "",
            "visitProviderID": "PROV-HIBBERT",
            "organizationID": "ORG-SPRINGFIELD",
            "sortDate": "2026-01-10T10:30:00",
            "admitInstant": {
              "instantISO": "",
              "includesTime": false
            },
            "dischargeInstant": {
              "instantISO": "",
              "includesTime": false
            },
            "formattedDate": "Jan 10, 2026",
            "isLargeGroup": false
          },
          {
            "key": "GRP-XRAY",
            "contactType": "",
            "resultList": [
              "RES-XRAY"
            ],
            "isInpatient": false,
            "isEDVisit": false,
            "isCurrentAdmission": false,
            "formattedAdmitDate": "",
            "formattedDischargeDate": "",
            "visitProviderID": "PROV-HIBBERT",
            "organizationID": "ORG-SPRINGFIELD",
            "sortDate": "2025-08-05T10:00:00",
            "admitInstant": {
              "instantISO": "",
              "includesTime": false
            },
            "dischargeInstant": {
              "instantISO": "",
              "includesTime": false
            },
            "formattedDate": "Aug 5, 2025",
            "isLargeGroup": false
          },
          {
            "key": "GRP-CT",
            "contactType": "",
            "resultList": [
              "RES-CT"
            ],
            "isInpatient": false,
            "isEDVisit": false,
            "isCurrentAdmission": false,
            "formattedAdmitDate": "",
            "formattedDischargeDate": "",
            "visitProviderID": "PROV-HIBBERT",
            "organizationID": "ORG-SPRINGFIELD",
            "sortDate": "2025-09-15T14:30:00",
            "admitInstant": {
              "instantISO": "",
              "includesTime": false
            },
            "dischargeInstant": {
              "instantISO": "",
              "includesTime": false
            },
            "formattedDate": "Sep 15, 2025",
            "isLargeGroup": false
          }
        ],
        "organizationLoadMoreInfo": {},
        "newResults": {
          "RES-CMP^": {
            "canGenerateLLMSummary": false,
            "feedbackSubmitted": false,
            "isBedsideTablet": false,
            "name": "Comprehensive Metabolic Panel",
            "key": "RES-CMP",
            "showName": false,
            "showDetails": true,
            "orderMetadata": {
              "orderProviderName": "Julius Hibbert, MD",
              "authorizingProviderName": "Julius Hibbert, MD",
              "authorizingProviderID": "PROV-HIBBERT",
              "prioritizedInstantISO": "2026-01-10T10:30:00",
              "prioritizedInstantDisplay": "Jan 10, 2026 10:30 AM",
              "resultType": "LAB",
              "read": "Read"
            },
            "resultComponents": [],
            "shouldHideHistoricalData": false,
            "scans": [],
            "shareEverywhereLogin": false,
            "showProviderNotReviewed": false,
            "providerComments": [],
            "tooManyVariants": false,
            "hasComment": false,
            "hasAllDetails": false,
            "isAbnormal": false
          },
          "RES-LIPID^": {
            "canGenerateLLMSummary": false,
            "feedbackSubmitted": false,
            "isBedsideTablet": false,
            "name": "Lipid Panel",
            "key": "RES-LIPID",
            "showName": false,
            "showDetails": true,
            "orderMetadata": {
              "orderProviderName": "Julius Hibbert, MD",
              "authorizingProviderName": "Julius Hibbert, MD",
              "authorizingProviderID": "PROV-HIBBERT",
              "prioritizedInstantISO": "2026-01-10T10:30:00",
              "prioritizedInstantDisplay": "Jan 10, 2026 10:30 AM",
              "resultType": "LAB",
              "read": "Read"
            },
            "resultComponents": [],
            "shouldHideHistoricalData": false,
            "scans": [],
            "shareEverywhereLogin": false,
            "showProviderNotReviewed": false,
            "providerComments": [],
            "tooManyVariants": false,
            "hasComment": false,
            "hasAllDetails": false,
            "isAbnormal": true
          },
          "RES-CBC^": {
            "canGenerateLLMSummary": false,
            "feedbackSubmitted": false,
            "isBedsideTablet": false,
            "name": "Complete Blood Count",
            "key": "RES-CBC",
            "showName": false,
            "showDetails": true,
            "orderMetadata": {
              "orderProviderName": "Julius Hibbert, MD",
              "authorizingProviderName": "Julius Hibbert, MD",
              "authorizingProviderID": "PROV-HIBBERT",
              "prioritizedInstantISO": "2026-01-10T10:30:00",
              "prioritizedInstantDisplay": "Jan 10, 2026 10:30 AM",
              "resultType": "LAB",
              "read": "Read"
            },
            "resultComponents": [],
            "shouldHideHistoricalData": false,
            "scans": [],
            "shareEverywhereLogin": false,
            "showProviderNotReviewed": false,
            "providerComments": [],
            "tooManyVariants": false,
            "hasComment": false,
            "hasAllDetails": false,
            "isAbnormal": false
          },
          "RES-XRAY^": {
            "canGenerateLLMSummary": false,
            "feedbackSubmitted": false,
            "isBedsideTablet": false,
            "name": "XR Skull 2 Views",
            "key": "RES-XRAY",
            "showName": false,
            "showDetails": true,
            "orderMetadata": {
              "orderProviderName": "Julius Hibbert, MD",
              "authorizingProviderName": "Julius Hibbert, MD",
              "authorizingProviderID": "PROV-HIBBERT",
              "prioritizedInstantISO": "2025-08-05T11:00:00",
              "prioritizedInstantDisplay": "Aug 5, 2025 11:00 AM",
              "resultType": "IMAGING",
              "read": "Read"
            },
            "resultComponents": [],
            "shouldHideHistoricalData": false,
            "scans": [],
            "shareEverywhereLogin": false,
            "showProviderNotReviewed": false,
            "providerComments": [],
            "tooManyVariants": false,
            "hasComment": false,
            "hasAllDetails": false,
            "isAbnormal": false
          },
          "RES-CT^": {
            "canGenerateLLMSummary": false,
            "feedbackSubmitted": false,
            "isBedsideTablet": false,
            "name": "CT Head without Contrast",
            "key": "RES-CT",
            "showName": false,
            "showDetails": true,
            "orderMetadata": {
              "orderProviderName": "Julius Hibbert, MD",
              "authorizingProviderName": "Julius Hibbert, MD",
              "authorizingProviderID": "PROV-HIBBERT",
              "prioritizedInstantISO": "2025-09-15T15:00:00",
              "prioritizedInstantDisplay": "Sep 15, 2025 3:00 PM",
              "resultType": "IMAGING",
              "read": "Read"
            },
            "resultComponents": [],
            "shouldHideHistoricalData": false,
            "scans": [],
            "shareEverywhereLogin": false,
            "showProviderNotReviewed": false,
            "providerComments": [],
            "tooManyVariants": false,
            "hasComment": false,
            "hasAllDetails": false,
            "isAbnormal": false
          }
        },
        "newProviderPhotoInfo": {
          "PROV-HIBBERT^": {
            "name": "Julius Hibbert, MD",
            "empId": "",
            "remoteEncrypted": false,
            "photoUrl": "",
            "providerId": "PROV-HIBBERT",
            "organizationId": ""
          }
        },
        "newComments": {}
      }
    },
    {
      "path": "/api/test-results/GetDetails",
      "method": "POST",
      "requestBody": {
        "orderKey": "GRP-CMP",
        "organizationID": "",
        "PageNonce": ""
      },
      "status": 200,
      "contentType": "application/json;charset=utf-8",
      "body": {
        "orderName": "Comprehensive Metabolic Panel",
        "key": "RES-CMP",
        "results": [
          {
            "canGenerateLLMSummary": false,
            "feedbackSubmitted": false,
            "isBedsideTablet": false,
            "name": "C
… (truncated; 59318 more characters)
```

</details>

<details>
<summary><code>mode: standard</code> (21357 chars)</summary>

## orders (5)

### orders 1

- **orderName**: Comprehensive Metabolic Panel
- **key**: RES-CMP
- **isInpatient**: false
- **isEDVisit**: false
- **formattedAdmitDate**: (empty)
- **formattedDischargeDate**: (empty)

#### results (1)

##### results 1

- **name**: Comprehensive Metabolic Panel
- **key**: RES-CMP
- **isAbnormal**: false
- **hasComment**: false
- **warningType**: (empty)
- **warningMessage**: (empty)

###### orderMetadata

- **prioritizedInstantISO**: 2026-01-10T10:30:00
- **prioritizedInstantDisplay**: Jan 10, 2026 10:30 AM
- **resultTimestampDisplay**: Jan 10, 2026 10:30 AM
- **latestUpdateInstantISO**: 2026-01-10T10:30:00
- **collectionTimestampsDisplay**: Jan 10, 2026 9:00 AM
- **specimensDisplay**: Blood
- **resultStatus**: Final
- **orderProviderName**: Julius Hibbert, MD
- **authorizingProviderName**: (none)
- **readingProviderName**: (empty)
- **resultType**: LAB
- **associatedDiagnoses**: (none)

###### resultingLab

- **name**: Springfield General Hospital Lab
- **address**: 123 Main Street, Springfield, NT 49007
- **phoneNumber**: (555) 636-3000
- **labDirector**: Julius Hibbert, MD
- **cliaNumber**: (empty)
- **accreditationType**: (empty)

###### resultComponents (5)

###### resultComponents 1

###### componentInfo

- **componentID**: COMP-GLU
- **name**: Glucose
- **commonName**: Glucose
- **units**: mg/dL

###### componentResultInfo

- **valueText**: 92
- **numericValue**: 92
- **isValueRtf**: false

###### referenceRange

- **formattedReferenceRange**: 65 - 99 mg/dL
- **low**: 65
- **high**: 99
- **displayLow**: 65
- **displayHigh**: 99
- **lowerBoundExclusive**: false
- **upperBoundExclusive**: false

###### componentComments

- **contentAsString**: (empty)

###### resultComponents 2

###### componentInfo

- **componentID**: COMP-NA
- **name**: Sodium
- **commonName**: Sodium
- **units**: mmol/L

###### componentResultInfo

- **valueText**: 140
- **numericValue**: 140
- **isValueRtf**: false

###### referenceRange

- **formattedReferenceRange**: 135 - 145 mmol/L
- **low**: 135
- **high**: 145
- **displayLow**: 135
- **displayHigh**: 145
- **lowerBoundExclusive**: false
- **upperBoundExclusive**: false

###### componentComments

- **contentAsString**: (empty)

###### resultComponents 3

###### componentInfo

- **componentID**: COMP-K
- **name**: Potassium
- **commonName**: Potassium
- **units**: mmol/L

###### componentResultInfo

- **valueText**: 4.2
- **numericValue**: 4.2
- **isValueRtf**: false

###### referenceRange

- **formattedReferenceRange**: 3.5 - 5.1 mmol/L
- **low**: 3.5
- **high**: 5.1
- **displayLow**: 3.5
- **displayHigh**: 5.1
- **lowerBoundExclusive**: false
- **upperBoundExclusive**: false

###### componentComments

- **contentAsString**: (empty)

###### resultComponents 4

###### componentInfo

- **componentID**: COMP-CREAT
- **name**: Creatinine
- **commonName**: Creatinine
- **units**: mg/dL

###### componentResultInfo

- **valueText**: 0.9
- **numericValue**: 0.9
- **isValueRtf**: false

###### referenceRange

- **formattedReferenceRange**: 0.6 - 1.3 mg/dL
- **low**: 0.6
- **high**: 1.3
- **displayLow**: 0.6
- **displayHigh**: 1.3
- **lowerBoundExclusive**: false
- **upperBoundExclusive**: false

###### componentComments

- **contentAsString**: (empty)

###### resultComponents 5

###### componentInfo

- **componentID**: COMP-ALT
- **name**: ALT
- **commonName**: ALT
- **units**: U/L

###### componentResultInfo

- **valueText**: 30
- **numericValue**: 30
- **isValueRtf**: false

###### referenceRange

- **formattedReferenceRange**: 9 - 46 U/L
- **low**: 9
- **high**: 46
- **displayLow**: 9
- **displayHigh**: 46
- **lowerBoundExclusive**: false
- **upperBoundExclusive**: false

###### componentComments

- **contentAsString**: (empty)

###### studyResult

###### narrative

- **contentAsString**: (empty)
- **signingInstantTimestamp**: (empty)

###### impression

- **contentAsString**: (empty)
- **signingInstantTimestamp**: (empty)
- **addenda**: (none)
- **transcriptions**: (none)
- **ecgDiagnosis**: (none)
- **hasStudyContent**: false
- **isFullResultText**: false
- **isCupidAddendum**: (none)

###### resultNote

- **contentAsString**: (empty)
- **signingInstantTimestamp**: (empty)

###### resultLetter

- **contentAsString**: (empty)
- **signingInstantTimestamp**: (empty)
- **providerComments**: (none)

###### reportDetails

- **reportID**: (empty)
- **isDownloadablePDFReport**: false
- **reportContentText**: (none)
- **imageStudies**: (none)
- **scans**: (none)

###### fdiLink

- **redirectUrl**: (none)

#### historicalResults

(empty)

### orders 2

- **orderName**: Lipid Panel
- **key**: RES-LIPID
- **isInpatient**: false
- **isEDVisit**: false
- **formattedAdmitDate**: (empty)
- **formattedDischargeDate**: (empty)

#### results (1)

##### results 1

- **name**: Lipid Panel
- **key**: RES-LIPID
- **isAbnormal**: true
- **hasComment**: false
- **warningType**: (empty)
- **warningMessage**: (empty)

###### orderMetadata

- **prioritizedInstantISO**: 2026-01-10T10:30:00
- **prioritizedInstantDisplay**: Jan 10, 2026 10:30 AM
- **resultTimestampDisplay**: Jan 10, 2026 10:30 AM
- **latestUpdateInstantISO**: 2026-01-10T10:30:00
- **collectionTimestampsDisplay**: Jan 10, 2026 9:00 AM
- **specimensDisplay**: Blood
- **resultStatus**: Final
- **orderProviderName**: Julius Hibbert, MD
- **authorizingProviderName**: (none)
- **readingProviderName**: (empty)
- **resultType**: LAB
- **associatedDiagnoses**: (none)

###### resultingLab

- **name**: Springfield General Hospital Lab
- **address**: 123 Main Street, Springfield, NT 49007
- **phoneNumber**: (555) 636-3000
- **labDirector**: Julius Hibbert, MD
- **cliaNumber**: (empty)
- **accreditationType**: (empty)

###### resultComponents (4)

###### resultComponents 1

###### componentInfo

- **componentID**: COMP-CHOL
- **name**: Total Cholesterol
- **commonName**: Total Cholesterol
- **units**: mg/dL

###### componentResultInfo

- **valueText**: 280
- **numericValue**: 280
- **isValueRtf**: false

###### referenceRange

- **formattedReferenceRange**: 125 - 200 mg/dL
- **low**: 125
- **high**: 200
- **displayLow**: 125
- **displayHigh**: 200
- **lowerBoundExclusive**: false
- **upperBoundExclusive**: false

###### componentComments

- **contentAsString**: (empty)

###### resultComponents 2

###### componentInfo

- **componentID**: COMP-LDL
- **name**: LDL Cholesterol
- **commonName**: LDL Cholesterol
- **units**: mg/dL

###### componentResultInfo

- **valueText**: 190
- **numericValue**: 190
- **isValueRtf**: false

###### referenceRange

- **formattedReferenceRange**: 0 - 100 mg/dL
- **low**: 0
- **high**: 100
- **displayLow**: 0
- **displayHigh**: 100
- **lowerBoundExclusive**: false
- **upperBoundExclusive**: false

###### componentComments

- **contentAsString**: (empty)

###### resultComponents 3

###### componentInfo

- **componentID**: COMP-HDL
- **name**: HDL Cholesterol
- **commonName**: HDL Cholesterol
- **units**: mg/dL

###### componentResultInfo

- **valueText**: 35
- **numericValue**: 35
- **isValueRtf**: false

###### referenceRange

- **formattedReferenceRange**: 40 - 60 mg/dL
- **low**: 40
- **high**: 60
- **displayLow**: 40
- **displayHigh**: 60
- **lowerBoundExclusive**: false
- **upperBoundExclusive**: false

###### componentComments

- **contentAsString**: (empty)

###### resultComponents 4

###### componentInfo

- **componentID**: COMP-TRIG
- **name**: Triglycerides
- **commonName**: Triglycerides
- **units**: mg/dL

###### componentResultInfo

- **valueText**: 350
- **numericValue**: 350
- **isValueRtf**: false

###### referenceRange

- **formattedReferenceRange**: 0 - 150 mg/dL
- **low**: 0
- **high**: 150
- **displayLow**: 0
- **displayHigh**: 150
- **lowerBoundExclusive**: false
- **upperBoundExclusive**: false

###### componentComments

- **contentAsString**: (empty)

###### studyResult

###### narrative

- **contentAsString**: (empty)
- **signingInstantTimestamp**: (empty)

###### impression

- **contentAsString**: (empty)
- **signingInstantTimestamp**: (empty)
- **addenda**: (none)
- **transcriptions**: (none)
- **ecgDiagnosis**: (none)
- **hasStudyContent**: false
- **isFullResultText**: false
- **isCupidAddendum**: (none)

###### resultNote

- **contentAsString**: (empty)
- **signingInstantTimestamp**: (empty)

###### resultLetter

- **contentAsString**: (empty)
- **signingInstantTimestamp**: (empty)
- **providerComments**: (none)

###### reportDetails

- **reportID**: (empty)
- **isDownloadablePDFReport**: false
- **reportContentText**: (none)
- **imageStudies**: (none)
- **scans**: (none)

###### fdiLink

- **redirectUrl**: (none)

#### historicalResults

##### COMP-CHOL

- **name**: Total Cholesterol
- **commonName**: Total Cholesterol
- **units**: mg/dL
- **oldestResultISO**: 2024-01-08T09:00:00

###### historicalResultData (3)

###### historicalResultData 1

- **dateISO**: 2024-01-08T09:00:00
- **value**: 255
- **numericValue**: 255
- **isValueRtf**: false

###### referenceRange

- **formattedReferenceRange**: 125 - 200 mg/dL
- **low**: 125
- **high**: 200
- **displayLow**: 125
- **displayHigh**: 200
- **lowerBoundExclusive**: false
- **upperBoundExclusive**: false

###### historicalResultData 2

- **dateISO**: 2025-01-06T09:00:00
- **value**: 268
- **numericValue**: 268
- **isValueRtf**: false

###### referenceRange

- **formattedReferenceRange**: 125 - 200 mg/dL
- **low**: 125
- **high**: 200
- **displayLow**: 125
- **displayHigh**: 200
- **lowerBoundExclusive**: false
- **upperBoundExclusive**: false

###### historicalResultData 3

- **dateISO**: 2026-01-10T09:00:00
- **value**: 280
- **numericValue**: 280
- **isValueRtf**: false

###### referenceRange

- **formattedReferenceRange**: 125 - 200 mg/dL
- **low**: 125
- **high**: 200
- **displayLow**: 125
- **displayHigh**: 200
- **lowerBoundExclusive**: false
- **upperBoundExclusive**: false

##### COMP-LDL

- **name**: LDL Cholesterol
- **commonName**: LDL Cholesterol
- **units**: mg/dL
- **oldestResultISO**: 2024-01-08T09:00:00

###### historicalResultData (3)

###### historicalResultData 1

- **dateISO**: 2024-01-08T09:00:00
- **value**: 170
- **numericValue**: 170
- **isValueRtf**: false

###### referenceRange

- **formattedReferenceRange**: 0 - 100 mg/dL
- **low**: 0
- **high**: 100
- **displayLow**: 0
- **displayHigh**: 100
- **lowerBoundExclusive**: false
- **upperBoundExclusive**: false

###### historicalResultData 2

- **dateISO**: 2025-01-06T09:00:00
- **value**: 182
- **numericValue**: 182
- **isValueRtf**: false

###### referenceRange

- **formattedReferenceRange**: 0 - 100 mg/dL
- **low**: 0
- **high**: 100
- **displayLow**: 0
- **displayHigh**: 100
- **lowerBoundExclusive**: false
- **upperBoundExclusive**: false

###### historicalResultData 3

- **dateISO**: 2026-01-10T09:00:00
- **value**: 190
- **numericValue**: 190
- **isValueRtf**: false

###### referenceRange

- **formattedReferenceRange**: 0 - 100 mg/dL
- **low**: 0
- **high**: 100
- **displayLow**: 0
- **displayHigh**: 100
- **lowerBoundExclusive**: false
- **upperBoundExclusive**: false

### orders 3

- **orderName**: Complete Blood Count
- **key**: RES-CBC
- **isInpatient**: false
- **isEDVisit**: false
- **formattedAdmitDate**: (empty)
- **formattedDischargeDate**: (empty)

#### results (1)

##### results 1

- **name**: Complete Blood Count
- **key**: RES-CBC
- **isAbnormal**: false
- **hasComment**: false
- **warningType**: (empty)
- **warningMessage**: (empty)

###### orderMetadata

- **prioritizedInstantISO**: 2026-01-10T10:30:00
- **prioritizedInstantDisplay**: Jan 10, 2026 10:30 AM
- **resultTimestampDisplay**: Jan 10, 2026 10:30 AM
- **latestUpdateInstantISO**: 2026-01-10T10:30:00
- **collectionTimestampsDisplay**: Jan 10, 2026 9:00 AM
- **specimensDisplay**: Blood
- **resultStatus**: Final
- **orderProviderName**: Julius Hibbert, MD
- **authorizingProviderName**: (none)
- **readingProviderName**: (empty)
- **resultType**: LAB
- **associatedDiagnoses**: (none)

###### resultingLab

- **name**: Springfield General Hospital Lab
- **address**: 123 Main Street, Springfield, NT 49007
- **phoneNumber**: (555) 636-3000
- **labDirector**: Julius Hibbert, MD
- **cliaNumber**: (empty)
- **accreditationType**: (empty)

###### resultComponents (5)

###### resultComponents 1

###### componentInfo

- **componentID**: COMP-WBC
- **name**: White Blood Cell Count
- **commonName**: WBC
- **units**: K/uL

###### componentResultInfo

- **valueText**: 6.8
- **numericValue**: 6.8
- **isValueRtf**: false

###### referenceRange

- **formattedReferenceRange**: 4.0 - 11.0 K/uL
- **low**: 4
- **high**: 11
- **displayLow**: 4.0
- **displayHigh**: 11.0
- **lowerBoundExclusive**: false
- **upperBoundExclusive**: false

###### componentComments

- **contentAsString**: (empty)

###### resultComponents 2

###### componentInfo

- **componentID**: COMP-RBC
- **name**: Red Blood Cell Count
- **commonName**: RBC
- **units**: M/uL

###### componentResultInfo

- **valueText**: 4.9
- **numericValue**: 4.9
- **isValueRtf**: false

###### referenceRange

- **formattedReferenceRange**: 4.2 - 5.8 M/uL
- **low**: 4.2
- **high**: 5.8
- **displayLow**: 4.2
- **displayHigh**: 5.8
- **lowerBoundExclusive**: false
- **upperBoundExclusive**: false

###### componentComments

- **contentAsString**: (empty)

###### resultComponents 3

###### componentInfo

- **componentID**: COMP-HGB
- **name**: Hemoglobin
- **commonName**: Hemoglobin
- **units**: g/dL

###### componentResultInfo

- **valueText**: 14.8
- **numericValue**: 14.8
- **isValueRtf**: false

###### referenceRange

- **formattedReferenceRange**: 13.2 - 17.1 g/dL
- **low**: 13.2
- **high**: 17.1
- **displayLow**: 13.2
- **displayHigh**: 17.1
- **lowerBoundExclusive**: false
- **upperBoundExclusive**: false

###### componentComments

- **contentAsString**: (empty)

###### resultComponents 4

###### componentInfo

- **componentID**: COMP-HCT
- **name**: Hematocrit
- **commonName**: Hematocrit
- **units**: %

###### componentResultInfo

- **valueText**: 44.1
- **numericValue**: 44.1
- **isValueRtf**: false

###### referenceRange

- **formattedReferenceRange**: 38.5 - 50.0 %
- **low**: 38.5
- **high**: 50
- **displayLow**: 38.5
- **displayHigh**: 50.0
- **lowerBoundExclusive**: false
- **upperBoundExclusive**: false

###### componentComments

- **contentAsString**: (empty)

###### resultComponents 5

###### componentInfo

- **componentID**: COMP-PLT
- **name**: Platelet Count
- **commonName**: Platelets
- **units**: K/uL

###### componentResultInfo

- **valueText**: 245
- **numericValue**: 245
- **isValueRtf**: false

###### referenceRange

- **formattedReferenceRange**: 140 - 400 K/uL
- **low**: 140
- **high**: 400
- **displayLow**: 140
- **displayHigh**: 400
- **lowerBoundExclusive**: false
- **upperBoundExclusive**: false

###### componentComments

- **contentAsString**: (empty)

###### studyResult

###### narrative

- **contentAsString**: (empty)
- **signingInstantTimestamp**: (empty)

###### impression

- **contentAsString**: (empty)
- **signingInstantTimestamp**: (empty)
- **addenda**: (none)
- **transcriptions**: (none)
- **ecgDiagnosis**: (none)
- **hasStudyContent**: false
- **isFullResultText**: false
- **isCupidAddendum**: (none)

###### resultNote

- **contentAsString**: (empty)
- **signingInstantTimestamp**: (empty)

###### resultLetter

- **contentAsString**: (empty)
- **signingInstantTimestamp**: (empty)
- **providerComments**: (none)

###### reportDetails

- **reportID**: (empty)
- **isDownloadablePDFReport**: false
- **reportContentText**: (none)
- **imageStudies**: (none)
- **scans**: (none)

###### fdiLink

- **redirectUrl**: (none)

#### historicalResults

(empty)

### orders 4

- **orderName**: XR Skull 2 Views
- **key**: RES-XRAY
- **isInpatient**: false
- **isEDVisit**: false
- **formattedAdmitDate**: (empty)
- **formattedDischargeDate**: (empty)

#### results (1)

##### results 1

- **name**: XR Skull 2 Views
- **key**: RES-XRAY
- **isAbnormal**: false
- **hasComment**: false
- **warningType**: (empty)
- **warningMessage**: (empty)

###### orderMetadata

- **prioritizedInstantISO**: 2025-08-05T11:00:00
- **prioritizedInstantDisplay**: Aug 5, 2025 11:00 AM
- **resultTimestampDisplay**: Aug 5, 2025 11:00 AM
- **latestUpdateInstantISO**: 2025-08-05T11:00:00
- **collectionTimestampsDisplay**: Aug 5, 2025 10:00 AM
- **specimensDisplay**: (empty)
- **resultStatus**: Final
- **orderProviderName**: Julius Hibbert, MD
- **authorizingProviderName**: (none)
- **readingProviderName**: Julius Hibbert, MD
- **resultType**: IMAGING
- **associatedDiagnoses**: (none)

###### resultingLab

- **name**: Springfield General Hospital Radiology
- **address**: 123 Main Street, Springfield, NT 49007
- **phoneNumber**: (555) 636-3000
- **labDirector**: Julius Hibbert, MD
- **cliaNumber**: (empty)
- **accreditationType**: (empty)
- **resultComponents**: (none)

###### studyResult

###### narrative

- **contentAsString**: FINDINGS: Calvarium is intact. Multiple radiopaque foreign bodies identified within the cranial vault consistent with crayon-shaped objects (at least 5). No acute fracture. No intracranial hemorrhage. Sella turcica is normal.
- **signingInstantTimestamp**: 2025-08-05T11:00:00Z

###### impression

- **contentAsString**: IMPRESSION: Multiple crayon-shaped foreign bodies within the cranial vault. Clinical correlation recommended. Consider neurosurgical consultation for foreign body removal. Patient states he has had crayons in his brain since childhood.
- **signingInstantTimestamp**: 2025-08-05T11:00:00Z
- **addenda**: (none)
- **transcriptions**: (none)
- **ecgDiagnosis**: (none)
- **hasStudyContent**: true
- **isFullResultText**: false
- **isCupidAddendum**: (none)

###### resultNote

- **contentAsString**: (empty)
- **signingInstantTimestamp**: (empty)

###### resultLetter

- **contentAsString**: (empty)
- **signingInstantTimestamp**: (empty)
- **providerComments**: (none)

###### reportDetails

- **reportID**: RPT-XRAY-001
- **isDownloadablePDFReport**: false
- **reportContentText**:

XR Skull 2 Views  
  
FINDINGS: Multiple radiopaque foreign bodies within cranial vault consistent with crayons.  
  
View Images

###### imageStudies (1)

| studyDescription | modality | studyDate | numberOfImages |
| - | - | - | - |
| XR Skull 2 Views | CR | 2025-08-05 | 2 |
- **scans**: (none)

###### fdiLink

- **redirectUrl**: (none)

#### historicalResults

(empty)

### orders 5

- **orderName**: CT Head without Contrast
- **key**: RES-CT
- **isInpatient**: false
- **isEDVisit**: false
- **formattedAdmitDate**: (empty)
- **formattedDischargeDate**: (empty)

#### results (1)

##### results 1

- **name**: CT Head without Contrast
- **key**: RES-CT
- **isAbnormal**: false
- **hasComment**: false
- **warningType**: (empty)
- **warningMessage**: (empty)

###### orderMetadata

- **prioritizedInstantISO**: 2025-09-15T15:00:00
- **prioritizedInstantDisplay**: Sep 15, 2025 3:00 PM
- **resultTimestampDisplay**: Sep 15, 2025 3:00 PM
- **latestUpdateInstantISO**: 2025-09-15T15:00:00
- **collectionTimestampsDisplay**: Sep 15, 2025 2:30 PM
- **specimensDisplay**: (empty)
- **resultStatus**: Final
- **orderProviderName**: Julius Hibbert, MD
- **authorizingProviderName**: (none)
- **readingProviderName**: Julius Hibbert, MD
- **resultType**: IMAGING
- **associatedDiagnoses**: (none)

###### resultingLab

- **name**: Springfield General Hospital Radiology
- **address**: 123 Main Street, Springfield, NT 49007
- **phoneNumber**: (555) 636-3000
- **labDirector**: Julius Hibbert, MD
- **cliaNumber**: (empty)
- **accreditationType**: (empty)
- **resultComponents**: (none)

###### studyResult

###### narrative

- **contentAsString**: FINDINGS: CT of the head without contrast. Multiple radiopaque foreign bodies identified within the cranial vault, consistent with crayon-shaped objects (at least 16 individual crayons). No acute intracranial hemorrhage. No midline shift. Ventricles are normal in size and configuration. Gray-white matter differentiation is preserved. No acute fracture identified.
- **signingInstantTimestamp**: 2025-09-15T15:00:00Z

###### impression

- **contentAsString**: IMPRESSION: 1. Multiple crayon-shaped foreign bodies within the cranial vault, unchanged from prior X-ray. 2. No acute intracranial abnormality. 3. Recommend continued monitoring. Patient declines surgical removal stating "the crayons keep me creative."
- **signingInstantTimestamp**: 2025-09-15T15:00:00Z
- **addenda**: (none)
- **transcriptions**: (none)
- **ecgDiagnosis**: (none)
- **hasStudyContent**: true
- **isFullResultText**: false
- **isCupidAddendum**: (none)

###### resultNote

- **contentAsString**: (empty)
- **signingInstantTimestamp**: (empty)

###### resultLetter

- **contentAsString**: (empty)
- **signingInstantTimestamp**: (empty)
- **providerComments**: (none)

###### reportDetails

- **reportID**: RPT-CT-001
- **isDownloadablePDFReport**: false
- **reportContentText**:

CT Head without Contrast  
  
FINDINGS: Multiple radiopaque foreign bodies within cranial vault consistent with crayons (at least 16).

###### imageStudies (1)

| studyDescription | modality | studyDate | numberOfImages |
| - | - | - | - |
| CT Head without Contrast | CT | 2025-09-15 | 9 |
- **scans**: (none)

###### fdiLink

- **redirectUrl**: /Extensibility/Redirection/FdiRedirection?fdi=FDI-CT-001&ord=ORD-CT-001

#### historicalResults

(empty)

</details>

<details>
<summary><code>mode: concise</code> (5340 chars)</summary>

## orders (5)

### orders 1

- **orderName**: Comprehensive Metabolic Panel

#### results (1)

##### results 1

- **name**: Comprehensive Metabolic Panel
- **prioritizedInstantISO**: 2026-01-10T10:30:00
- **resultStatus**: Final
- **orderProviderName**: Julius Hibbert, MD

###### resultComponents (5)

| name | commonName | units | valueText | formattedReferenceRange | contentAsString |
| - | - | - | - | - | - |
| Glucose | Glucose | mg/dL | 92 | 65 - 99 mg/dL | (empty) |
| Sodium | Sodium | mmol/L | 140 | 135 - 145 mmol/L | (empty) |
| Potassium | Potassium | mmol/L | 4.2 | 3.5 - 5.1 mmol/L | (empty) |
| Creatinine | Creatinine | mg/dL | 0.9 | 0.6 - 1.3 mg/dL | (empty) |
| ALT | ALT | U/L | 30 | 9 - 46 U/L | (empty) |
- **narrative**: (empty)
- **impression**: (empty)
- **addenda**: (none)
- **resultNote**: (empty)
- **resultLetter**: (empty)
- **reportContentText**: (none)

#### historicalResults

(empty)

### orders 2

- **orderName**: Lipid Panel

#### results (1)

##### results 1

- **name**: Lipid Panel
- **prioritizedInstantISO**: 2026-01-10T10:30:00
- **resultStatus**: Final
- **orderProviderName**: Julius Hibbert, MD

###### resultComponents (4)

| name | commonName | units | valueText | formattedReferenceRange | contentAsString |
| - | - | - | - | - | - |
| Total Cholesterol | Total Cholesterol | mg/dL | 280 | 125 - 200 mg/dL | (empty) |
| LDL Cholesterol | LDL Cholesterol | mg/dL | 190 | 0 - 100 mg/dL | (empty) |
| HDL Cholesterol | HDL Cholesterol | mg/dL | 35 | 40 - 60 mg/dL | (empty) |
| Triglycerides | Triglycerides | mg/dL | 350 | 0 - 150 mg/dL | (empty) |
- **narrative**: (empty)
- **impression**: (empty)
- **addenda**: (none)
- **resultNote**: (empty)
- **resultLetter**: (empty)
- **reportContentText**: (none)

#### historicalResults

##### COMP-CHOL

- **name**: Total Cholesterol

###### historicalResultData (3)

| dateISO | value |
| - | - |
| 2024-01-08T09:00:00 | 255 |
| 2025-01-06T09:00:00 | 268 |
| 2026-01-10T09:00:00 | 280 |

##### COMP-LDL

- **name**: LDL Cholesterol

###### historicalResultData (3)

| dateISO | value |
| - | - |
| 2024-01-08T09:00:00 | 170 |
| 2025-01-06T09:00:00 | 182 |
| 2026-01-10T09:00:00 | 190 |

### orders 3

- **orderName**: Complete Blood Count

#### results (1)

##### results 1

- **name**: Complete Blood Count
- **prioritizedInstantISO**: 2026-01-10T10:30:00
- **resultStatus**: Final
- **orderProviderName**: Julius Hibbert, MD

###### resultComponents (5)

| name | commonName | units | valueText | formattedReferenceRange | contentAsString |
| - | - | - | - | - | - |
| White Blood Cell Count | WBC | K/uL | 6.8 | 4.0 - 11.0 K/uL | (empty) |
| Red Blood Cell Count | RBC | M/uL | 4.9 | 4.2 - 5.8 M/uL | (empty) |
| Hemoglobin | Hemoglobin | g/dL | 14.8 | 13.2 - 17.1 g/dL | (empty) |
| Hematocrit | Hematocrit | % | 44.1 | 38.5 - 50.0 % | (empty) |
| Platelet Count | Platelets | K/uL | 245 | 140 - 400 K/uL | (empty) |
- **narrative**: (empty)
- **impression**: (empty)
- **addenda**: (none)
- **resultNote**: (empty)
- **resultLetter**: (empty)
- **reportContentText**: (none)

#### historicalResults

(empty)

### orders 4

- **orderName**: XR Skull 2 Views

#### results (1)

##### results 1

- **name**: XR Skull 2 Views
- **prioritizedInstantISO**: 2025-08-05T11:00:00
- **resultStatus**: Final
- **orderProviderName**: Julius Hibbert, MD
- **resultComponents**: (none)
- **narrative**: FINDINGS: Calvarium is intact. Multiple radiopaque foreign bodies identified within the cranial vault consistent with crayon-shaped objects (at least 5). No acute fracture. No intracranial hemorrhage. Sella turcica is normal.
- **impression**: IMPRESSION: Multiple crayon-shaped foreign bodies within the cranial vault. Clinical correlation recommended. Consider neurosurgical consultation for foreign body removal. Patient states he has had crayons in his brain since childhood.
- **addenda**: (none)
- **resultNote**: (empty)
- **resultLetter**: (empty)
- **reportContentText**:

XR Skull 2 Views  
  
FINDINGS: Multiple radiopaque foreign bodies within cranial vault consistent with crayons.  
  
View Images

#### historicalResults

(empty)

### orders 5

- **orderName**: CT Head without Contrast

#### results (1)

##### results 1

- **name**: CT Head without Contrast
- **prioritizedInstantISO**: 2025-09-15T15:00:00
- **resultStatus**: Final
- **orderProviderName**: Julius Hibbert, MD
- **resultComponents**: (none)
- **narrative**: FINDINGS: CT of the head without contrast. Multiple radiopaque foreign bodies identified within the cranial vault, consistent with crayon-shaped objects (at least 16 individual crayons). No acute intracranial hemorrhage. No midline shift. Ventricles are normal in size and configuration. Gray-white matter differentiation is preserved. No acute fracture identified.
- **impression**: IMPRESSION: 1. Multiple crayon-shaped foreign bodies within the cranial vault, unchanged from prior X-ray. 2. No acute intracranial abnormality. 3. Recommend continued monitoring. Patient declines surgical removal stating "the crayons keep me creative."
- **addenda**: (none)
- **resultNote**: (empty)
- **resultLetter**: (empty)
- **reportContentText**:

CT Head without Contrast  
  
FINDINGS: Multiple radiopaque foreign bodies within cranial vault consistent with crayons (at least 16).

#### historicalResults

(empty)

</details>

<details>
<summary><code>mode: json</code> (17184 chars)</summary>

```json
{
  "orders": [
    {
      "orderName": "Comprehensive Metabolic Panel",
      "key": "RES-CMP",
      "isInpatient": false,
      "isEDVisit": false,
      "formattedAdmitDate": "",
      "formattedDischargeDate": "",
      "results": [
        {
          "name": "Comprehensive Metabolic Panel",
          "key": "RES-CMP",
          "isAbnormal": false,
          "hasComment": false,
          "warningType": "",
          "warningMessage": "",
          "orderMetadata": {
            "prioritizedInstantISO": "2026-01-10T10:30:00",
            "prioritizedInstantDisplay": "Jan 10, 2026 10:30 AM",
            "resultTimestampDisplay": "Jan 10, 2026 10:30 AM",
            "latestUpdateInstantISO": "2026-01-10T10:30:00",
            "collectionTimestampsDisplay": "Jan 10, 2026 9:00 AM",
            "specimensDisplay": "Blood",
            "resultStatus": "Final",
            "orderProviderName": "Julius Hibbert, MD",
            "authorizingProviderName": null,
            "readingProviderName": "",
            "resultType": "LAB",
            "associatedDiagnoses": [],
            "resultingLab": {
              "name": "Springfield General Hospital Lab",
              "address": [
                "123 Main Street",
                "Springfield, NT 49007"
              ],
              "phoneNumber": "(555) 636-3000",
              "labDirector": "Julius Hibbert, MD",
              "cliaNumber": "",
              "accreditationType": ""
            }
          },
          "resultComponents": [
            {
              "componentInfo": {
                "componentID": "COMP-GLU",
                "name": "Glucose",
                "commonName": "Glucose",
                "units": "mg/dL"
              },
              "componentResultInfo": {
                "valueText": "92",
                "numericValue": 92,
                "isValueRtf": false,
                "referenceRange": {
                  "formattedReferenceRange": "65 - 99 mg/dL",
                  "low": 65,
                  "high": 99,
                  "displayLow": "65",
                  "displayHigh": "99",
                  "lowerBoundExclusive": false,
                  "upperBoundExclusive": false
                }
              },
              "componentComments": {
                "contentAsString": ""
              }
            },
            {
              "componentInfo": {
                "componentID": "COMP-NA",
                "name": "Sodium",
                "commonName": "Sodium",
                "units": "mmol/L"
              },
              "componentResultInfo": {
                "valueText": "140",
                "numericValue": 140,
                "isValueRtf": false,
                "referenceRange": {
                  "formattedReferenceRange": "135 - 145 mmol/L",
                  "low": 135,
                  "high": 145,
                  "displayLow": "135",
                  "displayHigh": "145",
                  "lowerBoundExclusive": false,
                  "upperBoundExclusive": false
                }
              },
              "componentComments": {
                "contentAsString": ""
              }
            },
            {
              "componentInfo": {
                "componentID": "COMP-K",
                "name": "Potassium",
                "commonName": "Potassium",
                "units": "mmol/L"
              },
              "componentResultInfo": {
                "valueText": "4.2",
                "numericValue": 4.2,
                "isValueRtf": false,
                "referenceRange": {
                  "formattedReferenceRange": "3.5 - 5.1 mmol/L",
                  "low": 3.5,
                  "high": 5.1,
                  "displayLow": "3.5",
                  "displayHigh": "5.1",
                  "lowerBoundExclusive": false,
                  "upperBoundExclusive": false
                }
              },
              "componentComments": {
                "contentAsString": ""
              }
            },
            {
              "componentInfo": {
                "componentID": "COMP-CREAT",
                "name": "Creatinine",
                "commonName": "Creatinine",
                "units": "mg/dL"
              },
              "componentResultInfo": {
                "valueText": "0.9",
                "numericValue": 0.9,
                "isValueRtf": false,
                "referenceRange": {
                  "formattedReferenceRange": "0.6 - 1.3 mg/dL",
                  "low": 0.6,
                  "high": 1.3,
                  "displayLow": "0.6",
                  "displayHigh": "1.3",
                  "lowerBoundExclusive": false,
                  "upperBoundExclusive": false
                }
              },
              "componentComments": {
                "contentAsString": ""
              }
            },
            {
              "componentInfo": {
                "componentID": "COMP-ALT",
                "name": "ALT",
                "commonName": "ALT",
                "units": "U/L"
              },
              "componentResultInfo": {
                "valueText": "30",
                "numericValue": 30,
                "isValueRtf": false,
                "referenceRange": {
                  "formattedReferenceRange": "9 - 46 U/L",
                  "low": 9,
                  "high": 46,
                  "displayLow": "9",
                  "displayHigh": "46",
                  "lowerBoundExclusive": false,
                  "upperBoundExclusive": false
                }
              },
              "componentComments": {
                "contentAsString": ""
              }
            }
          ],
          "studyResult": {
            "narrative": {
              "contentAsString": "",
              "signingInstantTimestamp": ""
            },
            "impression": {
              "contentAsString": "",
              "signingInstantTimestamp": ""
            },
            "addenda": [],
            "transcriptions": [],
            "ecgDiagnosis": [],
            "hasStudyContent": false,
            "isFullResultText": false,
            "isCupidAddendum": null
          },
          "resultNote": {
            "contentAsString": "",
            "signingInstantTimestamp": ""
          },
          "resultLetter": {
            "contentAsString": "",
            "signingInstantTimestamp": ""
          },
          "providerComments": [],
          "reportDetails": {
            "reportID": "",
            "isDownloadablePDFReport": false
          },
          "reportContentText": null,
          "imageStudies": [],
          "scans": [],
          "fdiLink": {
            "redirectUrl": null
          }
        }
      ],
      "historicalResults": {}
    },
    {
      "orderName": "Lipid Panel",
      "key": "RES-LIPID",
      "isInpatient": false,
      "isEDVisit": false,
      "formattedAdmitDate": "",
      "formattedDischargeDate": "",
      "results": [
        {
          "name": "Lipid Panel",
          "key": "RES-LIPID",
          "isAbnormal": true,
          "hasComment": false,
          "warningType": "",
          "warningMessage": "",
          "orderMetadata": {
            "prioritizedInstantISO": "2026-01-10T10:30:00",
            "prioritizedInstantDisplay": "Jan 10, 2026 10:30 AM",
            "resultTimestampDisplay": "Jan 10, 2026 10:30 AM",
            "latestUpdateInstantISO": "2026-01-10T10:30:00",
            "collectionTimestampsDisplay": "Jan 10, 2026 9:00 AM",
            "specimensDisplay": "Blood",
            "resultStatus": "Final",
            "orderProviderName": "Julius Hibbert, MD",
            "authorizingProviderName": null,
            "readingProviderName": "",
            "resultType": "LAB",
            "associatedDiagnoses": [],
            "resultingLab": {
              "name": "Springfield General Hospital Lab",
              "address": [
                "123 Main Street",
                "Springfield, NT 49007"
              ],
              "phoneNumber": "(555) 636-3000",
              "labDirector": "Julius Hibbert, MD",
              "cliaNumber": "",
              "accreditationType": ""
            }
          },
          "resultComponents": [
            {
              "componentInfo": {
                "componentID": "COMP-CHOL",
                "name": "Total Cholesterol",
                "commonName": "Total Cholesterol",
                "units": "mg/dL"
              },
              "componentResultInfo": {
                "valueText": "280",
                "numericValue": 280,
                "isValueRtf": false,
                "referenceRange": {
                  "formattedReferenceRange": "125 - 200 mg/dL",
                  "low": 125,
                  "high": 200,
                  "displayLow": "125",
                  "displayHigh": "200",
                  "lowerBoundExclusive": false,
                  "upperBoundExclusive": false
                }
              },
              "componentComments": {
                "contentAsString": ""
              }
            },
            {
              "componentInfo": {
                "componentID": "COMP-LDL",
                "name": "LDL Cholesterol",
                "commonName": "LDL Cholesterol",
                "units": "mg/dL"
              },
              "componentResultInfo": {
                "valueText": "190",
                "numericValue": 190,
                "isValueRtf": false,
                "referenceRange": {
                  "formattedReferenceRange": "0 - 100 mg/dL",
                  "low": 0,
                  "high": 100,
                  "displayLow": "0",
                  "displayHigh": "100",
                  "lowerBoundExclusive": false,
                  "upperBoundExclusive": false
                }
              },
              "componentComments": {
                "contentAsString": ""
              }
            },
            {
              "componentInfo": {
                "componentID": "COMP-HDL",
                "name": "HDL Cholesterol",
                "commonName": "HDL Cholesterol",
                "units": "mg/dL"
              },
              "componentResultInfo": {
                "valueText": "35",
                "numericValue": 35,
                "isValueRtf": false,
                "referenceRange": {
                  "formattedReferenceRange": "40 - 60 mg/dL",
                  "low": 40,
                  "high": 60,
                  "displayLow": "40",
                  "displayHigh": "60",
                  "lowerBoundExclusive": false,
                  "upperBoundExclusive": false
                }
              },
              "componentComments": {
                "contentAsString": ""
              }
            },
            {
              "componentInfo": {
                "componentID": "COMP-TRIG",
                "name": "Triglycerides",
                "commonName": "Triglycerides",
                "units": "mg/dL"
              },
              "componentResultInfo": {
                "valueText": "350",
                "numericValue": 350,
                "isValueRtf": false,
                "referenceRange": {
                  "formattedReferenceRange": "0 - 150 mg/dL",
                  "low": 0,
                  "high": 150,
                  "displayLow": "0",
                  "displayHigh": "150",
                  "lowerBoundExclusive": false,
                  "upperBoundExclusive": false
                }
              },
              "componentComments": {
                "contentAsString": ""
              }
            }
          ],
          "studyResult": {
            "narrative": {
              "contentAsString": "",
              "signingInstantTimestamp": ""
            },
            "impression": {
              "contentAsString": "",
              "signingInstantTimestamp": ""
            },
            "addenda": [],

… (truncated; 18273 more characters)
```

</details>

---

### `get_imaging_results`

Imaging result metadata (X-ray, MRI, CT, ultrasound, …) with reports. Entries that have viewable pictures carry an `image_id` — pass that to download_imaging_study to get the actual images.

<details>
<summary><code>mode: raw</code> (42608 chars)</summary>

```json
{
  "requests": [
    {
      "path": "/app/test-results",
      "method": "GET",
      "status": 200,
      "contentType": "text/html; charset=utf-8",
      "body": "<!DOCTYPE html>\n<html xmlns=\"http://www.w3.org/1999/xhtml\" lang=\"en\" dir=\"ltr\">\n<head>\n  <title>MyChart</title>\n  <meta http-equiv=\"content-type\" content=\"text/html; charset=utf-8\" />\n</head>\n<body>\n  <div class='hidden' id='__CSRFContainer'><input name=\"__RequestVerificationToken\" type=\"hidden\" value=\"fake-csrf-token-00000000000000000000000000000000\" /></div>\n  <script>\n(function () {\n  var originalFetch = window.fetch;\n  window.fetch = function (url, opts) {\n    opts = opts || {};\n    if ((opts.method || 'GET').toUpperCase() === 'POST') {\n      var el = document.querySelector('#__CSRFContainer input[name=__RequestVerificationToken]');\n      if (el) {\n        opts.headers = opts.headers || {};\n        if (!opts.headers['__RequestVerificationToken']) {\n          opts.headers['__RequestVerificationToken'] = el.value;\n        }\n      }\n    }\n    return originalFetch.call(this, url, opts);\n  };\n})();\n</script>\n  <div></div>\n</body>\n</html>",
      "purpose": "token"
    },
    {
      "path": "/api/test-results/GetList",
      "method": "POST",
      "requestBody": {
        "groupType": 0,
        "searchString": "",
        "maxResults": 1000,
        "isCurAdmFilterEnabled": false
      },
      "status": 200,
      "contentType": "application/json;charset=utf-8",
      "body": {
        "areResultsFullyLoaded": true,
        "isGroupingFullyLoaded": true,
        "groupBy": "ORDER",
        "newResultGroups": [
          {
            "key": "GRP-CMP",
            "contactType": "",
            "resultList": [
              "RES-CMP"
            ],
            "isInpatient": false,
            "isEDVisit": false,
            "isCurrentAdmission": false,
            "formattedAdmitDate": "",
            "formattedDischargeDate": "",
            "visitProviderID": "PROV-HIBBERT",
            "organizationID": "ORG-SPRINGFIELD",
            "sortDate": "2026-01-10T10:30:00",
            "admitInstant": {
              "instantISO": "",
              "includesTime": false
            },
            "dischargeInstant": {
              "instantISO": "",
              "includesTime": false
            },
            "formattedDate": "Jan 10, 2026",
            "isLargeGroup": false
          },
          {
            "key": "GRP-LIPID",
            "contactType": "",
            "resultList": [
              "RES-LIPID"
            ],
            "isInpatient": false,
            "isEDVisit": false,
            "isCurrentAdmission": false,
            "formattedAdmitDate": "",
            "formattedDischargeDate": "",
            "visitProviderID": "PROV-HIBBERT",
            "organizationID": "ORG-SPRINGFIELD",
            "sortDate": "2026-01-10T10:30:00",
            "admitInstant": {
              "instantISO": "",
              "includesTime": false
            },
            "dischargeInstant": {
              "instantISO": "",
              "includesTime": false
            },
            "formattedDate": "Jan 10, 2026",
            "isLargeGroup": false
          },
          {
            "key": "GRP-CBC",
            "contactType": "",
            "resultList": [
              "RES-CBC"
            ],
            "isInpatient": false,
            "isEDVisit": false,
            "isCurrentAdmission": false,
            "formattedAdmitDate": "",
            "formattedDischargeDate": "",
            "visitProviderID": "PROV-HIBBERT",
            "organizationID": "ORG-SPRINGFIELD",
            "sortDate": "2026-01-10T10:30:00",
            "admitInstant": {
              "instantISO": "",
              "includesTime": false
            },
            "dischargeInstant": {
              "instantISO": "",
              "includesTime": false
            },
            "formattedDate": "Jan 10, 2026",
            "isLargeGroup": false
          },
          {
            "key": "GRP-XRAY",
            "contactType": "",
            "resultList": [
              "RES-XRAY"
            ],
            "isInpatient": false,
            "isEDVisit": false,
            "isCurrentAdmission": false,
            "formattedAdmitDate": "",
            "formattedDischargeDate": "",
            "visitProviderID": "PROV-HIBBERT",
            "organizationID": "ORG-SPRINGFIELD",
            "sortDate": "2025-08-05T10:00:00",
            "admitInstant": {
              "instantISO": "",
              "includesTime": false
            },
            "dischargeInstant": {
              "instantISO": "",
              "includesTime": false
            },
            "formattedDate": "Aug 5, 2025",
            "isLargeGroup": false
          },
          {
            "key": "GRP-CT",
            "contactType": "",
            "resultList": [
              "RES-CT"
            ],
            "isInpatient": false,
            "isEDVisit": false,
            "isCurrentAdmission": false,
            "formattedAdmitDate": "",
            "formattedDischargeDate": "",
            "visitProviderID": "PROV-HIBBERT",
            "organizationID": "ORG-SPRINGFIELD",
            "sortDate": "2025-09-15T14:30:00",
            "admitInstant": {
              "instantISO": "",
              "includesTime": false
            },
            "dischargeInstant": {
              "instantISO": "",
              "includesTime": false
            },
            "formattedDate": "Sep 15, 2025",
            "isLargeGroup": false
          }
        ],
        "organizationLoadMoreInfo": {},
        "newResults": {
          "RES-CMP^": {
            "canGenerateLLMSummary": false,
            "feedbackSubmitted": false,
            "isBedsideTablet": false,
            "name": "Comprehensive Metabolic Panel",
            "key": "RES-CMP",
            "showName": false,
            "showDetails": true,
            "orderMetadata": {
              "orderProviderName": "Julius Hibbert, MD",
              "authorizingProviderName": "Julius Hibbert, MD",
              "authorizingProviderID": "PROV-HIBBERT",
              "prioritizedInstantISO": "2026-01-10T10:30:00",
              "prioritizedInstantDisplay": "Jan 10, 2026 10:30 AM",
              "resultType": "LAB",
              "read": "Read"
            },
            "resultComponents": [],
            "shouldHideHistoricalData": false,
            "scans": [],
            "shareEverywhereLogin": false,
            "showProviderNotReviewed": false,
            "providerComments": [],
            "tooManyVariants": false,
            "hasComment": false,
            "hasAllDetails": false,
            "isAbnormal": false
          },
          "RES-LIPID^": {
            "canGenerateLLMSummary": false,
            "feedbackSubmitted": false,
            "isBedsideTablet": false,
            "name": "Lipid Panel",
            "key": "RES-LIPID",
            "showName": false,
            "showDetails": true,
            "orderMetadata": {
              "orderProviderName": "Julius Hibbert, MD",
              "authorizingProviderName": "Julius Hibbert, MD",
              "authorizingProviderID": "PROV-HIBBERT",
              "prioritizedInstantISO": "2026-01-10T10:30:00",
              "prioritizedInstantDisplay": "Jan 10, 2026 10:30 AM",
              "resultType": "LAB",
              "read": "Read"
            },
            "resultComponents": [],
            "shouldHideHistoricalData": false,
            "scans": [],
            "shareEverywhereLogin": false,
            "showProviderNotReviewed": false,
            "providerComments": [],
            "tooManyVariants": false,
            "hasComment": false,
            "hasAllDetails": false,
            "isAbnormal": true
          },
          "RES-CBC^": {
            "canGenerateLLMSummary": false,
            "feedbackSubmitted": false,
            "isBedsideTablet": false,
            "name": "Complete Blood Count",
            "key": "RES-CBC",
            "showName": false,
            "showDetails": true,
            "orderMetadata": {
              "orderProviderName": "Julius Hibbert, MD",
              "authorizingProviderName": "Julius Hibbert, MD",
              "authorizingProviderID": "PROV-HIBBERT",
              "prioritizedInstantISO": "2026-01-10T10:30:00",
              "prioritizedInstantDisplay": "Jan 10, 2026 10:30 AM",
              "resultType": "LAB",
              "read": "Read"
            },
            "resultComponents": [],
            "shouldHideHistoricalData": false,
            "scans": [],
            "shareEverywhereLogin": false,
            "showProviderNotReviewed": false,
            "providerComments": [],
            "tooManyVariants": false,
            "hasComment": false,
            "hasAllDetails": false,
            "isAbnormal": false
          },
          "RES-XRAY^": {
            "canGenerateLLMSummary": false,
            "feedbackSubmitted": false,
            "isBedsideTablet": false,
            "name": "XR Skull 2 Views",
            "key": "RES-XRAY",
            "showName": false,
            "showDetails": true,
            "orderMetadata": {
              "orderProviderName": "Julius Hibbert, MD",
              "authorizingProviderName": "Julius Hibbert, MD",
              "authorizingProviderID": "PROV-HIBBERT",
              "prioritizedInstantISO": "2025-08-05T11:00:00",
              "prioritizedInstantDisplay": "Aug 5, 2025 11:00 AM",
              "resultType": "IMAGING",
              "read": "Read"
            },
            "resultComponents": [],
            "shouldHideHistoricalData": false,
            "scans": [],
            "shareEverywhereLogin": false,
            "showProviderNotReviewed": false,
            "providerComments": [],
            "tooManyVariants": false,
            "hasComment": false,
            "hasAllDetails": false,
            "isAbnormal": false
          },
          "RES-CT^": {
            "canGenerateLLMSummary": false,
            "feedbackSubmitted": false,
            "isBedsideTablet": false,
            "name": "CT Head without Contrast",
            "key": "RES-CT",
            "showName": false,
            "showDetails": true,
            "orderMetadata": {
              "orderProviderName": "Julius Hibbert, MD",
              "authorizingProviderName": "Julius Hibbert, MD",
              "authorizingProviderID": "PROV-HIBBERT",
              "prioritizedInstantISO": "2025-09-15T15:00:00",
              "prioritizedInstantDisplay": "Sep 15, 2025 3:00 PM",
              "resultType": "IMAGING",
              "read": "Read"
            },
            "resultComponents": [],
            "shouldHideHistoricalData": false,
            "scans": [],
            "shareEverywhereLogin": false,
            "showProviderNotReviewed": false,
            "providerComments": [],
            "tooManyVariants": false,
            "hasComment": false,
            "hasAllDetails": false,
            "isAbnormal": false
          }
        },
        "newProviderPhotoInfo": {
          "PROV-HIBBERT^": {
            "name": "Julius Hibbert, MD",
            "empId": "",
            "remoteEncrypted": false,
            "photoUrl": "",
            "providerId": "PROV-HIBBERT",
            "organizationId": ""
          }
        },
        "newComments": {}
      }
    },
    {
      "path": "/api/test-results/GetDetails",
      "method": "POST",
      "requestBody": {
        "orderKey": "GRP-CMP",
        "organizationID": "",
        "PageNonce": ""
      },
      "status": 200,
      "contentType": "application/json;charset=utf-8",
      "body": {
        "orderName": "Comprehensive Metabolic Panel",
        "key": "RES-CMP",
        "results": [
          {
            "canGenerateLLMSummary": false,
            "feedbackSubmitted": false,
            "isBedsideTablet": false,
            "name": "C
… (truncated; 60232 more characters)
```

</details>

<details>
<summary><code>mode: standard</code> (6084 chars)</summary>

## orders (2)

### orders 1

- **index**: 0
- **image_id**: eyJmZGkiOiJGREktWFJBWS0wMDEiLCJvcmQiOiJPUkQtWFJBWS0wMDEifQ
- **hasViewableImages**: true
- **isImagingByName**: true
- **isImagingByContent**: true
- **orderName**: XR Skull 2 Views
- **key**: RES-XRAY
- **isInpatient**: false
- **isEDVisit**: false
- **formattedAdmitDate**: (empty)
- **formattedDischargeDate**: (empty)

#### results (1)

##### results 1

- **name**: XR Skull 2 Views
- **key**: RES-XRAY
- **isAbnormal**: false
- **hasComment**: false
- **warningType**: (empty)
- **warningMessage**: (empty)

###### orderMetadata

- **prioritizedInstantISO**: 2025-08-05T11:00:00
- **prioritizedInstantDisplay**: Aug 5, 2025 11:00 AM
- **resultTimestampDisplay**: Aug 5, 2025 11:00 AM
- **latestUpdateInstantISO**: 2025-08-05T11:00:00
- **collectionTimestampsDisplay**: Aug 5, 2025 10:00 AM
- **specimensDisplay**: (empty)
- **resultStatus**: Final
- **orderProviderName**: Julius Hibbert, MD
- **authorizingProviderName**: (none)
- **readingProviderName**: Julius Hibbert, MD
- **resultType**: IMAGING
- **associatedDiagnoses**: (none)

###### resultingLab

- **name**: Springfield General Hospital Radiology
- **address**: 123 Main Street, Springfield, NT 49007
- **phoneNumber**: (555) 636-3000
- **labDirector**: Julius Hibbert, MD
- **cliaNumber**: (empty)
- **accreditationType**: (empty)
- **resultComponents**: (none)

###### studyResult

###### narrative

- **contentAsString**: FINDINGS: Calvarium is intact. Multiple radiopaque foreign bodies identified within the cranial vault consistent with crayon-shaped objects (at least 5). No acute fracture. No intracranial hemorrhage. Sella turcica is normal.
- **signingInstantTimestamp**: 2025-08-05T11:00:00Z

###### impression

- **contentAsString**: IMPRESSION: Multiple crayon-shaped foreign bodies within the cranial vault. Clinical correlation recommended. Consider neurosurgical consultation for foreign body removal. Patient states he has had crayons in his brain since childhood.
- **signingInstantTimestamp**: 2025-08-05T11:00:00Z
- **addenda**: (none)
- **transcriptions**: (none)
- **ecgDiagnosis**: (none)
- **hasStudyContent**: true
- **isFullResultText**: false
- **isCupidAddendum**: (none)

###### resultNote

- **contentAsString**: (empty)
- **signingInstantTimestamp**: (empty)

###### resultLetter

- **contentAsString**: (empty)
- **signingInstantTimestamp**: (empty)
- **providerComments**: (none)

###### reportDetails

- **reportID**: RPT-XRAY-001
- **isDownloadablePDFReport**: false
- **reportContentText**:

XR Skull 2 Views  
  
FINDINGS: Multiple radiopaque foreign bodies within cranial vault consistent with crayons.  
  
View Images

###### imageStudies (1)

| studyDescription | modality | studyDate | numberOfImages |
| - | - | - | - |
| XR Skull 2 Views | CR | 2025-08-05 | 2 |
- **scans**: (none)

###### fdiLink

- **redirectUrl**: (none)

#### historicalResults

(empty)

### orders 2

- **index**: 1
- **image_id**: eyJmZGkiOiJGREktQ1QtMDAxIiwib3JkIjoiT1JELUNULTAwMSJ9
- **hasViewableImages**: true
- **isImagingByName**: true
- **isImagingByContent**: true
- **orderName**: CT Head without Contrast
- **key**: RES-CT
- **isInpatient**: false
- **isEDVisit**: false
- **formattedAdmitDate**: (empty)
- **formattedDischargeDate**: (empty)

#### results (1)

##### results 1

- **name**: CT Head without Contrast
- **key**: RES-CT
- **isAbnormal**: false
- **hasComment**: false
- **warningType**: (empty)
- **warningMessage**: (empty)

###### orderMetadata

- **prioritizedInstantISO**: 2025-09-15T15:00:00
- **prioritizedInstantDisplay**: Sep 15, 2025 3:00 PM
- **resultTimestampDisplay**: Sep 15, 2025 3:00 PM
- **latestUpdateInstantISO**: 2025-09-15T15:00:00
- **collectionTimestampsDisplay**: Sep 15, 2025 2:30 PM
- **specimensDisplay**: (empty)
- **resultStatus**: Final
- **orderProviderName**: Julius Hibbert, MD
- **authorizingProviderName**: (none)
- **readingProviderName**: Julius Hibbert, MD
- **resultType**: IMAGING
- **associatedDiagnoses**: (none)

###### resultingLab

- **name**: Springfield General Hospital Radiology
- **address**: 123 Main Street, Springfield, NT 49007
- **phoneNumber**: (555) 636-3000
- **labDirector**: Julius Hibbert, MD
- **cliaNumber**: (empty)
- **accreditationType**: (empty)
- **resultComponents**: (none)

###### studyResult

###### narrative

- **contentAsString**: FINDINGS: CT of the head without contrast. Multiple radiopaque foreign bodies identified within the cranial vault, consistent with crayon-shaped objects (at least 16 individual crayons). No acute intracranial hemorrhage. No midline shift. Ventricles are normal in size and configuration. Gray-white matter differentiation is preserved. No acute fracture identified.
- **signingInstantTimestamp**: 2025-09-15T15:00:00Z

###### impression

- **contentAsString**: IMPRESSION: 1. Multiple crayon-shaped foreign bodies within the cranial vault, unchanged from prior X-ray. 2. No acute intracranial abnormality. 3. Recommend continued monitoring. Patient declines surgical removal stating "the crayons keep me creative."
- **signingInstantTimestamp**: 2025-09-15T15:00:00Z
- **addenda**: (none)
- **transcriptions**: (none)
- **ecgDiagnosis**: (none)
- **hasStudyContent**: true
- **isFullResultText**: false
- **isCupidAddendum**: (none)

###### resultNote

- **contentAsString**: (empty)
- **signingInstantTimestamp**: (empty)

###### resultLetter

- **contentAsString**: (empty)
- **signingInstantTimestamp**: (empty)
- **providerComments**: (none)

###### reportDetails

- **reportID**: RPT-CT-001
- **isDownloadablePDFReport**: false
- **reportContentText**:

CT Head without Contrast  
  
FINDINGS: Multiple radiopaque foreign bodies within cranial vault consistent with crayons (at least 16).

###### imageStudies (1)

| studyDescription | modality | studyDate | numberOfImages |
| - | - | - | - |
| CT Head without Contrast | CT | 2025-09-15 | 9 |
- **scans**: (none)

###### fdiLink

- **redirectUrl**: /Extensibility/Redirection/FdiRedirection?fdi=FDI-CT-001&ord=ORD-CT-001

#### historicalResults

(empty)

</details>

<details>
<summary><code>mode: concise</code> (2783 chars)</summary>

## orders (2)

### orders 1

- **index**: 0
- **image_id**: eyJmZGkiOiJGREktWFJBWS0wMDEiLCJvcmQiOiJPUkQtWFJBWS0wMDEifQ
- **hasViewableImages**: true
- **orderName**: XR Skull 2 Views

#### results (1)

##### results 1

- **name**: XR Skull 2 Views
- **prioritizedInstantISO**: 2025-08-05T11:00:00
- **resultStatus**: Final
- **orderProviderName**: Julius Hibbert, MD
- **resultComponents**: (none)
- **narrative**: FINDINGS: Calvarium is intact. Multiple radiopaque foreign bodies identified within the cranial vault consistent with crayon-shaped objects (at least 5). No acute fracture. No intracranial hemorrhage. Sella turcica is normal.
- **impression**: IMPRESSION: Multiple crayon-shaped foreign bodies within the cranial vault. Clinical correlation recommended. Consider neurosurgical consultation for foreign body removal. Patient states he has had crayons in his brain since childhood.
- **addenda**: (none)
- **resultNote**: (empty)
- **resultLetter**: (empty)
- **reportContentText**:

XR Skull 2 Views  
  
FINDINGS: Multiple radiopaque foreign bodies within cranial vault consistent with crayons.  
  
View Images

###### imageStudies (1)

| studyDescription | modality | studyDate | numberOfImages |
| - | - | - | - |
| XR Skull 2 Views | CR | 2025-08-05 | 2 |

#### historicalResults

(empty)

### orders 2

- **index**: 1
- **image_id**: eyJmZGkiOiJGREktQ1QtMDAxIiwib3JkIjoiT1JELUNULTAwMSJ9
- **hasViewableImages**: true
- **orderName**: CT Head without Contrast

#### results (1)

##### results 1

- **name**: CT Head without Contrast
- **prioritizedInstantISO**: 2025-09-15T15:00:00
- **resultStatus**: Final
- **orderProviderName**: Julius Hibbert, MD
- **resultComponents**: (none)
- **narrative**: FINDINGS: CT of the head without contrast. Multiple radiopaque foreign bodies identified within the cranial vault, consistent with crayon-shaped objects (at least 16 individual crayons). No acute intracranial hemorrhage. No midline shift. Ventricles are normal in size and configuration. Gray-white matter differentiation is preserved. No acute fracture identified.
- **impression**: IMPRESSION: 1. Multiple crayon-shaped foreign bodies within the cranial vault, unchanged from prior X-ray. 2. No acute intracranial abnormality. 3. Recommend continued monitoring. Patient declines surgical removal stating "the crayons keep me creative."
- **addenda**: (none)
- **resultNote**: (empty)
- **resultLetter**: (empty)
- **reportContentText**:

CT Head without Contrast  
  
FINDINGS: Multiple radiopaque foreign bodies within cranial vault consistent with crayons (at least 16).

###### imageStudies (1)

| studyDescription | modality | studyDate | numberOfImages |
| - | - | - | - |
| CT Head without Contrast | CT | 2025-09-15 | 9 |

#### historicalResults

(empty)

</details>

<details>
<summary><code>mode: json</code> (5204 chars)</summary>

```json
{
  "orders": [
    {
      "index": 0,
      "image_id": "eyJmZGkiOiJGREktWFJBWS0wMDEiLCJvcmQiOiJPUkQtWFJBWS0wMDEifQ",
      "hasViewableImages": true,
      "isImagingByName": true,
      "isImagingByContent": true,
      "orderName": "XR Skull 2 Views",
      "key": "RES-XRAY",
      "isInpatient": false,
      "isEDVisit": false,
      "formattedAdmitDate": "",
      "formattedDischargeDate": "",
      "results": [
        {
          "name": "XR Skull 2 Views",
          "key": "RES-XRAY",
          "isAbnormal": false,
          "hasComment": false,
          "warningType": "",
          "warningMessage": "",
          "orderMetadata": {
            "prioritizedInstantISO": "2025-08-05T11:00:00",
            "prioritizedInstantDisplay": "Aug 5, 2025 11:00 AM",
            "resultTimestampDisplay": "Aug 5, 2025 11:00 AM",
            "latestUpdateInstantISO": "2025-08-05T11:00:00",
            "collectionTimestampsDisplay": "Aug 5, 2025 10:00 AM",
            "specimensDisplay": "",
            "resultStatus": "Final",
            "orderProviderName": "Julius Hibbert, MD",
            "authorizingProviderName": null,
            "readingProviderName": "Julius Hibbert, MD",
            "resultType": "IMAGING",
            "associatedDiagnoses": [],
            "resultingLab": {
              "name": "Springfield General Hospital Radiology",
              "address": [
                "123 Main Street",
                "Springfield, NT 49007"
              ],
              "phoneNumber": "(555) 636-3000",
              "labDirector": "Julius Hibbert, MD",
              "cliaNumber": "",
              "accreditationType": ""
            }
          },
          "resultComponents": [],
          "studyResult": {
            "narrative": {
              "contentAsString": "FINDINGS: Calvarium is intact. Multiple radiopaque foreign bodies identified within the cranial vault consistent with crayon-shaped objects (at least 5). No acute fracture. No intracranial hemorrhage. Sella turcica is normal.",
              "signingInstantTimestamp": "2025-08-05T11:00:00Z"
            },
            "impression": {
              "contentAsString": "IMPRESSION: Multiple crayon-shaped foreign bodies within the cranial vault. Clinical correlation recommended. Consider neurosurgical consultation for foreign body removal. Patient states he has had crayons in his brain since childhood.",
              "signingInstantTimestamp": "2025-08-05T11:00:00Z"
            },
            "addenda": [],
            "transcriptions": [],
            "ecgDiagnosis": [],
            "hasStudyContent": true,
            "isFullResultText": false,
            "isCupidAddendum": null
          },
          "resultNote": {
            "contentAsString": "",
            "signingInstantTimestamp": ""
          },
          "resultLetter": {
            "contentAsString": "",
            "signingInstantTimestamp": ""
          },
          "providerComments": [],
          "reportDetails": {
            "reportID": "RPT-XRAY-001",
            "isDownloadablePDFReport": false
          },
          "reportContentText": "XR Skull 2 Views\n\nFINDINGS: Multiple radiopaque foreign bodies within cranial vault consistent with crayons.\n\nView Images",
          "imageStudies": [
            {
              "studyDescription": "XR Skull 2 Views",
              "modality": "CR",
              "studyDate": "2025-08-05",
              "numberOfImages": 2
            }
          ],
          "scans": [],
          "fdiLink": {
            "redirectUrl": null
          }
        }
      ],
      "historicalResults": {}
    },
    {
      "index": 1,
      "image_id": "eyJmZGkiOiJGREktQ1QtMDAxIiwib3JkIjoiT1JELUNULTAwMSJ9",
      "hasViewableImages": true,
      "isImagingByName": true,
      "isImagingByContent": true,
      "orderName": "CT Head without Contrast",
      "key": "RES-CT",
      "isInpatient": false,
      "isEDVisit": false,
      "formattedAdmitDate": "",
      "formattedDischargeDate": "",
      "results": [
        {
          "name": "CT Head without Contrast",
          "key": "RES-CT",
          "isAbnormal": false,
          "hasComment": false,
          "warningType": "",
          "warningMessage": "",
          "orderMetadata": {
            "prioritizedInstantISO": "2025-09-15T15:00:00",
            "prioritizedInstantDisplay": "Sep 15, 2025 3:00 PM",
            "resultTimestampDisplay": "Sep 15, 2025 3:00 PM",
            "latestUpdateInstantISO": "2025-09-15T15:00:00",
            "collectionTimestampsDisplay": "Sep 15, 2025 2:30 PM",
            "specimensDisplay": "",
            "resultStatus": "Final",
            "orderProviderName": "Julius Hibbert, MD",
            "authorizingProviderName": null,
            "readingProviderName": "Julius Hibbert, MD",
            "resultType": "IMAGING",
            "associatedDiagnoses": [],
            "resultingLab": {
              "name": "Springfield General Hospital Radiology",
              "address": [
                "123 Main Street",
                "Springfield, NT 49007"
              ],
              "phoneNumber": "(555) 636-3000",
              "labDirector": "Julius Hibbert, MD",
              "cliaNumber": "",
              "accreditationType": ""
            }
          },
          "resultComponents": [],
          "studyResult": {
            "narrative": {
              "contentAsString": "FINDINGS: CT of the head without contrast. Multiple radiopaque foreign bodies identified within the cranial vault, consistent with crayon-shaped objects (at least 16 individual crayons). No acute intracranial hemorrhage. No midline shift. Ventricles are normal in size and configuration. Gray-white matter differentiation is preserved. No acute fracture identified.",
              "signingInstantTimestamp": "2025-09-15T15:00:00Z"
            },
            "impression": {
              "contentAsString": "IMPRESSION: 1. Multiple crayon-shaped foreign bodies within the cranial vault, unchanged from prior X-ray. 2. No acute intracranial abnormality. 3. Recommend continued monitoring. Patient declines surgical removal stating \"the crayons keep me creative.\"",
              "signingInstantTimestamp": "2025-09-15T15:00:00Z"
            },
            "addenda": [],
            "transcriptions": [],
            "ecgDiagnosis": [],
            "hasStudyContent": true,
            "isFullResultText": false,
            "isCupidAddendum": null
          },
          "resultNote": {
            "contentAsString": "",
            "signingInstantTimestamp": ""
          },
          "resultLetter": {
            "contentAsString": "",
            "signingInstantTimestamp": ""
          },
          "providerComments": [],
          "reportDetails": {
            "reportID": "RPT-CT-001",
            "isDownloadablePDFReport": false
          },
          "reportContentText": "CT Head without Contrast\n\nFINDINGS: Multiple radiopaque foreign bodies within cranial vault consistent with crayons (at least 16).",
          "imageStudies": [
            {
              "studyDescription": "CT Head without Contrast",
              "modality": "CT",
              "studyDate": "2025-09-15",
              "numberOfImages": 9
            }
          ],
          "scans": [],
          "fdiLink": {
            "redirectUrl": "/Extensibility/Redirection/FdiRedirection?fdi=FDI-CT-001&ord=ORD-CT-001"
          }
        }
      ],
      "historicalResults": {}
    }
  ]
}
```

</details>

---

### `get_messages`

Inbox conversations with the care team.

<details>
<summary><code>mode: raw</code> (8224 chars)</summary>

```json
{
  "legacyXUnreadCount": 0,
  "conversations": [
    {
      "contexts": [],
      "subject": "Weight Management Follow-up",
      "tags": {
        "Messages": false,
        "Unread": false
      },
      "previewText": "Homer, we discussed your weight loss goals...",
      "hasAttachments": false,
      "hasTasks": false,
      "hasUrgentMsgs": false,
      "legacyMessageDetailsUrl": "",
      "audience": [
        {
          "name": "Julius Hibbert, MD"
        }
      ],
      "hasLoadAllUsers": false,
      "allowBulkActions": false,
      "hthId": "CONV-001",
      "messages": [
        {
          "wmgId": "MSG-001",
          "isUnread": false,
          "deliveryInstantISO": "2026-01-10T14:30:00Z",
          "body": "<div class=\"fmtConv\" style=\"line-height: normal; font-family: Arial; widows: 1; orphans: 1;\"><div data-paragraph=\"1\"><span style=\"font-size: 1.083333rem; font-family: Arial, monospace; color: #000000;\" lang=\"en\">Homer, as we discussed during your visit, I strongly recommend reducing your donut intake to no more than 3 per day.</span></div>\r\n<div data-paragraph=\"2\"><span style=\"font-size: 1.083333rem; font-family: Arial, monospace; color: #000000;\" lang=\"en\">&nbsp;</span></div>\r\n<div data-paragraph=\"3\"><span style=\"font-size: 1.083333rem; font-family: Arial, monospace; color: #000000;\" lang=\"en\">Your cholesterol levels are concerning.</span></div></div>",
          "author": {
            "displayName": "",
            "empKey": "PROV-HIBBERT"
          },
          "attachments": [],
          "tasks": [],
          "suggestedActions": []
        },
        {
          "wmgId": "MSG-002",
          "isUnread": false,
          "deliveryInstantISO": "2026-01-10T15:45:00Z",
          "body": "<div class=\"fmtConv\" style=\"line-height: normal; font-family: Arial; widows: 1; orphans: 1;\"><div data-paragraph=\"1\"><span style=\"font-size: 1.083333rem; font-family: Arial, monospace; color: #000000;\" lang=\"en\">But doc, donuts are a food group! Can't I just take more pills instead?</span></div></div>",
          "author": {
            "displayName": "",
            "empKey": "",
            "wprKey": "WPR-HOMER"
          },
          "attachments": [],
          "tasks": [],
          "suggestedActions": []
        },
        {
          "wmgId": "MSG-003",
          "isUnread": false,
          "deliveryInstantISO": "2026-01-11T09:00:00Z",
          "body": "<div class=\"fmtConv\" style=\"line-height: normal; font-family: Arial; widows: 1; orphans: 1;\"><div data-paragraph=\"1\"><span style=\"font-size: 1.083333rem; font-family: Arial, monospace; color: #000000;\" lang=\"en\">No Homer, that's not how it works. Let's schedule a nutritionist appointment. I'm also referring you to a weight management program.</span></div></div>",
          "author": {
            "displayName": "",
            "empKey": "PROV-HIBBERT"
          },
          "attachments": [],
          "tasks": [],
          "suggestedActions": []
        }
      ],
      "hasMoreMessages": false,
      "messageType": "",
      "userKeys": [
        "PROV-HIBBERT"
      ],
      "userOverrideNames": {},
      "maskedUserNames": [],
      "showOtherViewersOption": false,
      "viewerKeys": [
        "WPR-HOMER"
      ],
      "organizationId": ""
    },
    {
      "contexts": [],
      "subject": "Discount Surgery Consultation",
      "tags": {
        "Messages": false,
        "Unread": false
      },
      "previewText": "Hi-Everybody! I have great news about...",
      "hasAttachments": false,
      "hasTasks": false,
      "hasUrgentMsgs": false,
      "legacyMessageDetailsUrl": "",
      "audience": [
        {
          "name": "Nick Riviera, MD"
        }
      ],
      "hasLoadAllUsers": false,
      "allowBulkActions": false,
      "hthId": "CONV-002",
      "messages": [
        {
          "wmgId": "MSG-004",
          "isUnread": false,
          "deliveryInstantISO": "2025-12-15T10:00:00Z",
          "body": "<div class=\"fmtConv\" style=\"line-height: normal; font-family: Arial; widows: 1; orphans: 1;\"><div data-paragraph=\"1\"><span style=\"font-size: 1.083333rem; font-family: Arial, monospace; color: #000000;\" lang=\"en\">Hi-Everybody! I have great news about a new discount liposuction &amp; lap-band procedure. Only $29.95! Results may vary.</span></div></div>",
          "author": {
            "displayName": "",
            "empKey": "PROV-NICK"
          },
          "attachments": [],
          "tasks": [],
          "suggestedActions": []
        },
        {
          "wmgId": "MSG-005",
          "isUnread": false,
          "deliveryInstantISO": "2025-12-15T11:30:00Z",
          "body": "<div class=\"fmtConv\" style=\"line-height: normal; font-family: Arial; widows: 1; orphans: 1;\"><div data-paragraph=\"1\"><span style=\"font-size: 1.083333rem; font-family: Arial, monospace; color: #000000;\" lang=\"en\">Woohoo! Sign me up, Dr. Nick! That's cheaper than a month of donuts!</span></div></div>",
          "author": {
            "displayName": "",
            "empKey": "",
            "wprKey": "WPR-HOMER"
          },
          "attachments": [],
          "tasks": [],
          "suggestedActions": []
        }
      ],
      "hasMoreMessages": false,
      "messageType": "",
      "userKeys": [
        "PROV-NICK"
      ],
      "userOverrideNames": {},
      "maskedUserNames": [],
      "showOtherViewersOption": false,
      "viewerKeys": [
        "WPR-HOMER"
      ],
      "organizationId": ""
    },
    {
      "contexts": [],
      "subject": "Back pain after the bowling tournament",
      "tags": {
        "Messages": false,
        "Unread": false
      },
      "previewText": "Following up on the imaging we ordered...",
      "hasAttachments": false,
      "hasTasks": false,
      "hasUrgentMsgs": false,
      "legacyMessageDetailsUrl": "",
      "audience": [
        {
          "name": "Julius Hibbert, MD"
        }
      ],
      "hasLoadAllUsers": false,
      "allowBulkActions": false,
      "hthId": "CONV-003",
      "messages": [
        {
          "wmgId": "MSG-013",
          "isUnread": false,
          "deliveryInstantISO": "2025-11-02T16:20:00Z",
          "body": "<div class=\"fmtConv\" style=\"line-height: normal; font-family: Arial; widows: 1; orphans: 1;\"><div data-paragraph=\"1\"><span style=\"font-size: 1.083333rem; font-family: Arial, monospace; color: #000000;\" lang=\"en\">Let's get imaging. I have placed the order; the department will reach out to schedule.</span></div></div>",
          "author": {
            "displayName": "",
            "empKey": "PROV-HIBBERT"
          },
          "attachments": [],
          "tasks": [],
          "suggestedActions": []
        },
        {
          "wmgId": "MSG-014",
          "isUnread": false,
          "deliveryInstantISO": "2025-11-03T09:05:00Z",
          "body": "<div class=\"fmtConv\" style=\"line-height: normal; font-family: Arial; widows: 1; orphans: 1;\"><div data-paragraph=\"1\"><span style=\"font-size: 1.083333rem; font-family: Arial, monospace; color: #000000;\" lang=\"en\">We have openings Thursday morning and Friday afternoon. Which works better?</span></div></div>",
          "author": {
            "displayName": "",
            "empKey": "PROV-MONROE"
          },
          "attachments": [],
          "tasks": [],
          "suggestedActions": []
        },
        {
          "wmgId": "MSG-015",
          "isUnread": false,
          "deliveryInstantISO": "2025-11-03T09:40:00Z",
          "body": "<div class=\"fmtConv\" style=\"line-height: normal; font-family: Arial; widows: 1; orphans: 1;\"><div data-paragraph=\"1\"><span style=\"font-size: 1.083333rem; font-family: Arial, monospace; color: #000000;\" lang=\"en\">Friday afternoon. Thursday is donut day at the plant.</span></div></div>",
          "author": {
            "displayName": "",
            "empKey": "",
            "wprKey": "WPR-HOMER"
          },
          "attachments": [],
          "tasks": [],
          "suggestedActions": []
        },
        {
          "wmgId": "MSG-016",
          "isUnread": false,
          "deliveryInstantISO": "2025-11-03T10:12:00Z",
          "body": "<div class=\"fmtConv\" style=\"line-height: normal; font-family: Arial; widows: 1; orphans: 1;\"><div data-paragraph=\"1\"><span style=\"font-size: 1.083333rem; font-family: Arial, monospace; color: #000000;\" lang=\"en\">Booked for Friday at 2:00 PM. Please arrive fifteen minutes early.</span></div></div>",
          "author": {
            "displayName": "",
            "empKey": "PROV-MONROE"
          },
          "attachments": [],
          "tasks": [],
          "suggestedActions": []
        },
        {
          "wmgId": "MSG-017",
          "isUnread": false,
          "deliveryInstantISO": "2025-11-07T11:00:00Z",
          "body": "<div class=\"fmtConv\" style=\"line-height: normal; font-family: Arial; widows: 1; orphans: 1;\"><div data-paragraph=\"1\"><span style=\"font-size: 1.083333rem; font-family: Arial, monospace; color: #000000;\" lang=\"en\">Imaging looks reassuring. Keep moving gently and follow up if the pain worsens.</span></div></div>",
          "author": {
            "displayName": "",
            "empKey": "PROV-HIBBERT"
          },
          "attachments": [],
          "tasks": [],
          "suggestedActions": []
        }
      ],
      "hasMoreMessages": true,
      "messageType": "",
      "userKeys": [
        "PROV-HIBBERT",
        "PROV-MONROE"
      ],
      "userOverrideNames": {
        "PROV-MONROE": "Springfield Spine Clinic"
      },
      "maskedUserNames": [],
      "showOtherViewersOption": false,
      "viewerKeys": [
        "WPR-HOMER"
      ],
      "organizationId": ""
    }
  ],
  "localSummary": {
    "hasMoreConversations": false,
    "newestLoadedInstantISO": "",
    "numberLoaded": 0,
    "oldestLoadedInstantISO": "",
    "oldestSearchedInstantISO": "",
    "pagingInfo": 0
  },
  "users": {
    "PROV-HIBBERT": {
      "empId": "",
      "name": "Julius Hibbert, MD",
      "outOfContactEndDate": "",
      "outOfContactContext": 0,
      "outOfContactContextString": "",
      "photoUrl": "",
      "providerId": "",
      "organizationId": ""
    },
    "PROV-NICK": {
      "empId": "",
      "name": "Nick Riviera, MD",
      "outOfContactEndDate": "",
      "outOfContactContext": 0,
      "outOfContactContextString": "",
      "photoUrl": "",
      "providerId": "",
      "organizationId": ""
    },
    "PROV-MONROE": {
      "empId": "",
      "name": "Marvin Monroe, MD",
      "outOfContactEndDate": "",
      "outOfContactContext": 0,
      "outOfContactContextString": "",
      "photoUrl": "",
      "providerId": "",
      "organizationId": ""
    }
  },
  "viewers": {
    "WPR-HOMER": {
      "wprId": "",
      "name": "Homer Simpson",
      "isSelf": true,
      "isShown": false,
      "isSelected": false,
      "organizationId": ""
    }
  },
  "externalSummaries": {}
}
```

</details>

<details>
<summary><code>mode: standard</code> (5523 chars)</summary>

- **legacyXUnreadCount**: 0

## conversations (3)

### conversations 1

- **hthId**: CONV-001
- **subject**: Weight Management Follow-up

#### audience (1)

| name |
| - |
| Julius Hibbert, MD |

#### tags

- **Unread**: false
- **hasUrgentMsgs**: false
- **hasMoreMessages**: false
- **previewText**: Homer, we discussed your weight loss goals...
- **hasAttachments**: false
- **hasTasks**: false
- **messageType**: (empty)

#### messages (3)

##### messages 1

- **wmgId**: MSG-001
- **deliveryInstantISO**: 2026-01-10T14:30:00Z
- **senderName**: Julius Hibbert, MD
- **isFromPatient**: false
- **isUnread**: false
- **bodyText**:

Homer, as we discussed during your visit, I strongly recommend reducing your donut intake to no more than 3 per day.  
  
Your cholesterol levels are concerning.

###### author

- **empKey**: PROV-HIBBERT
- **wprKey**: (none)
- **attachments**: (none)
- **tasks**: (none)
- **suggestedActions**: (none)

##### messages 2

- **wmgId**: MSG-002
- **deliveryInstantISO**: 2026-01-10T15:45:00Z
- **senderName**: Homer Simpson
- **isFromPatient**: true
- **isUnread**: false
- **bodyText**: But doc, donuts are a food group! Can't I just take more pills instead?

###### author

- **empKey**: (empty)
- **wprKey**: WPR-HOMER
- **attachments**: (none)
- **tasks**: (none)
- **suggestedActions**: (none)

##### messages 3

- **wmgId**: MSG-003
- **deliveryInstantISO**: 2026-01-11T09:00:00Z
- **senderName**: Julius Hibbert, MD
- **isFromPatient**: false
- **isUnread**: false
- **bodyText**: No Homer, that's not how it works. Let's schedule a nutritionist appointment. I'm also referring you to a weight management program.

###### author

- **empKey**: PROV-HIBBERT
- **wprKey**: (none)
- **attachments**: (none)
- **tasks**: (none)
- **suggestedActions**: (none)

### conversations 2

- **hthId**: CONV-002
- **subject**: Discount Surgery Consultation

#### audience (1)

| name |
| - |
| Nick Riviera, MD |

#### tags

- **Unread**: false
- **hasUrgentMsgs**: false
- **hasMoreMessages**: false
- **previewText**: Hi-Everybody! I have great news about...
- **hasAttachments**: false
- **hasTasks**: false
- **messageType**: (empty)

#### messages (2)

##### messages 1

- **wmgId**: MSG-004
- **deliveryInstantISO**: 2025-12-15T10:00:00Z
- **senderName**: Nick Riviera, MD
- **isFromPatient**: false
- **isUnread**: false
- **bodyText**: Hi-Everybody! I have great news about a new discount liposuction & lap-band procedure. Only $29.95! Results may vary.

###### author

- **empKey**: PROV-NICK
- **wprKey**: (none)
- **attachments**: (none)
- **tasks**: (none)
- **suggestedActions**: (none)

##### messages 2

- **wmgId**: MSG-005
- **deliveryInstantISO**: 2025-12-15T11:30:00Z
- **senderName**: Homer Simpson
- **isFromPatient**: true
- **isUnread**: false
- **bodyText**: Woohoo! Sign me up, Dr. Nick! That's cheaper than a month of donuts!

###### author

- **empKey**: (empty)
- **wprKey**: WPR-HOMER
- **attachments**: (none)
- **tasks**: (none)
- **suggestedActions**: (none)

### conversations 3

- **hthId**: CONV-003
- **subject**: Back pain after the bowling tournament

#### audience (1)

| name |
| - |
| Julius Hibbert, MD |

#### tags

- **Unread**: false
- **hasUrgentMsgs**: false
- **hasMoreMessages**: true
- **previewText**: Following up on the imaging we ordered...
- **hasAttachments**: false
- **hasTasks**: false
- **messageType**: (empty)

#### messages (5)

##### messages 1

- **wmgId**: MSG-013
- **deliveryInstantISO**: 2025-11-02T16:20:00Z
- **senderName**: Julius Hibbert, MD
- **isFromPatient**: false
- **isUnread**: false
- **bodyText**: Let's get imaging. I have placed the order; the department will reach out to schedule.

###### author

- **empKey**: PROV-HIBBERT
- **wprKey**: (none)
- **attachments**: (none)
- **tasks**: (none)
- **suggestedActions**: (none)

##### messages 2

- **wmgId**: MSG-014
- **deliveryInstantISO**: 2025-11-03T09:05:00Z
- **senderName**: Springfield Spine Clinic
- **isFromPatient**: false
- **isUnread**: false
- **bodyText**: We have openings Thursday morning and Friday afternoon. Which works better?

###### author

- **empKey**: PROV-MONROE
- **wprKey**: (none)
- **attachments**: (none)
- **tasks**: (none)
- **suggestedActions**: (none)

##### messages 3

- **wmgId**: MSG-015
- **deliveryInstantISO**: 2025-11-03T09:40:00Z
- **senderName**: Homer Simpson
- **isFromPatient**: true
- **isUnread**: false
- **bodyText**: Friday afternoon. Thursday is donut day at the plant.

###### author

- **empKey**: (empty)
- **wprKey**: WPR-HOMER
- **attachments**: (none)
- **tasks**: (none)
- **suggestedActions**: (none)

##### messages 4

- **wmgId**: MSG-016
- **deliveryInstantISO**: 2025-11-03T10:12:00Z
- **senderName**: Springfield Spine Clinic
- **isFromPatient**: false
- **isUnread**: false
- **bodyText**: Booked for Friday at 2:00 PM. Please arrive fifteen minutes early.

###### author

- **empKey**: PROV-MONROE
- **wprKey**: (none)
- **attachments**: (none)
- **tasks**: (none)
- **suggestedActions**: (none)

##### messages 5

- **wmgId**: MSG-017
- **deliveryInstantISO**: 2025-11-07T11:00:00Z
- **senderName**: Julius Hibbert, MD
- **isFromPatient**: false
- **isUnread**: false
- **bodyText**: Imaging looks reassuring. Keep moving gently and follow up if the pain worsens.

###### author

- **empKey**: PROV-HIBBERT
- **wprKey**: (none)
- **attachments**: (none)
- **tasks**: (none)
- **suggestedActions**: (none)

## localSummary

- **hasMoreConversations**: false
- **oldestLoadedInstantISO**: (empty)

</details>

<details>
<summary><code>mode: concise</code> (3373 chars)</summary>

- **legacyXUnreadCount**: 0

## conversations (3)

### conversations 1

- **hthId**: CONV-001
- **subject**: Weight Management Follow-up

#### audience (1)

| name |
| - |
| Julius Hibbert, MD |

#### tags

- **Unread**: false
- **hasUrgentMsgs**: false
- **hasMoreMessages**: false
- **previewText**: Homer, we discussed your weight loss goals...

#### messages (3)

##### messages 1

- **deliveryInstantISO**: 2026-01-10T14:30:00Z
- **senderName**: Julius Hibbert, MD
- **isFromPatient**: false
- **bodyText**:

Homer, as we discussed during your visit, I strongly recommend reducing your donut intake to no more than 3 per day.  
  
Your cholesterol levels are concerning.

##### messages 2

- **deliveryInstantISO**: 2026-01-10T15:45:00Z
- **senderName**: Homer Simpson
- **isFromPatient**: true
- **bodyText**: But doc, donuts are a food group! Can't I just take more pills instead?

##### messages 3

- **deliveryInstantISO**: 2026-01-11T09:00:00Z
- **senderName**: Julius Hibbert, MD
- **isFromPatient**: false
- **bodyText**: No Homer, that's not how it works. Let's schedule a nutritionist appointment. I'm also referring you to a weight management program.

### conversations 2

- **hthId**: CONV-002
- **subject**: Discount Surgery Consultation

#### audience (1)

| name |
| - |
| Nick Riviera, MD |

#### tags

- **Unread**: false
- **hasUrgentMsgs**: false
- **hasMoreMessages**: false
- **previewText**: Hi-Everybody! I have great news about...

#### messages (2)

##### messages 1

- **deliveryInstantISO**: 2025-12-15T10:00:00Z
- **senderName**: Nick Riviera, MD
- **isFromPatient**: false
- **bodyText**: Hi-Everybody! I have great news about a new discount liposuction & lap-band procedure. Only $29.95! Results may vary.

##### messages 2

- **deliveryInstantISO**: 2025-12-15T11:30:00Z
- **senderName**: Homer Simpson
- **isFromPatient**: true
- **bodyText**: Woohoo! Sign me up, Dr. Nick! That's cheaper than a month of donuts!

### conversations 3

- **hthId**: CONV-003
- **subject**: Back pain after the bowling tournament

#### audience (1)

| name |
| - |
| Julius Hibbert, MD |

#### tags

- **Unread**: false
- **hasUrgentMsgs**: false
- **hasMoreMessages**: true
- **previewText**: Following up on the imaging we ordered...

#### messages (5)

##### messages 1

- **deliveryInstantISO**: 2025-11-02T16:20:00Z
- **senderName**: Julius Hibbert, MD
- **isFromPatient**: false
- **bodyText**: Let's get imaging. I have placed the order; the department will reach out to schedule.

##### messages 2

- **deliveryInstantISO**: 2025-11-03T09:05:00Z
- **senderName**: Springfield Spine Clinic
- **isFromPatient**: false
- **bodyText**: We have openings Thursday morning and Friday afternoon. Which works better?

##### messages 3

- **deliveryInstantISO**: 2025-11-03T09:40:00Z
- **senderName**: Homer Simpson
- **isFromPatient**: true
- **bodyText**: Friday afternoon. Thursday is donut day at the plant.

##### messages 4

- **deliveryInstantISO**: 2025-11-03T10:12:00Z
- **senderName**: Springfield Spine Clinic
- **isFromPatient**: false
- **bodyText**: Booked for Friday at 2:00 PM. Please arrive fifteen minutes early.

##### messages 5

- **deliveryInstantISO**: 2025-11-07T11:00:00Z
- **senderName**: Julius Hibbert, MD
- **isFromPatient**: false
- **bodyText**: Imaging looks reassuring. Keep moving gently and follow up if the pain worsens.

</details>

<details>
<summary><code>mode: json</code> (4413 chars)</summary>

```json
{
  "legacyXUnreadCount": 0,
  "conversations": [
    {
      "hthId": "CONV-001",
      "subject": "Weight Management Follow-up",
      "audience": [
        {
          "name": "Julius Hibbert, MD"
        }
      ],
      "tags": {
        "Unread": false
      },
      "hasUrgentMsgs": false,
      "hasMoreMessages": false,
      "previewText": "Homer, we discussed your weight loss goals...",
      "hasAttachments": false,
      "hasTasks": false,
      "messageType": "",
      "messages": [
        {
          "wmgId": "MSG-001",
          "deliveryInstantISO": "2026-01-10T14:30:00Z",
          "senderName": "Julius Hibbert, MD",
          "isFromPatient": false,
          "isUnread": false,
          "bodyText": "Homer, as we discussed during your visit, I strongly recommend reducing your donut intake to no more than 3 per day.\n\nYour cholesterol levels are concerning.",
          "author": {
            "empKey": "PROV-HIBBERT",
            "wprKey": null
          },
          "attachments": [],
          "tasks": [],
          "suggestedActions": []
        },
        {
          "wmgId": "MSG-002",
          "deliveryInstantISO": "2026-01-10T15:45:00Z",
          "senderName": "Homer Simpson",
          "isFromPatient": true,
          "isUnread": false,
          "bodyText": "But doc, donuts are a food group! Can't I just take more pills instead?",
          "author": {
            "empKey": "",
            "wprKey": "WPR-HOMER"
          },
          "attachments": [],
          "tasks": [],
          "suggestedActions": []
        },
        {
          "wmgId": "MSG-003",
          "deliveryInstantISO": "2026-01-11T09:00:00Z",
          "senderName": "Julius Hibbert, MD",
          "isFromPatient": false,
          "isUnread": false,
          "bodyText": "No Homer, that's not how it works. Let's schedule a nutritionist appointment. I'm also referring you to a weight management program.",
          "author": {
            "empKey": "PROV-HIBBERT",
            "wprKey": null
          },
          "attachments": [],
          "tasks": [],
          "suggestedActions": []
        }
      ]
    },
    {
      "hthId": "CONV-002",
      "subject": "Discount Surgery Consultation",
      "audience": [
        {
          "name": "Nick Riviera, MD"
        }
      ],
      "tags": {
        "Unread": false
      },
      "hasUrgentMsgs": false,
      "hasMoreMessages": false,
      "previewText": "Hi-Everybody! I have great news about...",
      "hasAttachments": false,
      "hasTasks": false,
      "messageType": "",
      "messages": [
        {
          "wmgId": "MSG-004",
          "deliveryInstantISO": "2025-12-15T10:00:00Z",
          "senderName": "Nick Riviera, MD",
          "isFromPatient": false,
          "isUnread": false,
          "bodyText": "Hi-Everybody! I have great news about a new discount liposuction & lap-band procedure. Only $29.95! Results may vary.",
          "author": {
            "empKey": "PROV-NICK",
            "wprKey": null
          },
          "attachments": [],
          "tasks": [],
          "suggestedActions": []
        },
        {
          "wmgId": "MSG-005",
          "deliveryInstantISO": "2025-12-15T11:30:00Z",
          "senderName": "Homer Simpson",
          "isFromPatient": true,
          "isUnread": false,
          "bodyText": "Woohoo! Sign me up, Dr. Nick! That's cheaper than a month of donuts!",
          "author": {
            "empKey": "",
            "wprKey": "WPR-HOMER"
          },
          "attachments": [],
          "tasks": [],
          "suggestedActions": []
        }
      ]
    },
    {
      "hthId": "CONV-003",
      "subject": "Back pain after the bowling tournament",
      "audience": [
        {
          "name": "Julius Hibbert, MD"
        }
      ],
      "tags": {
        "Unread": false
      },
      "hasUrgentMsgs": false,
      "hasMoreMessages": true,
      "previewText": "Following up on the imaging we ordered...",
      "hasAttachments": false,
      "hasTasks": false,
      "messageType": "",
      "messages": [
        {
          "wmgId": "MSG-013",
          "deliveryInstantISO": "2025-11-02T16:20:00Z",
          "senderName": "Julius Hibbert, MD",
          "isFromPatient": false,
          "isUnread": false,
          "bodyText": "Let's get imaging. I have placed the order; the department will reach out to schedule.",
          "author": {
            "empKey": "PROV-HIBBERT",
            "wprKey": null
          },
          "attachments": [],
          "tasks": [],
          "suggestedActions": []
        },
        {
          "wmgId": "MSG-014",
          "deliveryInstantISO": "2025-11-03T09:05:00Z",
          "senderName": "Springfield Spine Clinic",
          "isFromPatient": false,
          "isUnread": false,
          "bodyText": "We have openings Thursday morning and Friday afternoon. Which works better?",
          "author": {
            "empKey": "PROV-MONROE",
            "wprKey": null
          },
          "attachments": [],
          "tasks": [],
          "suggestedActions": []
        },
        {
          "wmgId": "MSG-015",
          "deliveryInstantISO": "2025-11-03T09:40:00Z",
          "senderName": "Homer Simpson",
          "isFromPatient": true,
          "isUnread": false,
          "bodyText": "Friday afternoon. Thursday is donut day at the plant.",
          "author": {
            "empKey": "",
            "wprKey": "WPR-HOMER"
          },
          "attachments": [],
          "tasks": [],
          "suggestedActions": []
        },
        {
          "wmgId": "MSG-016",
          "deliveryInstantISO": "2025-11-03T10:12:00Z",
          "senderName": "Springfield Spine Clinic",
          "isFromPatient": false,
          "isUnread": false,
          "bodyText": "Booked for Friday at 2:00 PM. Please arrive fifteen minutes early.",
          "author": {
            "empKey": "PROV-MONROE",
            "wprKey": null
          },
          "attachments": [],
          "tasks": [],
          "suggestedActions": []
        },
        {
          "wmgId": "MSG-017",
          "deliveryInstantISO": "2025-11-07T11:00:00Z",
          "senderName": "Julius Hibbert, MD",
          "isFromPatient": false,
          "isUnread": false,
          "bodyText": "Imaging looks reassuring. Keep moving gently and follow up if the pain worsens.",
          "author": {
            "empKey": "PROV-HIBBERT",
            "wprKey": null
          },
          "attachments": [],
          "tasks": [],
          "suggestedActions": []
        }
      ]
    }
  ],
  "localSummary": {
    "hasMoreConversations": false,
    "oldestLoadedInstantISO": ""
  }
}
```

</details>

---

### `get_message_thread`

Every message in one conversation.

Arguments: ```json
{"conversation_id":"CONV-001"}
```

<details>
<summary><code>mode: raw</code> (3424 chars)</summary>

```json
{
  "contexts": [],
  "lastViewedByStaffMsgId": "",
  "lastViewedByStaffInstantISO": "",
  "numUnread": 0,
  "replyUrl": "",
  "replyFlags": {
    "canReply": true,
    "cannotReplyReason": 0
  },
  "totalMessages": 3,
  "users": {
    "PROV-HIBBERT": {
      "empId": "",
      "name": "Julius Hibbert, MD",
      "outOfContactEndDate": "",
      "outOfContactContext": 0,
      "outOfContactContextString": "",
      "photoUrl": "",
      "providerId": "",
      "organizationId": ""
    },
    "PROV-NICK": {
      "empId": "",
      "name": "Nick Riviera, MD",
      "outOfContactEndDate": "",
      "outOfContactContext": 0,
      "outOfContactContextString": "",
      "photoUrl": "",
      "providerId": "",
      "organizationId": ""
    },
    "PROV-MONROE": {
      "empId": "",
      "name": "Marvin Monroe, MD",
      "outOfContactEndDate": "",
      "outOfContactContext": 0,
      "outOfContactContextString": "",
      "photoUrl": "",
      "providerId": "",
      "organizationId": ""
    }
  },
  "viewers": {
    "WPR-HOMER": {
      "wprId": "",
      "name": "Homer Simpson",
      "isSelf": true,
      "isShown": false,
      "isSelected": false,
      "organizationId": ""
    }
  },
  "hasPreviouslyViewed": false,
  "subject": "Weight Management Follow-up",
  "tags": {
    "Messages": false
  },
  "previewText": "Homer, we discussed your weight loss goals...",
  "hasAttachments": false,
  "hasTasks": false,
  "hasUrgentMsgs": false,
  "legacyMessageDetailsUrl": "",
  "audience": [
    {
      "empId": "",
      "hipId": "",
      "name": "Julius Hibbert, MD",
      "providerId": ""
    }
  ],
  "hasLoadAllUsers": false,
  "allowBulkActions": false,
  "hthId": "CONV-001",
  "messages": [
    {
      "wmgId": "MSG-001",
      "isUnread": false,
      "deliveryInstantISO": "2026-01-10T14:30:00Z",
      "body": "<div class=\"fmtConv\" style=\"line-height: normal; font-family: Arial; widows: 1; orphans: 1;\"><div data-paragraph=\"1\"><span style=\"font-size: 1.083333rem; font-family: Arial, monospace; color: #000000;\" lang=\"en\">Homer, as we discussed during your visit, I strongly recommend reducing your donut intake to no more than 3 per day.</span></div>\r\n<div data-paragraph=\"2\"><span style=\"font-size: 1.083333rem; font-family: Arial, monospace; color: #000000;\" lang=\"en\">&nbsp;</span></div>\r\n<div data-paragraph=\"3\"><span style=\"font-size: 1.083333rem; font-family: Arial, monospace; color: #000000;\" lang=\"en\">Your cholesterol levels are concerning.</span></div></div>",
      "author": {
        "displayName": "",
        "empKey": "PROV-HIBBERT"
      },
      "attachments": [],
      "tasks": [],
      "suggestedActions": []
    },
    {
      "wmgId": "MSG-002",
      "isUnread": false,
      "deliveryInstantISO": "2026-01-10T15:45:00Z",
      "body": "<div class=\"fmtConv\" style=\"line-height: normal; font-family: Arial; widows: 1; orphans: 1;\"><div data-paragraph=\"1\"><span style=\"font-size: 1.083333rem; font-family: Arial, monospace; color: #000000;\" lang=\"en\">But doc, donuts are a food group! Can't I just take more pills instead?</span></div></div>",
      "author": {
        "displayName": "",
        "empKey": "",
        "wprKey": "WPR-HOMER"
      },
      "attachments": [],
      "tasks": [],
      "suggestedActions": []
    },
    {
      "wmgId": "MSG-003",
      "isUnread": false,
      "deliveryInstantISO": "2026-01-11T09:00:00Z",
      "body": "<div class=\"fmtConv\" style=\"line-height: normal; font-family: Arial; widows: 1; orphans: 1;\"><div data-paragraph=\"1\"><span style=\"font-size: 1.083333rem; font-family: Arial, monospace; color: #000000;\" lang=\"en\">No Homer, that's not how it works. Let's schedule a nutritionist appointment. I'm also referring you to a weight management program.</span></div></div>",
      "author": {
        "displayName": "",
        "empKey": "PROV-HIBBERT"
      },
      "attachments": [],
      "tasks": [],
      "suggestedActions": []
    }
  ],
  "hasMoreMessages": false,
  "messageType": "",
  "userKeys": [
    "PROV-HIBBERT"
  ],
  "userOverrideNames": {},
  "maskedUserNames": [],
  "showOtherViewersOption": false,
  "viewerKeys": [
    "WPR-HOMER"
  ],
  "organizationId": ""
}
```

</details>

<details>
<summary><code>mode: standard</code> (1807 chars)</summary>

- **hthId**: CONV-001
- **subject**: Weight Management Follow-up

## audience (1)

| name |
| - |
| Julius Hibbert, MD |
- **totalMessages**: 3
- **numUnread**: 0
- **truncated**: false

## messages (3)

### messages 1

- **wmgId**: MSG-001
- **deliveryInstantISO**: 2026-01-10T14:30:00Z
- **senderName**: Julius Hibbert, MD
- **isFromPatient**: false
- **isUnread**: false
- **bodyText**:

Homer, as we discussed during your visit, I strongly recommend reducing your donut intake to no more than 3 per day.  
  
Your cholesterol levels are concerning.

#### author

- **empKey**: PROV-HIBBERT
- **wprKey**: (none)
- **attachments**: (none)
- **tasks**: (none)
- **suggestedActions**: (none)

### messages 2

- **wmgId**: MSG-002
- **deliveryInstantISO**: 2026-01-10T15:45:00Z
- **senderName**: Homer Simpson
- **isFromPatient**: true
- **isUnread**: false
- **bodyText**: But doc, donuts are a food group! Can't I just take more pills instead?

#### author

- **empKey**: (empty)
- **wprKey**: WPR-HOMER
- **attachments**: (none)
- **tasks**: (none)
- **suggestedActions**: (none)

### messages 3

- **wmgId**: MSG-003
- **deliveryInstantISO**: 2026-01-11T09:00:00Z
- **senderName**: Julius Hibbert, MD
- **isFromPatient**: false
- **isUnread**: false
- **bodyText**: No Homer, that's not how it works. Let's schedule a nutritionist appointment. I'm also referring you to a weight management program.

#### author

- **empKey**: PROV-HIBBERT
- **wprKey**: (none)
- **attachments**: (none)
- **tasks**: (none)
- **suggestedActions**: (none)

## replyFlags

- **canReply**: true
- **cannotReplyReason**: 0
- **hasPreviouslyViewed**: false
- **hasAttachments**: false
- **hasUrgentMsgs**: false
- **hasTasks**: false
- **messageType**: (empty)
- **previewText**: Homer, we discussed your weight loss goals...

</details>

<details>
<summary><code>mode: concise</code> (997 chars)</summary>

- **hthId**: CONV-001
- **subject**: Weight Management Follow-up

## audience (1)

| name |
| - |
| Julius Hibbert, MD |
- **totalMessages**: 3
- **numUnread**: 0
- **truncated**: false

## messages (3)

### messages 1

- **deliveryInstantISO**: 2026-01-10T14:30:00Z
- **senderName**: Julius Hibbert, MD
- **isFromPatient**: false
- **bodyText**:

Homer, as we discussed during your visit, I strongly recommend reducing your donut intake to no more than 3 per day.  
  
Your cholesterol levels are concerning.

### messages 2

- **deliveryInstantISO**: 2026-01-10T15:45:00Z
- **senderName**: Homer Simpson
- **isFromPatient**: true
- **bodyText**: But doc, donuts are a food group! Can't I just take more pills instead?

### messages 3

- **deliveryInstantISO**: 2026-01-11T09:00:00Z
- **senderName**: Julius Hibbert, MD
- **isFromPatient**: false
- **bodyText**: No Homer, that's not how it works. Let's schedule a nutritionist appointment. I'm also referring you to a weight management program.

</details>

<details>
<summary><code>mode: json</code> (1489 chars)</summary>

```json
{
  "hthId": "CONV-001",
  "subject": "Weight Management Follow-up",
  "audience": [
    {
      "name": "Julius Hibbert, MD"
    }
  ],
  "totalMessages": 3,
  "numUnread": 0,
  "truncated": false,
  "messages": [
    {
      "wmgId": "MSG-001",
      "deliveryInstantISO": "2026-01-10T14:30:00Z",
      "senderName": "Julius Hibbert, MD",
      "isFromPatient": false,
      "isUnread": false,
      "bodyText": "Homer, as we discussed during your visit, I strongly recommend reducing your donut intake to no more than 3 per day.\n\nYour cholesterol levels are concerning.",
      "author": {
        "empKey": "PROV-HIBBERT",
        "wprKey": null
      },
      "attachments": [],
      "tasks": [],
      "suggestedActions": []
    },
    {
      "wmgId": "MSG-002",
      "deliveryInstantISO": "2026-01-10T15:45:00Z",
      "senderName": "Homer Simpson",
      "isFromPatient": true,
      "isUnread": false,
      "bodyText": "But doc, donuts are a food group! Can't I just take more pills instead?",
      "author": {
        "empKey": "",
        "wprKey": "WPR-HOMER"
      },
      "attachments": [],
      "tasks": [],
      "suggestedActions": []
    },
    {
      "wmgId": "MSG-003",
      "deliveryInstantISO": "2026-01-11T09:00:00Z",
      "senderName": "Julius Hibbert, MD",
      "isFromPatient": false,
      "isUnread": false,
      "bodyText": "No Homer, that's not how it works. Let's schedule a nutritionist appointment. I'm also referring you to a weight management program.",
      "author": {
        "empKey": "PROV-HIBBERT",
        "wprKey": null
      },
      "attachments": [],
      "tasks": [],
      "suggestedActions": []
    }
  ],
  "replyFlags": {
    "canReply": true,
    "cannotReplyReason": 0
  },
  "hasPreviouslyViewed": false,
  "hasAttachments": false,
  "hasUrgentMsgs": false,
  "hasTasks": false,
  "messageType": "",
  "previewText": "Homer, we discussed your weight loss goals..."
}
```

</details>

---

### `get_message_recipients`

Providers and departments that can receive a new message.

<details>
<summary><code>mode: raw</code> (983 chars)</summary>

```json
[
  {
    "recipientType": 1,
    "pcpTypeDisplayName": "",
    "displayName": "Julius Hibbert, MD",
    "specialty": "Internal Medicine",
    "userId": "PROV-HIBBERT",
    "departmentId": "DEP-001",
    "poolId": "POOL-001",
    "oocContext": 0,
    "photoUrl": "",
    "providerId": "PROV-HIBBERT",
    "organizationId": ""
  },
  {
    "recipientType": 1,
    "pcpTypeDisplayName": "",
    "displayName": "Nick Riviera, MD",
    "specialty": "General Surgery",
    "userId": "PROV-NICK",
    "departmentId": "DEP-002",
    "poolId": "POOL-002",
    "oocContext": 0,
    "photoUrl": "",
    "providerId": "PROV-NICK",
    "organizationId": ""
  },
  {
    "recipientType": 6,
    "pcpTypeDisplayName": "",
    "displayName": "Billing Department",
    "specialty": "Billing",
    "userId": "POOL-BILLING",
    "departmentId": "DEP-BILLING",
    "poolId": "POOL-BILLING",
    "oocContext": 0,
    "photoUrl": "",
    "providerId": "",
    "organizationId": ""
  },
  {
    "recipientType": 6,
    "pcpTypeDisplayName": "",
    "displayName": "Customer Service",
    "specialty": "Customer Service",
    "userId": "POOL-CS",
    "departmentId": "DEP-CS",
    "poolId": "POOL-CS",
    "oocContext": 0,
    "photoUrl": "",
    "providerId": "",
    "organizationId": ""
  }
]
```

</details>

<details>
<summary><code>mode: standard</code> (597 chars)</summary>

## recipients (4)

| displayName | specialty | pcpTypeDisplayName | recipientType | oocContext | userId | departmentId | poolId | providerId |
| - | - | - | - | - | - | - | - | - |
| Julius Hibbert, MD | Internal Medicine | (empty) | 1 | 0 | PROV-HIBBERT | DEP-001 | POOL-001 | PROV-HIBBERT |
| Nick Riviera, MD | General Surgery | (empty) | 1 | 0 | PROV-NICK | DEP-002 | POOL-002 | PROV-NICK |
| Billing Department | Billing | (empty) | 6 | 0 | POOL-BILLING | DEP-BILLING | POOL-BILLING | (empty) |
| Customer Service | Customer Service | (empty) | 6 | 0 | POOL-CS | DEP-CS | POOL-CS | (empty) |

</details>

<details>
<summary><code>mode: concise</code> (277 chars)</summary>

## recipients (4)

| displayName | specialty | pcpTypeDisplayName |
| - | - | - |
| Julius Hibbert, MD | Internal Medicine | (empty) |
| Nick Riviera, MD | General Surgery | (empty) |
| Billing Department | Billing | (empty) |
| Customer Service | Customer Service | (empty) |

</details>

<details>
<summary><code>mode: json</code> (862 chars)</summary>

```json
{
  "recipients": [
    {
      "displayName": "Julius Hibbert, MD",
      "specialty": "Internal Medicine",
      "pcpTypeDisplayName": "",
      "recipientType": 1,
      "oocContext": 0,
      "userId": "PROV-HIBBERT",
      "departmentId": "DEP-001",
      "poolId": "POOL-001",
      "providerId": "PROV-HIBBERT"
    },
    {
      "displayName": "Nick Riviera, MD",
      "specialty": "General Surgery",
      "pcpTypeDisplayName": "",
      "recipientType": 1,
      "oocContext": 0,
      "userId": "PROV-NICK",
      "departmentId": "DEP-002",
      "poolId": "POOL-002",
      "providerId": "PROV-NICK"
    },
    {
      "displayName": "Billing Department",
      "specialty": "Billing",
      "pcpTypeDisplayName": "",
      "recipientType": 6,
      "oocContext": 0,
      "userId": "POOL-BILLING",
      "departmentId": "DEP-BILLING",
      "poolId": "POOL-BILLING",
      "providerId": ""
    },
    {
      "displayName": "Customer Service",
      "specialty": "Customer Service",
      "pcpTypeDisplayName": "",
      "recipientType": 6,
      "oocContext": 0,
      "userId": "POOL-CS",
      "departmentId": "DEP-CS",
      "poolId": "POOL-CS",
      "providerId": ""
    }
  ]
}
```

</details>

---

### `get_message_topics`

Topics/categories a new message can be filed under.

<details>
<summary><code>mode: raw</code> (259 chars)</summary>

```json
{
  "topicList": [
    {
      "displayName": "Medical Question",
      "value": "TOPIC-001"
    },
    {
      "displayName": "Medication Refill",
      "value": "TOPIC-002"
    },
    {
      "displayName": "Appointment Request",
      "value": "TOPIC-003"
    },
    {
      "displayName": "Billing Question",
      "value": "TOPIC-004"
    }
  ],
  "organizationId": ""
}
```

</details>

<details>
<summary><code>mode: standard</code> (188 chars)</summary>

## topicList (4)

| displayName | value |
| - | - |
| Medical Question | TOPIC-001 |
| Medication Refill | TOPIC-002 |
| Appointment Request | TOPIC-003 |
| Billing Question | TOPIC-004 |

</details>

<details>
<summary><code>mode: concise</code> (188 chars)</summary>

## topicList (4)

| displayName | value |
| - | - |
| Medical Question | TOPIC-001 |
| Medication Refill | TOPIC-002 |
| Appointment Request | TOPIC-003 |
| Billing Question | TOPIC-004 |

</details>

<details>
<summary><code>mode: json</code> (239 chars)</summary>

```json
{
  "topicList": [
    {
      "displayName": "Medical Question",
      "value": "TOPIC-001"
    },
    {
      "displayName": "Medication Refill",
      "value": "TOPIC-002"
    },
    {
      "displayName": "Appointment Request",
      "value": "TOPIC-003"
    },
    {
      "displayName": "Billing Question",
      "value": "TOPIC-004"
    }
  ]
}
```

</details>

---

### `get_billing`

Billing history and account balances.

<details>
<summary><code>mode: raw</code> (40573 chars)</summary>

```json
{
  "requests": [
    {
      "path": "/Billing/Summary",
      "method": "GET",
      "status": 200,
      "contentType": "text/html; charset=utf-8",
      "body": "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n  <title>MyChart - Billing</title>\n  <style>\n* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif; background: #f0f2f5; color: #1a1a2e; }\na { color: #1a6fa5; text-decoration: none; }\na:hover { text-decoration: underline; }\n\n/* Header */\n.mc-header { background: #1a5276; color: #fff; height: 56px; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; position: fixed; top: 0; left: 0; right: 0; z-index: 100; }\n.mc-header .logo { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }\n.mc-header .logo span { color: #5dade2; }\n.mc-header .user-info { display: flex; align-items: center; gap: 16px; font-size: 14px; }\n.mc-header .user-info a { color: #aed6f1; }\n.mc-header .user-info a:hover { color: #fff; }\n\n/* Layout */\n.mc-layout { display: flex; margin-top: 56px; min-height: calc(100vh - 56px); }\n\n/* Sidebar */\n.mc-sidebar { width: 240px; background: #fff; border-right: 1px solid #dde; padding: 16px 0; position: fixed; top: 56px; bottom: 0; overflow-y: auto; }\n.mc-sidebar .nav-group { margin-bottom: 8px; }\n.mc-sidebar .nav-group-title { font-size: 11px; font-weight: 600; text-transform: uppercase; color: #888; padding: 8px 20px 4px; letter-spacing: 0.5px; }\n.mc-sidebar a { display: flex; align-items: center; gap: 10px; padding: 8px 20px; font-size: 14px; color: #333; transition: background 0.15s; }\n.mc-sidebar a:hover { background: #e8f4fd; text-decoration: none; }\n.mc-sidebar a.active { background: #d4eaf7; color: #1a5276; font-weight: 600; border-right: 3px solid #1a5276; }\n.mc-sidebar .nav-icon { width: 18px; text-align: center; font-size: 15px; }\n\n/* Main content */\n.mc-main { margin-left: 240px; flex: 1; padding: 24px 32px; min-width: 0; }\n.mc-main h1 { font-size: 24px; font-weight: 600; margin-bottom: 20px; color: #1a1a2e; }\n.mc-main h2 { font-size: 18px; font-weight: 600; margin: 20px 0 12px; color: #333; }\n\n/* Cards */\n.card { background: #fff; border-radius: 8px; border: 1px solid #e0e0e0; padding: 16px 20px; margin-bottom: 12px; }\n.card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.06); }\n.card h3 { font-size: 16px; font-weight: 600; margin-bottom: 6px; }\n.card .meta { font-size: 13px; color: #666; margin-top: 4px; }\n.card .detail { font-size: 14px; color: #444; margin-top: 4px; }\n\n/* Grid cards */\n.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-bottom: 20px; }\n.card-grid .card { margin-bottom: 0; }\n\n/* Dashboard cards */\n.dash-card { background: #fff; border-radius: 8px; border: 1px solid #e0e0e0; padding: 20px; text-align: center; }\n.dash-card .dash-icon { font-size: 32px; margin-bottom: 8px; }\n.dash-card .dash-value { font-size: 24px; font-weight: 700; color: #1a5276; }\n.dash-card .dash-label { font-size: 13px; color: #666; margin-top: 4px; }\n\n/* Badges */\n.badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }\n.badge-red { background: #fde8e8; color: #c0392b; }\n.badge-yellow { background: #fef9e7; color: #b7950b; }\n.badge-green { background: #e8f8f5; color: #1e8449; }\n.badge-blue { background: #d4eaf7; color: #1a5276; }\n.badge-gray { background: #eee; color: #666; }\n\n/* Tables */\ntable { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; border: 1px solid #e0e0e0; margin-bottom: 16px; }\nth { background: #f7f8fa; text-align: left; padding: 10px 16px; font-size: 13px; font-weight: 600; color: #555; border-bottom: 2px solid #e0e0e0; }\ntd { padding: 10px 16px; font-size: 14px; border-bottom: 1px solid #f0f0f0; }\ntr:last-child td { border-bottom: none; }\ntr:hover td { background: #fafbfc; }\n.abnormal { color: #c0392b; font-weight: 600; }\n\n/* Messages */\n.msg-list { display: flex; flex-direction: column; gap: 2px; }\n.msg-item { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 14px 20px; cursor: pointer; transition: background 0.15s; }\n.msg-item:hover { background: #f0f7fd; }\n.msg-item.unread { border-left: 4px solid #1a5276; }\n.msg-subject { font-weight: 600; font-size: 15px; }\n.msg-preview { font-size: 13px; color: #666; margin-top: 2px; }\n.msg-meta { font-size: 12px; color: #999; margin-top: 4px; }\n.msg-thread { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin-top: 16px; display: none; }\n.msg-thread.visible { display: block; }\n.msg-bubble { padding: 12px 16px; border-radius: 12px; margin-bottom: 8px; max-width: 80%; }\n.msg-bubble.provider { background: #f0f2f5; align-self: flex-start; }\n.msg-bubble.patient { background: #d4eaf7; align-self: flex-end; margin-left: auto; }\n.msg-bubble .author { font-weight: 600; font-size: 13px; margin-bottom: 4px; }\n.msg-bubble .time { font-size: 11px; color: #888; margin-top: 4px; }\n.msg-bubble .body { font-size: 14px; line-height: 1.5; }\n\n/* Tabs */\n.tabs { display: flex; gap: 0; border-bottom: 2px solid #e0e0e0; margin-bottom: 20px; }\n.tab { padding: 10px 20px; font-size: 14px; font-weight: 500; color: #666; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.15s; }\n.tab:hover { color: #1a5276; }\n.tab.active { color: #1a5276; font-weight: 600; border-bottom-color: #1a5276; }\n\n/* Loading */\n.loading { text-align: center; padding: 40px; color: #888; }\n\n/* Print header (scraper compat) */\n.proxy-switcher { position: relative; }\n.proxy-switcher > summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 8px; background: #12405e; border: 1px solid #2e6f9c; color: #fff; padding: 6px 12px; border-radius: 999px; font-size: 14px; }\n.proxy-switcher > summary::-webkit-details-marker { display: none; }\n.proxy-switcher > summary:hover { background: #17527a; }\n.proxy-switcher > summary .proxy-switcher-label { color: #aed6f1; font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; }\n.proxy-switcher > summary .proxy-switcher-caret { color: #aed6f1; font-size: 11px; }\n.proxy-switcher .proxySelectorDropDown { position: absolute; right: 0; top: calc(100% + 8px); background: #fff; border: 1px solid #dde; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.18); min-width: 260px; padding: 6px; z-index: 200; }\n.proxy-switcher .proxySubjectLink { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border-radius: 6px; color: #1a1a2e; text-decoration: none; }\n.proxy-switcher .proxySubjectLink:hover { background: #eef4f9; text-decoration: none; }\n.proxy-switcher .proxySubjectLink.currentContext { background: #e8f4fb; font-weight: 600; }\n.proxy-switcher .proxySubjectLink.currentContext::after { content: 'Viewing'; font-size: 11px; color: #1a6fa5; font-weight: 600; }\n.proxy-switcher .proxy-switcher-heading { padding: 8px 12px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; color: #888; }\n.printheader { font-size: 13px; color: #666; padding: 8px 0; margin-bottom: 16px; border-bottom: 1px solid #e0e0e0; }\n\n/* Letter detail */\n.letter-body { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px; line-height: 1.6; }\n.letter-body h2 { margin: 0 0 12px; }\n.letter-body p { margin: 8px 0; }\n\n/* Vitals chart placeholder */\n.vital-chart { display: flex; align-items: flex-end; gap: 4px; height: 60px; margin-top: 8px; }\n.vital-bar { background: #5dade2; border-radius: 3px 3px 0 0; min-width: 24px; }\n</style>\n</head>\n<body>\n  <div class='hidden' style='display:none' id='__CSRFContainer'><input name=\"__RequestVerificationToken\" type=\"hidden\" value=\"fake-csrf-token-00000000000000000000000000000000\" /></div>\n  <script>\n(function () {\n  var originalFetch = window.fetch;\n  window.fetch = function (url, opts) {\n    opts = opts || {};\n    if ((opts.method || 'GET').toUpperCase() === 'POST') {\n      var el = document.querySelector('#__CSRFContainer input[name=__RequestVerificationToken]');\n      if (el) {\n        opts.headers = opts.headers || {};\n        if (!opts.headers['__RequestVerificationToken']) {\n          opts.headers['__RequestVerificationToken'] = el.value;\n        }\n      }\n    }\n    return originalFetch.call(this, url, opts);\n  };\n})();\n</script>\n  <header class=\"mc-header\">\n    <div class=\"logo\">My<span>Chart</span></div>\n    <div class=\"user-info\">\n      <details class=\"proxy-switcher\">\n      <summary><span class=\"proxy-switcher-label\">Viewing</span><strong>Homer Jay Simpson</strong><span class=\"proxy-switcher-caret\">▾</span></summary>\n      <div class=\"proxySelectorDropDown\">\n        <div class=\"proxy-switcher-heading\">Switch patient record</div>\n        <a class=\"proxySubjectLink currentContext\" data-id=\"WP-2KQZ8XVC5MJH4RTLN9PWY7BDF3SGA6EU1KXNQZ2RVJM8HTCBW5YLDP4FGS7AKEN3QRXZ6UVJ9MTHW1C\" href=\"/MyChart/inside.asp\" aria-label=\"Access your record\"><span class=\"proxySelectorDropDownNameEllipsis\">Homer Jay Simpson</span></a>\n        <a class=\"proxySubjectLink\" data-id=\"WP-7NQK4XZC2VJH8RTLM3PWY6BDF9SGA5EU1KXNQZ7RVJM2HTCBW4YLDP8FGS3AKEN6QRXZ9UVJ5MTHW2C\" href=\"/MyChart/inside.asp?mode=proxyswitch&amp;action=switchcontext&amp;src=0&amp;eid=WP-7NQK4XZC2VJH8RTLM3PWY6BDF9SGA5EU1KXNQZ7RVJM2HTCBW4YLDP8FGS3AKEN6QRXZ9UVJ5MTHW2C\" aria-label=\"Access Bart Simpson's record\"><span class=\"proxySelectorDropDownNameEllipsis\">Bart Simpson</span></a>\n        <a class=\"proxySubjectLink\" data-id=\"WP-3MFTJ9WQ2XKVN7RBZ5HLC8PYDA4GSEU6KMWJ1QRXTV9NZBHFC2LPD7YSGA5EK3UNQXWRJ8MVTZ6HC4\" href=\"/MyChart/inside.asp?mode=proxyswitch&amp;action=switchcontext&amp;src=0&amp;eid=WP-3MFTJ9WQ2XKVN7RBZ5HLC8PYDA4GSEU6KMWJ1QRXTV9NZBHFC2LPD7YSGA5EK3UNQXWRJ8MVTZ6HC4\" aria-label=\"Access Lisa Simpson's record\"><span class=\"proxySelectorDropDownNameEllipsis\">Lisa Simpson</span></a>\n        <a class=\"proxySubjectLink\" data-id=\"WP-9XVKZ2QM7WTNJ5RBH3LFC8PYDA6GSEU4KMWJ1QRXTV2NZBHFC9LPD5YSGA7EK3UNQXWRJ4MVTZ8HC6\" href=\"/MyChart/inside.asp?mode=proxyswitch&amp;action=switchcontext&amp;src=0&amp;eid=WP-9XVKZ2QM7WTNJ5RBH3LFC8PYDA6GSEU4KMWJ1QRXTV2NZBHFC9LPD5YSGA7EK3UNQXWRJ4MVTZ8HC6\" aria-label=\"Access Maggie Simpson's record\"><span class=\"proxySelectorDropDownNameEllipsis\">Maggie Simpson</span></a>\n      </div>\n    </details>\n      <a href=\"/MyChart/Authentication/Login\">Sign out</a>\n    </div>\n  </header>\n  <div class=\"mc-layout\">\n    <nav class=\"mc-sidebar\">\n    <div class=\"nav-group\">\n      <div class=\"nav-group-title\">Overview</div>\n      \n        <a href=\"/MyChart/Home\" class=\"\">\n          <span class=\"nav-icon\">🏠</span>Home\n        </a>\n      \n        <a href=\"/MyChart/Messaging\" class=\"\">\n          <span class=\"nav-icon\">💬</span>Messages\n        </a>\n      \n        <a href=\"/MyChart/Visits\" class=\"\">\n          <span class=\"nav-icon\">📅</span>Visits\n        </a>\n      \n    </div>\n  \n    <div class=\"nav-group\">\n      <div class=\"nav-group-title\">Health</div>\n      \n        <a href=\"/MyChart/TestResults\" class=\"\">\n          <span class=\"nav-icon\">🧪</span>Test Results\n        </a>\n      \n        <a href=\"/MyChart/Clinical/Medications\" class=\"\">\n          <span class=\"nav-icon\">💊</span>Medications\n        </a>\n      \n        <a href=\"/MyChart/Clinical/Allergies\" class=\"\">\n          <span class=\"nav-icon\">⚠️</span>Allergies\n        </a>\n      \n        <a href=\"/MyChart/Clinical/HealthIssues\" class=\"\">\n          <span class=\"nav-icon\">🩺</span>Health Issues\n        </a>\n      \n        <a
… (truncated; 34874 more characters)
```

</details>

<details>
<summary><code>mode: standard</code> (4111 chars)</summary>

- **totalDue**: 350

## accounts (1)

### accounts 1

- **guarantorNumber**: 742
- **patientName**: Homer Simpson
- **amountDueNumber**: 350
- **paymentUrl**: (none)

#### visits (1)

##### visits 1

- **category**: InformationalVisitList
- **StartDateDisplay**: Jan 10, 2026
- **DateRangeDisplay**: (none)
- **Description**: Annual Physical at Springfield General Hospital
- **Patient**: Patient: Homer Simpson
- **Provider**: Provider: Julius Hibbert, MD
- **HospitalAccountDisplay**: Account #HS-742-001
- **HospitalAccountId**: HS-742-001
- **PrimaryPayer**: Primary Payer: Springfield Nuclear Employee Health Plan
- **ChargeAmount**: $500.00
- **InsurancePaymentAmount**: $0.00
- **InsuranceAmountDue**: $150.00
- **InsuranceEstimatedPaymentAmount**: (none)
- **InsuranceAmountDueRaw**: 150
- **SelfPaymentAmount**: (none)
- **SelfAmountDue**: $350.00
- **SelfAmountDueRaw**: 350
- **SelfAdjustmentAmount**: (none)
- **SelfDiscountAmount**: (none)
- **SelfBadDebtAmount**: (none)
- **SelfBadDebtAmountRaw**: 0
- **SelfPaymentPlanAmountDue**: (none)
- **SelfPaymentPlanAmountDueRaw**: 0
- **NotOnPlanAmount**: (none)
- **NotOnPlanAmountRaw**: 0
- **ContestedChargeAmount**: (none)
- **ContestedPaymentAmount**: (none)
- **SurchargeAmount**: (none)
- **TaxOrSurcharge**: (none)
- **IsPatientNotResponsible**: false
- **PatientNotResponsibleYet**: false
- **IsOnPaymentPlan**: false
- **IsNotOnPaymentPlan**: false
- **IsBadDebtHAR**: false
- **IsBadDebtVisit**: (none)
- **IsContestedHAR**: (none)
- **IsClosedHospitalAccount**: false
- **AdjustmentsOnly**: false
- **PatFriendlyAccountStatusAccessibleText**: Account status: Outstanding
- **EstimateInfo**: (none)

###### AgencyInformation

- **Name**: (none)
- **PhoneNumber**: (none)
- **AgencyInformationDescription**: (none)

###### ProcedureList (2)

| Description | Amount | SelfAmountDue | InsuranceAmountDue | IsContested | HasAmountDue | PaymentList | SelfBadDebtAmount | HasBadDebtAmount | AdjustmentsOnly | BillingSystem |
| - | - | - | - | - | - | - | - | - | - | - |
| Office Visit, Established Patient - Annual Physical | $350.00 | $350.00 | (none) | false | true | | (none) | false | false | 1 |
| Lab Work - Lipid Panel | $150.00 | $0.00 | (none) | false | false | | (none) | false | false | 1 |
- **ProcedureGroupList**: (none)
- **CoverageInfoList**: (none)

- **VisitListAmount**: (empty)
- **BadDebtVisitListAmount**: (empty)
- **PaymentPlanVisitListAmount**: (empty)
- **NotPaymentPlanVisitListAmount**: (empty)
- **AdvanceBillVisitListAmount**: (empty)
- **AdjustmentVisitListAmount**: (empty)
- **VisitAutoPayVisitListAmount**: (empty)
- **ContestedVisitListAmount**: (empty)
- **PaymentPlanVisitListAutoPayAmount**: (none)
- **PaymentPlanVisitListScheduledDate**: (none)
- **EstimatedPaymentPlanBalance**: (none)
- **PaymentPlanVisitListPostResolutionAmount**: (empty)
- **CanMakePayment**: true
- **URLMakePayment**: (none)
- **HasUnconvertedPBVisits**: false
- **HasVisits**: true

#### PartialPaymentPlanAlert

- **Code**: 0

##### Banner

- **HeaderText**: (empty)
- **DetailText**: (empty)
- **UndistributedPayments**: (none)

#### SharedAgencyInformation

- **Name**: (empty)
- **PhoneNumber**: (empty)

#### statements (1)

| FormattedDateDisplay | DateDisplay | Description | SubText | StatementAmountDisplay | IsRead | IsDetailBill | IsPaperless | ServiceDateStart | ServiceDateEnd | RecordID |
| - | - | - | - | - | - | - | - | - | - | - |
| Jan 15, 2026 | 20260115 | Sent via postal mail | (empty) | $350.00 | false | false | false | (none) | (none) | HOMER-REC-001 |

#### payments (2)

##### payments 1

- **FormattedDateDisplay**: Jan 20, 2026
- **Description**: MyChart Payment
- **SubText**: (none)
- **PaymentAmountDisplay**: $350.00
- **UndistributedAmountDisplay**: (none)

###### Receipt

- **DisplayNumber**: (empty)
- **SerialNumber**: (empty)

##### payments 2

- **FormattedDateDisplay**: Dec 5, 2025
- **Description**: MyChart Payment
- **SubText**: (none)
- **PaymentAmountDisplay**: $150.00
- **UndistributedAmountDisplay**: (none)

###### Receipt

- **DisplayNumber**: (empty)
- **SerialNumber**: (empty)

</details>

<details>
<summary><code>mode: concise</code> (1025 chars)</summary>

- **totalDue**: 350

## accounts (1)

### accounts 1

- **guarantorNumber**: 742
- **patientName**: Homer Simpson
- **amountDueNumber**: 350

#### visits (1)

| StartDateDisplay | DateRangeDisplay | Description | Patient | Provider | PrimaryPayer | ChargeAmount | InsurancePaymentAmount | InsuranceAmountDue | SelfPaymentAmount | SelfAmountDue | category |
| - | - | - | - | - | - | - | - | - | - | - | - |
| Jan 10, 2026 | (none) | Annual Physical at Springfield General Hospital | Patient: Homer Simpson | Provider: Julius Hibbert, MD | Primary Payer: Springfield Nuclear Employee Health Plan | $500.00 | $0.00 | $150.00 | (none) | $350.00 | InformationalVisitList |

#### statements (1)

| FormattedDateDisplay | Description | StatementAmountDisplay | IsRead |
| - | - | - | - |
| Jan 15, 2026 | Sent via postal mail | $350.00 | false |

#### payments (2)

| FormattedDateDisplay | Description | PaymentAmountDisplay |
| - | - | - |
| Jan 20, 2026 | MyChart Payment | $350.00 |
| Dec 5, 2025 | MyChart Payment | $150.00 |

</details>

<details>
<summary><code>mode: json</code> (3476 chars)</summary>

```json
{
  "totalDue": 350,
  "accounts": [
    {
      "guarantorNumber": "742",
      "patientName": "Homer Simpson",
      "amountDueNumber": 350,
      "paymentUrl": null,
      "visits": [
        {
          "category": "InformationalVisitList",
          "StartDateDisplay": "Jan 10, 2026",
          "DateRangeDisplay": null,
          "Description": "Annual Physical at Springfield General Hospital",
          "Patient": "Patient: Homer Simpson",
          "Provider": "Provider: Julius Hibbert, MD",
          "HospitalAccountDisplay": "Account #HS-742-001",
          "HospitalAccountId": "HS-742-001",
          "PrimaryPayer": "Primary Payer: Springfield Nuclear Employee Health Plan",
          "ChargeAmount": "$500.00",
          "InsurancePaymentAmount": "$0.00",
          "InsuranceAmountDue": "$150.00",
          "InsuranceEstimatedPaymentAmount": null,
          "InsuranceAmountDueRaw": 150,
          "SelfPaymentAmount": null,
          "SelfAmountDue": "$350.00",
          "SelfAmountDueRaw": 350,
          "SelfAdjustmentAmount": null,
          "SelfDiscountAmount": null,
          "SelfBadDebtAmount": null,
          "SelfBadDebtAmountRaw": 0,
          "SelfPaymentPlanAmountDue": null,
          "SelfPaymentPlanAmountDueRaw": 0,
          "NotOnPlanAmount": null,
          "NotOnPlanAmountRaw": 0,
          "ContestedChargeAmount": null,
          "ContestedPaymentAmount": null,
          "SurchargeAmount": null,
          "TaxOrSurcharge": null,
          "IsPatientNotResponsible": false,
          "PatientNotResponsibleYet": false,
          "IsOnPaymentPlan": false,
          "IsNotOnPaymentPlan": false,
          "IsBadDebtHAR": false,
          "IsBadDebtVisit": null,
          "IsContestedHAR": null,
          "IsClosedHospitalAccount": false,
          "AdjustmentsOnly": false,
          "PatFriendlyAccountStatusAccessibleText": "Account status: Outstanding",
          "EstimateInfo": null,
          "AgencyInformation": {
            "Name": null,
            "PhoneNumber": null
          },
          "AgencyInformationDescription": null,
          "ProcedureList": [
            {
              "Description": "Office Visit, Established Patient - Annual Physical",
              "Amount": "$350.00",
              "SelfAmountDue": "$350.00",
              "InsuranceAmountDue": null,
              "IsContested": false,
              "HasAmountDue": true,
              "PaymentList": [],
              "SelfBadDebtAmount": null,
              "HasBadDebtAmount": false,
              "AdjustmentsOnly": false,
              "BillingSystem": 1
            },
            {
              "Description": "Lab Work - Lipid Panel",
              "Amount": "$150.00",
              "SelfAmountDue": "$0.00",
              "InsuranceAmountDue": null,
              "IsContested": false,
              "HasAmountDue": false,
              "PaymentList": [],
              "SelfBadDebtAmount": null,
              "HasBadDebtAmount": false,
              "AdjustmentsOnly": false,
              "BillingSystem": 1
            }
          ],
          "ProcedureGroupList": [],
          "CoverageInfoList": []
        }
      ],
      "VisitListAmount": "",
      "BadDebtVisitListAmount": "",
      "PaymentPlanVisitListAmount": "",
      "NotPaymentPlanVisitListAmount": "",
      "AdvanceBillVisitListAmount": "",
      "AdjustmentVisitListAmount": "",
      "VisitAutoPayVisitListAmount": "",
      "ContestedVisitListAmount": "",
      "PaymentPlanVisitListAutoPayAmount": null,
      "PaymentPlanVisitListScheduledDate": null,
      "EstimatedPaymentPlanBalance": null,
      "PaymentPlanVisitListPostResolutionAmount": "",
      "CanMakePayment": true,
      "URLMakePayment": null,
      "HasUnconvertedPBVisits": false,
      "HasVisits": true,
      "PartialPaymentPlanAlert": {
        "Code": 0,
        "Banner": {
          "HeaderText": "",
          "DetailText": ""
        }
      },
      "UndistributedPayments": [],
      "SharedAgencyInformation": {
        "Name": "",
        "PhoneNumber": ""
      },
      "statements": [
        {
          "FormattedDateDisplay": "Jan 15, 2026",
          "DateDisplay": "20260115",
          "Description": "Sent via postal mail",
          "SubText": "",
          "StatementAmountDisplay": "$350.00",
          "IsRead": false,
          "IsDetailBill": false,
          "IsPaperless": false,
          "ServiceDateStart": null,
          "ServiceDateEnd": null,
          "RecordID": "HOMER-REC-001"
        }
      ],
      "payments": [
        {
          "FormattedDateDisplay": "Jan 20, 2026",
          "Description": "MyChart Payment",
          "SubText": null,
          "PaymentAmountDisplay": "$350.00",
          "UndistributedAmountDisplay": null,
          "Receipt": {
            "DisplayNumber": "",
            "SerialNumber": ""
          }
        },
        {
          "FormattedDateDisplay": "Dec 5, 2025",
          "Description": "MyChart Payment",
          "SubText": null,
          "PaymentAmountDisplay": "$150.00",
          "UndistributedAmountDisplay": null,
          "Receipt": {
            "DisplayNumber": "",
            "SerialNumber": ""
          }
        }
      ]
    }
  ]
}
```

</details>

---

### `get_insurance`

Insurance coverages on file.

<details>
<summary><code>mode: raw</code> (14195 chars)</summary>

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MyChart - Insurance</title>
  <style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif; background: #f0f2f5; color: #1a1a2e; }
a { color: #1a6fa5; text-decoration: none; }
a:hover { text-decoration: underline; }

/* Header */
.mc-header { background: #1a5276; color: #fff; height: 56px; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; position: fixed; top: 0; left: 0; right: 0; z-index: 100; }
.mc-header .logo { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
.mc-header .logo span { color: #5dade2; }
.mc-header .user-info { display: flex; align-items: center; gap: 16px; font-size: 14px; }
.mc-header .user-info a { color: #aed6f1; }
.mc-header .user-info a:hover { color: #fff; }

/* Layout */
.mc-layout { display: flex; margin-top: 56px; min-height: calc(100vh - 56px); }

/* Sidebar */
.mc-sidebar { width: 240px; background: #fff; border-right: 1px solid #dde; padding: 16px 0; position: fixed; top: 56px; bottom: 0; overflow-y: auto; }
.mc-sidebar .nav-group { margin-bottom: 8px; }
.mc-sidebar .nav-group-title { font-size: 11px; font-weight: 600; text-transform: uppercase; color: #888; padding: 8px 20px 4px; letter-spacing: 0.5px; }
.mc-sidebar a { display: flex; align-items: center; gap: 10px; padding: 8px 20px; font-size: 14px; color: #333; transition: background 0.15s; }
.mc-sidebar a:hover { background: #e8f4fd; text-decoration: none; }
.mc-sidebar a.active { background: #d4eaf7; color: #1a5276; font-weight: 600; border-right: 3px solid #1a5276; }
.mc-sidebar .nav-icon { width: 18px; text-align: center; font-size: 15px; }

/* Main content */
.mc-main { margin-left: 240px; flex: 1; padding: 24px 32px; min-width: 0; }
.mc-main h1 { font-size: 24px; font-weight: 600; margin-bottom: 20px; color: #1a1a2e; }
.mc-main h2 { font-size: 18px; font-weight: 600; margin: 20px 0 12px; color: #333; }

/* Cards */
.card { background: #fff; border-radius: 8px; border: 1px solid #e0e0e0; padding: 16px 20px; margin-bottom: 12px; }
.card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.card h3 { font-size: 16px; font-weight: 600; margin-bottom: 6px; }
.card .meta { font-size: 13px; color: #666; margin-top: 4px; }
.card .detail { font-size: 14px; color: #444; margin-top: 4px; }

/* Grid cards */
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-bottom: 20px; }
.card-grid .card { margin-bottom: 0; }

/* Dashboard cards */
.dash-card { background: #fff; border-radius: 8px; border: 1px solid #e0e0e0; padding: 20px; text-align: center; }
.dash-card .dash-icon { font-size: 32px; margin-bottom: 8px; }
.dash-card .dash-value { font-size: 24px; font-weight: 700; color: #1a5276; }
.dash-card .dash-label { font-size: 13px; color: #666; margin-top: 4px; }

/* Badges */
.badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }
.badge-red { background: #fde8e8; color: #c0392b; }
.badge-yellow { background: #fef9e7; color: #b7950b; }
.badge-green { background: #e8f8f5; color: #1e8449; }
.badge-blue { background: #d4eaf7; color: #1a5276; }
.badge-gray { background: #eee; color: #666; }

/* Tables */
table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; border: 1px solid #e0e0e0; margin-bottom: 16px; }
th { background: #f7f8fa; text-align: left; padding: 10px 16px; font-size: 13px; font-weight: 600; color: #555; border-bottom: 2px solid #e0e0e0; }
td { padding: 10px 16px; font-size: 14px; border-bottom: 1px solid #f0f0f0; }
tr:last-child td { border-bottom: none; }
tr:hover td { background: #fafbfc; }
.abnormal { color: #c0392b; font-weight: 600; }

/* Messages */
.msg-list { display: flex; flex-direction: column; gap: 2px; }
.msg-item { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 14px 20px; cursor: pointer; transition: background 0.15s; }
.msg-item:hover { background: #f0f7fd; }
.msg-item.unread { border-left: 4px solid #1a5276; }
.msg-subject { font-weight: 600; font-size: 15px; }
.msg-preview { font-size: 13px; color: #666; margin-top: 2px; }
.msg-meta { font-size: 12px; color: #999; margin-top: 4px; }
.msg-thread { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin-top: 16px; display: none; }
.msg-thread.visible { display: block; }
.msg-bubble { padding: 12px 16px; border-radius: 12px; margin-bottom: 8px; max-width: 80%; }
.msg-bubble.provider { background: #f0f2f5; align-self: flex-start; }
.msg-bubble.patient { background: #d4eaf7; align-self: flex-end; margin-left: auto; }
.msg-bubble .author { font-weight: 600; font-size: 13px; margin-bottom: 4px; }
.msg-bubble .time { font-size: 11px; color: #888; margin-top: 4px; }
.msg-bubble .body { font-size: 14px; line-height: 1.5; }

/* Tabs */
.tabs { display: flex; gap: 0; border-bottom: 2px solid #e0e0e0; margin-bottom: 20px; }
.tab { padding: 10px 20px; font-size: 14px; font-weight: 500; color: #666; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.15s; }
.tab:hover { color: #1a5276; }
.tab.active { color: #1a5276; font-weight: 600; border-bottom-color: #1a5276; }

/* Loading */
.loading { text-align: center; padding: 40px; color: #888; }

/* Print header (scraper compat) */
.proxy-switcher { position: relative; }
.proxy-switcher > summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 8px; background: #12405e; border: 1px solid #2e6f9c; color: #fff; padding: 6px 12px; border-radius: 999px; font-size: 14px; }
.proxy-switcher > summary::-webkit-details-marker { display: none; }
.proxy-switcher > summary:hover { background: #17527a; }
.proxy-switcher > summary .proxy-switcher-label { color: #aed6f1; font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; }
.proxy-switcher > summary .proxy-switcher-caret { color: #aed6f1; font-size: 11px; }
.proxy-switcher .proxySelectorDropDown { position: absolute; right: 0; top: calc(100% + 8px); background: #fff; border: 1px solid #dde; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.18); min-width: 260px; padding: 6px; z-index: 200; }
.proxy-switcher .proxySubjectLink { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border-radius: 6px; color: #1a1a2e; text-decoration: none; }
.proxy-switcher .proxySubjectLink:hover { background: #eef4f9; text-decoration: none; }
.proxy-switcher .proxySubjectLink.currentContext { background: #e8f4fb; font-weight: 600; }
.proxy-switcher .proxySubjectLink.currentContext::after { content: 'Viewing'; font-size: 11px; color: #1a6fa5; font-weight: 600; }
.proxy-switcher .proxy-switcher-heading { padding: 8px 12px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; color: #888; }
.printheader { font-size: 13px; color: #666; padding: 8px 0; margin-bottom: 16px; border-bottom: 1px solid #e0e0e0; }

/* Letter detail */
.letter-body { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px; line-height: 1.6; }
.letter-body h2 { margin: 0 0 12px; }
.letter-body p { margin: 8px 0; }

/* Vitals chart placeholder */
.vital-chart { display: flex; align-items: flex-end; gap: 4px; height: 60px; margin-top: 8px; }
.vital-bar { background: #5dade2; border-radius: 3px 3px 0 0; min-width: 24px; }
</style>
</head>
<body>
  <div class='hidden' style='display:none' id='__CSRFContainer'><input name="__RequestVerificationToken" type="hidden" value="fake-csrf-token-00000000000000000000000000000000" /></div>
  <script>
(function () {
  var originalFetch = window.fetch;
  window.fetch = function (url, opts) {
    opts = opts || {};
    if ((opts.method || 'GET').toUpperCase() === 'POST') {
      var el = document.querySelector('#__CSRFContainer input[name=__RequestVerificationToken]');
      if (el) {
        opts.headers = opts.headers || {};
        if (!opts.headers['__RequestVerificationToken']) {
          opts.headers['__RequestVerificationToken'] = el.value;
        }
      }
    }
    return originalFetch.call(this, url, opts);
  };
})();
</script>
  <header class="mc-header">
    <div class="logo">My<span>Chart</span></div>
    <div class="user-info">
      <details class="proxy-switcher">
      <summary><span class="proxy-switcher-label">Viewing</span><strong>Homer Jay Simpson</strong><span class="proxy-switcher-caret">▾</span></summary>
      <div class="proxySelectorDropDown">
        <div class="proxy-switcher-heading">Switch patient record</div>
        <a class="proxySubjectLink currentContext" data-id="WP-2KQZ8XVC5MJH4RTLN9PWY7BDF3SGA6EU1KXNQZ2RVJM8HTCBW5YLDP4FGS7AKEN3QRXZ6UVJ9MTHW1C" href="/MyChart/inside.asp" aria-label="Access your record"><span class="proxySelectorDropDownNameEllipsis">Homer Jay Simpson</span></a>
        <a class="proxySubjectLink" data-id="WP-7NQK4XZC2VJH8RTLM3PWY6BDF9SGA5EU1KXNQZ7RVJM2HTCBW4YLDP8FGS3AKEN6QRXZ9UVJ5MTHW2C" href="/MyChart/inside.asp?mode=proxyswitch&amp;action=switchcontext&amp;src=0&amp;eid=WP-7NQK4XZC2VJH8RTLM3PWY6BDF9SGA5EU1KXNQZ7RVJM2HTCBW4YLDP8FGS3AKEN6QRXZ9UVJ5MTHW2C" aria-label="Access Bart Simpson's record"><span class="proxySelectorDropDownNameEllipsis">Bart Simpson</span></a>
        <a class="proxySubjectLink" data-id="WP-3MFTJ9WQ2XKVN7RBZ5HLC8PYDA4GSEU6KMWJ1QRXTV9NZBHFC2LPD7YSGA5EK3UNQXWRJ8MVTZ6HC4" href="/MyChart/inside.asp?mode=proxyswitch&amp;action=switchcontext&amp;src=0&amp;eid=WP-3MFTJ9WQ2XKVN7RBZ5HLC8PYDA4GSEU6KMWJ1QRXTV9NZBHFC2LPD7YSGA5EK3UNQXWRJ8MVTZ6HC4" aria-label="Access Lisa Simpson's record"><span class="proxySelectorDropDownNameEllipsis">Lisa Simpson</span></a>
        <a class="proxySubjectLink" data-id="WP-9XVKZ2QM7WTNJ5RBH3LFC8PYDA6GSEU4KMWJ1QRXTV2NZBHFC9LPD5YSGA7EK3UNQXWRJ4MVTZ8HC6" href="/MyChart/inside.asp?mode=proxyswitch&amp;action=switchcontext&amp;src=0&amp;eid=WP-9XVKZ2QM7WTNJ5RBH3LFC8PYDA6GSEU4KMWJ1QRXTV2NZBHFC9LPD5YSGA7EK3UNQXWRJ4MVTZ8HC6" aria-label="Access Maggie Simpson's record"><span class="proxySelectorDropDownNameEllipsis">Maggie Simpson</span></a>
      </div>
    </details>
      <a href="/MyChart/Authentication/Login">Sign out</a>
    </div>
  </header>
  <div class="mc-layout">
    <nav class="mc-sidebar">
    <div class="nav-group">
      <div class="nav-group-title">Overview</div>
      
        <a href="/MyChart/Home" class="">
          <span class="nav-icon">🏠</span>Home
        </a>
      
        <a href="/MyChart/Messaging" class="">
          <span class="nav-icon">💬</span>Messages
        </a>
      
        <a href="/MyChart/Visits" class="">
          <span class="nav-icon">📅</span>Visits
        </a>
      
    </div>
  
    <div class="nav-group">
      <div class="nav-group-title">Health</div>
      
        <a href="/MyChart/TestResults" class="">
          <span class="nav-icon">🧪</span>Test Results
        </a>
      
        <a href="/MyChart/Clinical/Medications" class="">
          <span class="nav-icon">💊</span>Medications
        </a>
      
        <a href="/MyChart/Clinical/Allergies" class="">
          <span class="nav-icon">⚠️</span>Allergies
        </a>
      
        <a href="/MyChart/Clinical/HealthIssues" class="">
          <span class="nav-icon">🩺</span>Health Issues
        </a>
      
        <a href="/MyChart/Clinical/Immunizations" class="">
          <span class="nav-icon">💉</span>Immunizations
        </a>
      
        <a href="/MyChart/TrackMyHealth" class="">
          <span class="nav-icon">📊</span>Vitals
        </a>
      
        <a href="/MyChart/MedicalHistory" class="">
          <span class="nav-icon">📋</span>Medical History
        </a>
      
    </div>
  
    <div class="nav-group">
      <div class="nav-group-title">Care</div>
      
        <a href="/MyChart/Clinical/CareTeam" class="">
          <span class="nav-icon">👨‍⚕️</span>Care Team
        </a>
      
        <a href="/MyChart/Goals" class="">
          <span class="nav-icon">🎯</span>Goals
        </a>
      
        <a href="/MyChart/Referrals" class="">
          <span class="nav-icon">🔀</span>Referrals
        </a>
      
        <a href="/MyChart/HealthAdvisories" class="">
          <span class="nav-icon">✅</span>Preventive Care
        </a>
      
        <a href="/MyChart/CareJourneys" class="">
          <span class="nav-icon">🛤️</span>Care Journeys
        </a>
      
    </div>
  
    <div class="nav-group">
      <div class="nav-group-title">Records</div>
      
        <a href="/MyChart/Letters" class="">
          <span class="nav-icon">✉️</span>Letters
        </a>
      
        <a href="/MyChart/Documents" class="">
          <span class="nav-icon">📄</span>Documents
        </a>
      
        <a href="/MyChart/Education" class="">
          <span class="nav-icon">📚</span>Education
        </a>
      
    </div>
  
    <div class="nav-group">
      <div class="nav-group-title">Account</div>
      
        <a href="/MyChart/Billing/Summary" class="">
          <span class="nav-icon">💳</span>Billing
        </a>
      
        <a href="/MyChart/Insurance" class="active">
          <span class="nav-icon">🛡️</span>Insurance
        </a>
      
        <a href="/MyChart/PersonalInformation" class="">
          <span class="nav-icon">👤</span>Profile
        </a>
      
        <a href="/MyChart/EmergencyContacts" class="">
          <span class="nav-icon">📞</span>Emergency Contacts
        </a>
      
        <a href="/MyChart/Settings" class="">
          <span class="nav-icon">⚙️</span>Settings
        </a>
      
    </div>
  </nav>
    <main class="mc-main"><h1>Insurance</h1>
    <div class="card coverage-card">
      <h3>Springfield Nuclear Power Plant Employee Health Plan</h3>
      <div class="detail subscriber-name">Subscriber: Homer Jay Simpson</div>
      <div class="meta member-id">Member ID: HSJ-12345</div>
      <div class="meta group-number">Group: SNPP-742</div>
    </div>
  </main>
  </div>
</body>
</html>

</details>

<details>
<summary><code>mode: standard</code> (292 chars)</summary>

## coverages (1)

| planName | subscriberName | memberId | groupNumber | details |
| - | - | - | - | - |
| Springfield Nuclear Power Plant Employee Health Plan | Subscriber: Homer Jay Simpson | Member ID: HSJ-12345 | Group: SNPP-742 | Subscriber: Homer Jay Simpson |
- **hasCoverages**: true

</details>

<details>
<summary><code>mode: concise</code> (193 chars)</summary>

## coverages (1)

| planName | memberId | groupNumber |
| - | - | - |
| Springfield Nuclear Power Plant Employee Health Plan | Member ID: HSJ-12345 | Group: SNPP-742 |
- **hasCoverages**: true

</details>

<details>
<summary><code>mode: json</code> (262 chars)</summary>

```json
{
  "coverages": [
    {
      "planName": "Springfield Nuclear Power Plant Employee Health Plan",
      "subscriberName": "Subscriber: Homer Jay Simpson",
      "memberId": "Member ID: HSJ-12345",
      "groupNumber": "Group: SNPP-742",
      "details": [
        "Subscriber: Homer Jay Simpson"
      ]
    }
  ],
  "hasCoverages": true
}
```

</details>

---

### `get_insurance_payers`

The insurance payers this organization's MyChart offers when adding a coverage — the organization's configured payer catalogue, the same for every patient on the instance. Not the patient's own coverage (that is get_insurance) and not an in-network guarantee.

<details>
<summary><code>mode: raw</code> (1613 chars)</summary>

```json
{
  "Payors": [
    {
      "Fields": {
        "MemberId": 2,
        "SubscriberDateOfBirth": 1,
        "SubscriberFirstName": 2,
        "SubscriberId": 1,
        "SubscriberLastName": 2
      },
      "SampleCardImages": [],
      "CanUpload": true,
      "IsNonConfiguredPayer": false,
      "SortKey": null,
      "ID": "WP-24Q7mK2vX9cL4nR8tB1wZ5yP3-3D-3D-24hG6jD0sF7aM2kN9pV4rT8uW1xC3eY5bL7q-3D",
      "Name": "Springfield Mutual Health",
      "NameUTF8": null
    },
    {
      "Fields": {
        "MemberId": 2,
        "SubscriberDateOfBirth": 1,
        "SubscriberFirstName": 2,
        "SubscriberId": 1,
        "SubscriberLastName": 2
      },
      "SampleCardImages": [],
      "CanUpload": true,
      "IsNonConfiguredPayer": false,
      "SortKey": null,
      "ID": "WP-24Z3nW8bK1vT6yC9mQ2xL5pR7-3D-3D-24sD4fH0jG8aN3kM6pB1rV9uX2wE5cY7tL0q-3D",
      "Name": "Springfield Mutual Health - Medicare Advantage",
      "NameUTF8": null
    },
    {
      "Fields": {
        "GroupNumber": 1,
        "MemberId": 2,
        "SubscriberDateOfBirth": 1,
        "SubscriberFirstName": 2,
        "SubscriberId": 1,
        "SubscriberLastName": 2
      },
      "SampleCardImages": [],
      "CanUpload": true,
      "IsNonConfiguredPayer": false,
      "SortKey": null,
      "ID": "WP-24L5pR9cX2vB7nK4mT1wQ8yZ3-3D-3D-24aF6hJ0gD9sM4kN7pV2rB5uW8xC1eY3tL6q-3D",
      "Name": "Shelbyville Blue Cross",
      "NameUTF8": null
    },
    {
      "Fields": {
        "MemberId": 2
      },
      "SampleCardImages": [],
      "CanUpload": true,
      "IsNonConfiguredPayer": false,
      "SortKey": null,
      "ID": "WP-24B8yT3nQ6vK1cX9mR4wL7pZ2-3D-3D-24jH5gF0dS8aM3kN6pV1rB4uW7xC0eY2tL5q-3D",
      "Name": "Medicare",
      "NameUTF8": null
    },
    {
      "Fields": {
        "MemberId": 2,
        "SubscriberDateOfBirth": 1,
        "SubscriberFirstName": 2,
        "SubscriberId": 1,
        "SubscriberLastName": 2
      },
      "SampleCardImages": [],
      "CanUpload": true,
      "IsNonConfiguredPayer": false,
      "SortKey": null,
      "ID": "WP-24X2vB6nK9cQ4mT7wR1yL8pZ5-3D-3D-24dS3fH0gJ7aM2kN5pV8rB1uW4xC9eY6tL3q-3D",
      "Name": "Globex Corporation Employee Health Plan",
      "NameUTF8": null
    }
  ]
}
```

</details>

<details>
<summary><code>mode: standard</code> (2213 chars)</summary>

## Payors (5)

### Payors 1

- **ID**: WP-24Q7mK2vX9cL4nR8tB1wZ5yP3-3D-3D-24hG6jD0sF7aM2kN9pV4rT8uW1xC3eY5bL7q-3D
- **Name**: Springfield Mutual Health

#### Fields

- **MemberId**: 2
- **SubscriberDateOfBirth**: 1
- **SubscriberFirstName**: 2
- **SubscriberId**: 1
- **SubscriberLastName**: 2
- **requiredFields**: MemberId, SubscriberFirstName, SubscriberLastName
- **optionalFields**: SubscriberDateOfBirth, SubscriberId
- **CanUpload**: true
- **IsNonConfiguredPayer**: false

### Payors 2

- **ID**: WP-24Z3nW8bK1vT6yC9mQ2xL5pR7-3D-3D-24sD4fH0jG8aN3kM6pB1rV9uX2wE5cY7tL0q-3D
- **Name**: Springfield Mutual Health - Medicare Advantage

#### Fields

- **MemberId**: 2
- **SubscriberDateOfBirth**: 1
- **SubscriberFirstName**: 2
- **SubscriberId**: 1
- **SubscriberLastName**: 2
- **requiredFields**: MemberId, SubscriberFirstName, SubscriberLastName
- **optionalFields**: SubscriberDateOfBirth, SubscriberId
- **CanUpload**: true
- **IsNonConfiguredPayer**: false

### Payors 3

- **ID**: WP-24L5pR9cX2vB7nK4mT1wQ8yZ3-3D-3D-24aF6hJ0gD9sM4kN7pV2rB5uW8xC1eY3tL6q-3D
- **Name**: Shelbyville Blue Cross

#### Fields

- **GroupNumber**: 1
- **MemberId**: 2
- **SubscriberDateOfBirth**: 1
- **SubscriberFirstName**: 2
- **SubscriberId**: 1
- **SubscriberLastName**: 2
- **requiredFields**: MemberId, SubscriberFirstName, SubscriberLastName
- **optionalFields**: GroupNumber, SubscriberDateOfBirth, SubscriberId
- **CanUpload**: true
- **IsNonConfiguredPayer**: false

### Payors 4

- **ID**: WP-24B8yT3nQ6vK1cX9mR4wL7pZ2-3D-3D-24jH5gF0dS8aM3kN6pV1rB4uW7xC0eY2tL5q-3D
- **Name**: Medicare

#### Fields

- **MemberId**: 2
- **requiredFields**: MemberId
- **optionalFields**: (none)
- **CanUpload**: true
- **IsNonConfiguredPayer**: false

### Payors 5

- **ID**: WP-24X2vB6nK9cQ4mT7wR1yL8pZ5-3D-3D-24dS3fH0gJ7aM2kN5pV8rB1uW4xC9eY6tL3q-3D
- **Name**: Globex Corporation Employee Health Plan

#### Fields

- **MemberId**: 2
- **SubscriberDateOfBirth**: 1
- **SubscriberFirstName**: 2
- **SubscriberId**: 1
- **SubscriberLastName**: 2
- **requiredFields**: MemberId, SubscriberFirstName, SubscriberLastName
- **optionalFields**: SubscriberDateOfBirth, SubscriberId
- **CanUpload**: true
- **IsNonConfiguredPayer**: false

</details>

<details>
<summary><code>mode: concise</code> (502 chars)</summary>

## Payors (5)

| Name | requiredFields | IsNonConfiguredPayer |
| - | - | - |
| Springfield Mutual Health | MemberId, SubscriberFirstName, SubscriberLastName | false |
| Springfield Mutual Health - Medicare Advantage | MemberId, SubscriberFirstName, SubscriberLastName | false |
| Shelbyville Blue Cross | MemberId, SubscriberFirstName, SubscriberLastName | false |
| Medicare | MemberId | false |
| Globex Corporation Employee Health Plan | MemberId, SubscriberFirstName, SubscriberLastName | false |

</details>

<details>
<summary><code>mode: json</code> (1936 chars)</summary>

```json
{
  "Payors": [
    {
      "ID": "WP-24Q7mK2vX9cL4nR8tB1wZ5yP3-3D-3D-24hG6jD0sF7aM2kN9pV4rT8uW1xC3eY5bL7q-3D",
      "Name": "Springfield Mutual Health",
      "Fields": {
        "MemberId": 2,
        "SubscriberDateOfBirth": 1,
        "SubscriberFirstName": 2,
        "SubscriberId": 1,
        "SubscriberLastName": 2
      },
      "requiredFields": [
        "MemberId",
        "SubscriberFirstName",
        "SubscriberLastName"
      ],
      "optionalFields": [
        "SubscriberDateOfBirth",
        "SubscriberId"
      ],
      "CanUpload": true,
      "IsNonConfiguredPayer": false
    },
    {
      "ID": "WP-24Z3nW8bK1vT6yC9mQ2xL5pR7-3D-3D-24sD4fH0jG8aN3kM6pB1rV9uX2wE5cY7tL0q-3D",
      "Name": "Springfield Mutual Health - Medicare Advantage",
      "Fields": {
        "MemberId": 2,
        "SubscriberDateOfBirth": 1,
        "SubscriberFirstName": 2,
        "SubscriberId": 1,
        "SubscriberLastName": 2
      },
      "requiredFields": [
        "MemberId",
        "SubscriberFirstName",
        "SubscriberLastName"
      ],
      "optionalFields": [
        "SubscriberDateOfBirth",
        "SubscriberId"
      ],
      "CanUpload": true,
      "IsNonConfiguredPayer": false
    },
    {
      "ID": "WP-24L5pR9cX2vB7nK4mT1wQ8yZ3-3D-3D-24aF6hJ0gD9sM4kN7pV2rB5uW8xC1eY3tL6q-3D",
      "Name": "Shelbyville Blue Cross",
      "Fields": {
        "GroupNumber": 1,
        "MemberId": 2,
        "SubscriberDateOfBirth": 1,
        "SubscriberFirstName": 2,
        "SubscriberId": 1,
        "SubscriberLastName": 2
      },
      "requiredFields": [
        "MemberId",
        "SubscriberFirstName",
        "SubscriberLastName"
      ],
      "optionalFields": [
        "GroupNumber",
        "SubscriberDateOfBirth",
        "SubscriberId"
      ],
      "CanUpload": true,
      "IsNonConfiguredPayer": false
    },
    {
      "ID": "WP-24B8yT3nQ6vK1cX9mR4wL7pZ2-3D-3D-24jH5gF0dS8aM3kN6pV1rB4uW7xC0eY2tL5q-3D",
      "Name": "Medicare",
      "Fields": {
        "MemberId": 2
      },
      "requiredFields": [
        "MemberId"
      ],
      "optionalFields": [],
      "CanUpload": true,
      "IsNonConfiguredPayer": false
    },
    {
      "ID": "WP-24X2vB6nK9cQ4mT7wR1yL8pZ5-3D-3D-24dS3fH0gJ7aM2kN5pV8rB1uW4xC9eY6tL3q-3D",
      "Name": "Globex Corporation Employee Health Plan",
      "Fields": {
        "MemberId": 2,
        "SubscriberDateOfBirth": 1,
        "SubscriberFirstName": 2,
        "SubscriberId": 1,
        "SubscriberLastName": 2
      },
      "requiredFields": [
        "MemberId",
        "SubscriberFirstName",
        "SubscriberLastName"
      ],
      "optionalFields": [
        "SubscriberDateOfBirth",
        "SubscriberId"
      ],
      "CanUpload": true,
      "IsNonConfiguredPayer": false
    }
  ]
}
```

</details>

---

### `get_care_team`

Providers on the care team, including outside providers, each with their role and specialty.

<details>
<summary><code>mode: raw</code> (19281 chars)</summary>

```json
{
  "requests": [
    {
      "path": "/Clinical/CareTeam",
      "method": "GET",
      "status": 200,
      "contentType": "text/html; charset=utf-8",
      "body": "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"utf-8\" />\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n  <title>MyChart - Care Team</title>\n  <style>\n* { margin: 0; padding: 0; box-sizing: border-box; }\nbody { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, sans-serif; background: #f0f2f5; color: #1a1a2e; }\na { color: #1a6fa5; text-decoration: none; }\na:hover { text-decoration: underline; }\n\n/* Header */\n.mc-header { background: #1a5276; color: #fff; height: 56px; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; position: fixed; top: 0; left: 0; right: 0; z-index: 100; }\n.mc-header .logo { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }\n.mc-header .logo span { color: #5dade2; }\n.mc-header .user-info { display: flex; align-items: center; gap: 16px; font-size: 14px; }\n.mc-header .user-info a { color: #aed6f1; }\n.mc-header .user-info a:hover { color: #fff; }\n\n/* Layout */\n.mc-layout { display: flex; margin-top: 56px; min-height: calc(100vh - 56px); }\n\n/* Sidebar */\n.mc-sidebar { width: 240px; background: #fff; border-right: 1px solid #dde; padding: 16px 0; position: fixed; top: 56px; bottom: 0; overflow-y: auto; }\n.mc-sidebar .nav-group { margin-bottom: 8px; }\n.mc-sidebar .nav-group-title { font-size: 11px; font-weight: 600; text-transform: uppercase; color: #888; padding: 8px 20px 4px; letter-spacing: 0.5px; }\n.mc-sidebar a { display: flex; align-items: center; gap: 10px; padding: 8px 20px; font-size: 14px; color: #333; transition: background 0.15s; }\n.mc-sidebar a:hover { background: #e8f4fd; text-decoration: none; }\n.mc-sidebar a.active { background: #d4eaf7; color: #1a5276; font-weight: 600; border-right: 3px solid #1a5276; }\n.mc-sidebar .nav-icon { width: 18px; text-align: center; font-size: 15px; }\n\n/* Main content */\n.mc-main { margin-left: 240px; flex: 1; padding: 24px 32px; min-width: 0; }\n.mc-main h1 { font-size: 24px; font-weight: 600; margin-bottom: 20px; color: #1a1a2e; }\n.mc-main h2 { font-size: 18px; font-weight: 600; margin: 20px 0 12px; color: #333; }\n\n/* Cards */\n.card { background: #fff; border-radius: 8px; border: 1px solid #e0e0e0; padding: 16px 20px; margin-bottom: 12px; }\n.card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.06); }\n.card h3 { font-size: 16px; font-weight: 600; margin-bottom: 6px; }\n.card .meta { font-size: 13px; color: #666; margin-top: 4px; }\n.card .detail { font-size: 14px; color: #444; margin-top: 4px; }\n\n/* Grid cards */\n.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-bottom: 20px; }\n.card-grid .card { margin-bottom: 0; }\n\n/* Dashboard cards */\n.dash-card { background: #fff; border-radius: 8px; border: 1px solid #e0e0e0; padding: 20px; text-align: center; }\n.dash-card .dash-icon { font-size: 32px; margin-bottom: 8px; }\n.dash-card .dash-value { font-size: 24px; font-weight: 700; color: #1a5276; }\n.dash-card .dash-label { font-size: 13px; color: #666; margin-top: 4px; }\n\n/* Badges */\n.badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600; }\n.badge-red { background: #fde8e8; color: #c0392b; }\n.badge-yellow { background: #fef9e7; color: #b7950b; }\n.badge-green { background: #e8f8f5; color: #1e8449; }\n.badge-blue { background: #d4eaf7; color: #1a5276; }\n.badge-gray { background: #eee; color: #666; }\n\n/* Tables */\ntable { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; border: 1px solid #e0e0e0; margin-bottom: 16px; }\nth { background: #f7f8fa; text-align: left; padding: 10px 16px; font-size: 13px; font-weight: 600; color: #555; border-bottom: 2px solid #e0e0e0; }\ntd { padding: 10px 16px; font-size: 14px; border-bottom: 1px solid #f0f0f0; }\ntr:last-child td { border-bottom: none; }\ntr:hover td { background: #fafbfc; }\n.abnormal { color: #c0392b; font-weight: 600; }\n\n/* Messages */\n.msg-list { display: flex; flex-direction: column; gap: 2px; }\n.msg-item { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 14px 20px; cursor: pointer; transition: background 0.15s; }\n.msg-item:hover { background: #f0f7fd; }\n.msg-item.unread { border-left: 4px solid #1a5276; }\n.msg-subject { font-weight: 600; font-size: 15px; }\n.msg-preview { font-size: 13px; color: #666; margin-top: 2px; }\n.msg-meta { font-size: 12px; color: #999; margin-top: 4px; }\n.msg-thread { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 20px; margin-top: 16px; display: none; }\n.msg-thread.visible { display: block; }\n.msg-bubble { padding: 12px 16px; border-radius: 12px; margin-bottom: 8px; max-width: 80%; }\n.msg-bubble.provider { background: #f0f2f5; align-self: flex-start; }\n.msg-bubble.patient { background: #d4eaf7; align-self: flex-end; margin-left: auto; }\n.msg-bubble .author { font-weight: 600; font-size: 13px; margin-bottom: 4px; }\n.msg-bubble .time { font-size: 11px; color: #888; margin-top: 4px; }\n.msg-bubble .body { font-size: 14px; line-height: 1.5; }\n\n/* Tabs */\n.tabs { display: flex; gap: 0; border-bottom: 2px solid #e0e0e0; margin-bottom: 20px; }\n.tab { padding: 10px 20px; font-size: 14px; font-weight: 500; color: #666; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.15s; }\n.tab:hover { color: #1a5276; }\n.tab.active { color: #1a5276; font-weight: 600; border-bottom-color: #1a5276; }\n\n/* Loading */\n.loading { text-align: center; padding: 40px; color: #888; }\n\n/* Print header (scraper compat) */\n.proxy-switcher { position: relative; }\n.proxy-switcher > summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 8px; background: #12405e; border: 1px solid #2e6f9c; color: #fff; padding: 6px 12px; border-radius: 999px; font-size: 14px; }\n.proxy-switcher > summary::-webkit-details-marker { display: none; }\n.proxy-switcher > summary:hover { background: #17527a; }\n.proxy-switcher > summary .proxy-switcher-label { color: #aed6f1; font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; }\n.proxy-switcher > summary .proxy-switcher-caret { color: #aed6f1; font-size: 11px; }\n.proxy-switcher .proxySelectorDropDown { position: absolute; right: 0; top: calc(100% + 8px); background: #fff; border: 1px solid #dde; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.18); min-width: 260px; padding: 6px; z-index: 200; }\n.proxy-switcher .proxySubjectLink { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border-radius: 6px; color: #1a1a2e; text-decoration: none; }\n.proxy-switcher .proxySubjectLink:hover { background: #eef4f9; text-decoration: none; }\n.proxy-switcher .proxySubjectLink.currentContext { background: #e8f4fb; font-weight: 600; }\n.proxy-switcher .proxySubjectLink.currentContext::after { content: 'Viewing'; font-size: 11px; color: #1a6fa5; font-weight: 600; }\n.proxy-switcher .proxy-switcher-heading { padding: 8px 12px 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; color: #888; }\n.printheader { font-size: 13px; color: #666; padding: 8px 0; margin-bottom: 16px; border-bottom: 1px solid #e0e0e0; }\n\n/* Letter detail */\n.letter-body { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px; line-height: 1.6; }\n.letter-body h2 { margin: 0 0 12px; }\n.letter-body p { margin: 8px 0; }\n\n/* Vitals chart placeholder */\n.vital-chart { display: flex; align-items: flex-end; gap: 4px; height: 60px; margin-top: 8px; }\n.vital-bar { background: #5dade2; border-radius: 3px 3px 0 0; min-width: 24px; }\n</style>\n</head>\n<body>\n  <div class='hidden' style='display:none' id='__CSRFContainer'><input name=\"__RequestVerificationToken\" type=\"hidden\" value=\"fake-csrf-token-00000000000000000000000000000000\" /></div>\n  <script>\n(function () {\n  var originalFetch = window.fetch;\n  window.fetch = function (url, opts) {\n    opts = opts || {};\n    if ((opts.method || 'GET').toUpperCase() === 'POST') {\n      var el = document.querySelector('#__CSRFContainer input[name=__RequestVerificationToken]');\n      if (el) {\n        opts.headers = opts.headers || {};\n        if (!opts.headers['__RequestVerificationToken']) {\n          opts.headers['__RequestVerificationToken'] = el.value;\n        }\n      }\n    }\n    return originalFetch.call(this, url, opts);\n  };\n})();\n</script>\n  <header class=\"mc-header\">\n    <div class=\"logo\">My<span>Chart</span></div>\n    <div class=\"user-info\">\n      <details class=\"proxy-switcher\">\n      <summary><span class=\"proxy-switcher-label\">Viewing</span><strong>Homer Jay Simpson</strong><span class=\"proxy-switcher-caret\">▾</span></summary>\n      <div class=\"proxySelectorDropDown\">\n        <div class=\"proxy-switcher-heading\">Switch patient record</div>\n        <a class=\"proxySubjectLink currentContext\" data-id=\"WP-2KQZ8XVC5MJH4RTLN9PWY7BDF3SGA6EU1KXNQZ2RVJM8HTCBW5YLDP4FGS7AKEN3QRXZ6UVJ9MTHW1C\" href=\"/MyChart/inside.asp\" aria-label=\"Access your record\"><span class=\"proxySelectorDropDownNameEllipsis\">Homer Jay Simpson</span></a>\n        <a class=\"proxySubjectLink\" data-id=\"WP-7NQK4XZC2VJH8RTLM3PWY6BDF9SGA5EU1KXNQZ7RVJM2HTCBW4YLDP8FGS3AKEN6QRXZ9UVJ5MTHW2C\" href=\"/MyChart/inside.asp?mode=proxyswitch&amp;action=switchcontext&amp;src=0&amp;eid=WP-7NQK4XZC2VJH8RTLM3PWY6BDF9SGA5EU1KXNQZ7RVJM2HTCBW4YLDP8FGS3AKEN6QRXZ9UVJ5MTHW2C\" aria-label=\"Access Bart Simpson's record\"><span class=\"proxySelectorDropDownNameEllipsis\">Bart Simpson</span></a>\n        <a class=\"proxySubjectLink\" data-id=\"WP-3MFTJ9WQ2XKVN7RBZ5HLC8PYDA4GSEU6KMWJ1QRXTV9NZBHFC2LPD7YSGA5EK3UNQXWRJ8MVTZ6HC4\" href=\"/MyChart/inside.asp?mode=proxyswitch&amp;action=switchcontext&amp;src=0&amp;eid=WP-3MFTJ9WQ2XKVN7RBZ5HLC8PYDA4GSEU6KMWJ1QRXTV9NZBHFC2LPD7YSGA5EK3UNQXWRJ8MVTZ6HC4\" aria-label=\"Access Lisa Simpson's record\"><span class=\"proxySelectorDropDownNameEllipsis\">Lisa Simpson</span></a>\n        <a class=\"proxySubjectLink\" data-id=\"WP-9XVKZ2QM7WTNJ5RBH3LFC8PYDA6GSEU4KMWJ1QRXTV2NZBHFC9LPD5YSGA7EK3UNQXWRJ4MVTZ8HC6\" href=\"/MyChart/inside.asp?mode=proxyswitch&amp;action=switchcontext&amp;src=0&amp;eid=WP-9XVKZ2QM7WTNJ5RBH3LFC8PYDA6GSEU4KMWJ1QRXTV2NZBHFC9LPD5YSGA7EK3UNQXWRJ4MVTZ8HC6\" aria-label=\"Access Maggie Simpson's record\"><span class=\"proxySelectorDropDownNameEllipsis\">Maggie Simpson</span></a>\n      </div>\n    </details>\n      <a href=\"/MyChart/Authentication/Login\">Sign out</a>\n    </div>\n  </header>\n  <div class=\"mc-layout\">\n    <nav class=\"mc-sidebar\">\n    <div class=\"nav-group\">\n      <div class=\"nav-group-title\">Overview</div>\n      \n        <a href=\"/MyChart/Home\" class=\"\">\n          <span class=\"nav-icon\">🏠</span>Home\n        </a>\n      \n        <a href=\"/MyChart/Messaging\" class=\"\">\n          <span class=\"nav-icon\">💬</span>Messages\n        </a>\n      \n        <a href=\"/MyChart/Visits\" class=\"\">\n          <span class=\"nav-icon\">📅</span>Visits\n        </a>\n      \n    </div>\n  \n    <div class=\"nav-group\">\n      <div class=\"nav-group-title\">Health</div>\n      \n        <a href=\"/MyChart/TestResults\" class=\"\">\n          <span class=\"nav-icon\">🧪</span>Test Results\n        </a>\n      \n        <a href=\"/MyChart/Clinical/Medications\" class=\"\">\n          <span class=\"nav-icon\">💊</span>Medications\n        </a>\n      \n        <a href=\"/MyChart/Clinical/Allergies\" class=\"\">\n          <span class=\"nav-icon\">⚠️</span>Allergies\n        </a>\n      \n        <a href=\"/MyChart/Clinical/HealthIssues\" class=\"\">\n          <span class=\"nav-icon\">🩺</span>Health Issues\n        </a>\n      \n      
… (truncated; 9315 more characters)
```

</details>

<details>
<summary><code>mode: standard</code> (878 chars)</summary>

- **DescriptiveTitle**: Your Care Team
- **externalProvidersUnavailable**: false

## ProvidersList (5)

| Name | Relation | Specialty | IsExternal | fromExternalList | ID | NationalProviderID | DepartmentID | CanMessage |
| - | - | - | - | - | - | - | - | - |
| Julius Hibbert, MD | Primary Care Provider | Internal Medicine | false | false | PROV-HIBBERT | 1000000001 | DEP-IM-1 | true |
| Nick Riviera, MD | Surgeon | General Surgery | false | false | PROV-RIVIERA | 1000000002 | DEP-SURG-1 | false |
| Springfield Nuclear Power Plant Employee Health Plan | Payer | (empty) | false | false | PAYER-SNPP | (empty) | (empty) | false |
| Dr. Velimirovic, MD | (none) | Cardiothoracic Surgery | false | false | PROV-VELIMIROVIC | 1000000004 | DEP-SURG-2 | true |
| Marvin Monroe, MD | Outside Provider | Psychiatry | true | true | PROV-EXT-MONROE | 1000000003 | (empty) | false |

</details>

<details>
<summary><code>mode: concise</code> (532 chars)</summary>

- **externalProvidersUnavailable**: false

## ProvidersList (5)

| Name | Relation | Specialty | IsExternal | fromExternalList |
| - | - | - | - | - |
| Julius Hibbert, MD | Primary Care Provider | Internal Medicine | false | false |
| Nick Riviera, MD | Surgeon | General Surgery | false | false |
| Springfield Nuclear Power Plant Employee Health Plan | Payer | (empty) | false | false |
| Dr. Velimirovic, MD | (none) | Cardiothoracic Surgery | false | false |
| Marvin Monroe, MD | Outside Provider | Psychiatry | true | true |

</details>

<details>
<summary><code>mode: json</code> (1228 chars)</summary>

```json
{
  "DescriptiveTitle": "Your Care Team",
  "externalProvidersUnavailable": false,
  "ProvidersList": [
    {
      "Name": "Julius Hibbert, MD",
      "Relation": "Primary Care Provider",
      "Specialty": "Internal Medicine",
      "IsExternal": false,
      "fromExternalList": false,
      "ID": "PROV-HIBBERT",
      "NationalProviderID": "1000000001",
      "DepartmentID": "DEP-IM-1",
      "CanMessage": true
    },
    {
      "Name": "Nick Riviera, MD",
      "Relation": "Surgeon",
      "Specialty": "General Surgery",
      "IsExternal": false,
      "fromExternalList": false,
      "ID": "PROV-RIVIERA",
      "NationalProviderID": "1000000002",
      "DepartmentID": "DEP-SURG-1",
      "CanMessage": false
    },
    {
      "Name": "Springfield Nuclear Power Plant Employee Health Plan",
      "Relation": "Payer",
      "Specialty": "",
      "IsExternal": false,
      "fromExternalList": false,
      "ID": "PAYER-SNPP",
      "NationalProviderID": "",
      "DepartmentID": "",
      "CanMessage": false
    },
    {
      "Name": "Dr. Velimirovic, MD",
      "Relation": null,
      "Specialty": "Cardiothoracic Surgery",
      "IsExternal": false,
      "fromExternalList": false,
      "ID": "PROV-VELIMIROVIC",
      "NationalProviderID": "1000000004",
      "DepartmentID": "DEP-SURG-2",
      "CanMessage": true
    },
    {
      "Name": "Marvin Monroe, MD",
      "Relation": "Outside Provider",
      "Specialty": "Psychiatry",
      "IsExternal": true,
      "fromExternalList": true,
      "ID": "PROV-EXT-MONROE",
      "NationalProviderID": "1000000003",
      "DepartmentID": "",
      "CanMessage": false
    }
  ]
}
```

</details>

---

### `get_referrals`

Active and past referrals.

<details>
<summary><code>mode: raw</code> (414 chars)</summary>

```json
{
  "referralList": [
    {
      "internalId": "REF-001",
      "externalId": "REF-EXT-001",
      "status": "Approved",
      "statusString": "Approved",
      "creationDate": "01/10/2026",
      "dte": 0,
      "referredToProviderName": "Nick Riviera, MD",
      "referredByProviderName": "Julius Hibbert, MD",
      "referredToFacility": "Springfield Cardiology Associates",
      "start": "01/10/2026",
      "end": "04/10/2026"
    }
  ],
  "canSendMessage": false,
  "canSeeAuthorizations": false,
  "shouldRedirect": false
}
```

</details>

<details>
<summary><code>mode: standard</code> (413 chars)</summary>

- **canSeeAuthorizations**: false

## referralList (1)

| statusString | status | referredToProviderName | referredToFacility | referredByProviderName | start | end | creationDate | internalId | externalId |
| - | - | - | - | - | - | - | - | - | - |
| Approved | Approved | Nick Riviera, MD | Springfield Cardiology Associates | Julius Hibbert, MD | 01/10/2026 | 04/10/2026 | 01/10/2026 | REF-001 | REF-EXT-001 |

</details>

<details>
<summary><code>mode: concise</code> (264 chars)</summary>

## referralList (1)

| statusString | referredToProviderName | referredToFacility | referredByProviderName | start | end |
| - | - | - | - | - | - |
| Approved | Nick Riviera, MD | Springfield Cardiology Associates | Julius Hibbert, MD | 01/10/2026 | 04/10/2026 |

</details>

<details>
<summary><code>mode: json</code> (360 chars)</summary>

```json
{
  "canSeeAuthorizations": false,
  "referralList": [
    {
      "statusString": "Approved",
      "status": "Approved",
      "referredToProviderName": "Nick Riviera, MD",
      "referredToFacility": "Springfield Cardiology Associates",
      "referredByProviderName": "Julius Hibbert, MD",
      "start": "01/10/2026",
      "end": "04/10/2026",
      "creationDate": "01/10/2026",
      "internalId": "REF-001",
      "externalId": "REF-EXT-001"
    }
  ]
}
```

</details>

---

### `get_letters`

Letters from providers. Each entry carries the hnoId/csn needed by get_letter_details.

<details>
<summary><code>mode: raw</code> (637 chars)</summary>

```json
{
  "letters": [
    {
      "dateISO": "2025-11-20T16:00:00Z",
      "viewed": true,
      "hnoId": "LTR-002",
      "csn": "CSN-HOMER-003",
      "reason": "After Visit Summary - ER Visit",
      "empId": "PROV-NICK"
    },
    {
      "dateISO": "",
      "viewed": false,
      "hnoId": "LTR-003",
      "csn": "CSN-HOMER-004",
      "reason": "Sector 7G Safety Notice",
      "empId": "PROV-HIBBERT"
    },
    {
      "dateISO": "2026-01-10T16:00:00Z",
      "viewed": false,
      "hnoId": "LTR-001",
      "csn": "CSN-HOMER-002",
      "reason": "After Visit Summary - Annual Physical",
      "empId": "PROV-HIBBERT"
    }
  ],
  "users": {
    "PROV-HIBBERT": {
      "empId": "PROV-HIBBERT",
      "name": "Julius Hibbert, MD",
      "photoUrl": ""
    },
    "PROV-NICK": {
      "empId": "PROV-NICK",
      "name": "Nick Riviera, MD",
      "photoUrl": ""
    }
  },
  "departments": {}
}
```

</details>

<details>
<summary><code>mode: standard</code> (503 chars)</summary>

## letters (3)

| hnoId | csn | dateISO | reason | viewed | empId | providerName |
| - | - | - | - | - | - | - |
| LTR-001 | CSN-HOMER-002 | 2026-01-10T16:00:00Z | After Visit Summary - Annual Physical | false | PROV-HIBBERT | Julius Hibbert, MD |
| LTR-002 | CSN-HOMER-003 | 2025-11-20T16:00:00Z | After Visit Summary - ER Visit | true | PROV-NICK | Nick Riviera, MD |
| LTR-003 | CSN-HOMER-004 | (empty) | Sector 7G Safety Notice | false | PROV-HIBBERT | Julius Hibbert, MD |

## departments

(empty)

</details>

<details>
<summary><code>mode: concise</code> (424 chars)</summary>

## letters (3)

| hnoId | csn | dateISO | reason | viewed | providerName |
| - | - | - | - | - | - |
| LTR-001 | CSN-HOMER-002 | 2026-01-10T16:00:00Z | After Visit Summary - Annual Physical | false | Julius Hibbert, MD |
| LTR-002 | CSN-HOMER-003 | 2025-11-20T16:00:00Z | After Visit Summary - ER Visit | true | Nick Riviera, MD |
| LTR-003 | CSN-HOMER-004 | (empty) | Sector 7G Safety Notice | false | Julius Hibbert, MD |

</details>

<details>
<summary><code>mode: json</code> (577 chars)</summary>

```json
{
  "letters": [
    {
      "hnoId": "LTR-001",
      "csn": "CSN-HOMER-002",
      "dateISO": "2026-01-10T16:00:00Z",
      "reason": "After Visit Summary - Annual Physical",
      "viewed": false,
      "empId": "PROV-HIBBERT",
      "providerName": "Julius Hibbert, MD"
    },
    {
      "hnoId": "LTR-002",
      "csn": "CSN-HOMER-003",
      "dateISO": "2025-11-20T16:00:00Z",
      "reason": "After Visit Summary - ER Visit",
      "viewed": true,
      "empId": "PROV-NICK",
      "providerName": "Nick Riviera, MD"
    },
    {
      "hnoId": "LTR-003",
      "csn": "CSN-HOMER-004",
      "dateISO": "",
      "reason": "Sector 7G Safety Notice",
      "viewed": false,
      "empId": "PROV-HIBBERT",
      "providerName": "Julius Hibbert, MD"
    }
  ],
  "departments": {}
}
```

</details>

---

### `get_letter_details`

The full contents of one letter listed by get_letters.

Arguments: ```json
{"hno_id":"LTR-001","csn":"CSN-HOMER-002"}
```

<details>
<summary><code>mode: raw</code> (483 chars)</summary>

```json
{
  "bodyHTML": "<h2>After Visit Summary</h2><p>Patient: Homer Simpson</p><p>Date: January 10, 2026</p><p>Provider: Dr. Julius Hibbert</p><p>Reason: Annual Physical</p><p>Assessment: Patient is obese (BMI 35.3). Hypertension not well controlled. Hypercholesterolemia - lipid panel shows elevated LDL and triglycerides.</p><p>Plan: Continue current medications. Referred to weight management program. Follow up in 3 months. Dietary counseling recommended - reduce donut consumption.</p>"
}
```

</details>

<details>
<summary><code>mode: standard</code> (475 chars)</summary>

- **bodyHTMLText**:

After Visit Summary  
  
Patient: Homer Simpson  
  
Date: January 10, 2026  
  
Provider: Dr. Julius Hibbert  
  
Reason: Annual Physical  
  
Assessment: Patient is obese (BMI 35.3). Hypertension not well controlled. Hypercholesterolemia - lipid panel shows elevated LDL and triglycerides.  
  
Plan: Continue current medications. Referred to weight management program. Follow up in 3 months. Dietary counseling recommended - reduce donut consumption.

</details>

<details>
<summary><code>mode: concise</code> (475 chars)</summary>

- **bodyHTMLText**:

After Visit Summary  
  
Patient: Homer Simpson  
  
Date: January 10, 2026  
  
Provider: Dr. Julius Hibbert  
  
Reason: Annual Physical  
  
Assessment: Patient is obese (BMI 35.3). Hypertension not well controlled. Hypercholesterolemia - lipid panel shows elevated LDL and triglycerides.  
  
Plan: Continue current medications. Referred to weight management program. Follow up in 3 months. Dietary counseling recommended - reduce donut consumption.

</details>

<details>
<summary><code>mode: json</code> (460 chars)</summary>

```json
{
  "bodyHTMLText": "After Visit Summary\n\nPatient: Homer Simpson\n\nDate: January 10, 2026\n\nProvider: Dr. Julius Hibbert\n\nReason: Annual Physical\n\nAssessment: Patient is obese (BMI 35.3). Hypertension not well controlled. Hypercholesterolemia - lipid panel shows elevated LDL and triglycerides.\n\nPlan: Continue current medications. Referred to weight management program. Follow up in 3 months. Dietary counseling recommended - reduce donut consumption."
}
```

</details>

---

### `get_documents`

Clinical documents and visit records.

<details>
<summary><code>mode: raw</code> (367 chars)</summary>

```json
{
  "documents": [
    {
      "id": "DOC-001",
      "title": "After Visit Summary",
      "documentType": "Clinical",
      "date": "01/10/2026",
      "providerName": "Julius Hibbert, MD",
      "organizationName": "Springfield General Hospital"
    },
    {
      "id": "DOC-002",
      "title": "Lab Results Report",
      "documentType": "Lab",
      "date": "01/10/2026",
      "providerName": "Julius Hibbert, MD",
      "organizationName": "Springfield General Hospital"
    }
  ]
}
```

</details>

<details>
<summary><code>mode: standard</code> (329 chars)</summary>

## documents (2)

| id | title | documentType | date | providerName | organizationName |
| - | - | - | - | - | - |
| DOC-001 | After Visit Summary | Clinical | 01/10/2026 | Julius Hibbert, MD | Springfield General Hospital |
| DOC-002 | Lab Results Report | Lab | 01/10/2026 | Julius Hibbert, MD | Springfield General Hospital |

</details>

<details>
<summary><code>mode: concise</code> (329 chars)</summary>

## documents (2)

| id | title | documentType | date | providerName | organizationName |
| - | - | - | - | - | - |
| DOC-001 | After Visit Summary | Clinical | 01/10/2026 | Julius Hibbert, MD | Springfield General Hospital |
| DOC-002 | Lab Results Report | Lab | 01/10/2026 | Julius Hibbert, MD | Springfield General Hospital |

</details>

<details>
<summary><code>mode: json</code> (367 chars)</summary>

```json
{
  "documents": [
    {
      "id": "DOC-001",
      "title": "After Visit Summary",
      "documentType": "Clinical",
      "date": "01/10/2026",
      "providerName": "Julius Hibbert, MD",
      "organizationName": "Springfield General Hospital"
    },
    {
      "id": "DOC-002",
      "title": "Lab Results Report",
      "documentType": "Lab",
      "date": "01/10/2026",
      "providerName": "Julius Hibbert, MD",
      "organizationName": "Springfield General Hospital"
    }
  ]
}
```

</details>

---

### `get_upcoming_orders`

Standing/upcoming orders — labs, imaging and procedures the care team has ordered.

<details>
<summary><code>mode: raw</code> (557 chars)</summary>

```json
{
  "orderGroupList": {},
  "orderList": {
    "ORD-001": {
      "orderName": "Lipid Panel",
      "orderType": "Lab",
      "status": "Ordered",
      "orderedDate": "01/10/2026",
      "orderedByProvider": "Julius Hibbert, MD",
      "facilityName": "Springfield General Hospital"
    },
    "ORD-002": {
      "orderName": "HbA1c",
      "orderType": "Lab",
      "status": "Ordered",
      "orderedDate": "01/10/2026",
      "orderedByProvider": "Julius Hibbert, MD",
      "facilityName": "Springfield General Hospital"
    }
  },
  "providerList": {
    "PROV-HIBBERT": {
      "name": "Julius Hibbert, MD",
      "providerId": "PROV-HIBBERT"
    }
  },
  "upcomingOrdersSettings": {
    "canHideOrUnhideReminders": false
  }
}
```

</details>

<details>
<summary><code>mode: standard</code> (381 chars)</summary>

## orderList (2)

| orderName | orderType | status | orderedDate | orderedByProvider | facilityName | providerName |
| - | - | - | - | - | - | - |
| Lipid Panel | Lab | Ordered | 01/10/2026 | Julius Hibbert, MD | Springfield General Hospital | (none) |
| HbA1c | Lab | Ordered | 01/10/2026 | Julius Hibbert, MD | Springfield General Hospital | (none) |

## orderGroupList

(empty)

</details>

<details>
<summary><code>mode: concise</code> (353 chars)</summary>

## orderList (2)

| orderName | orderType | status | orderedDate | orderedByProvider | facilityName | providerName |
| - | - | - | - | - | - | - |
| Lipid Panel | Lab | Ordered | 01/10/2026 | Julius Hibbert, MD | Springfield General Hospital | (none) |
| HbA1c | Lab | Ordered | 01/10/2026 | Julius Hibbert, MD | Springfield General Hospital | (none) |

</details>

<details>
<summary><code>mode: json</code> (427 chars)</summary>

```json
{
  "orderList": [
    {
      "orderName": "Lipid Panel",
      "orderType": "Lab",
      "status": "Ordered",
      "orderedDate": "01/10/2026",
      "orderedByProvider": "Julius Hibbert, MD",
      "facilityName": "Springfield General Hospital",
      "providerName": null
    },
    {
      "orderName": "HbA1c",
      "orderType": "Lab",
      "status": "Ordered",
      "orderedDate": "01/10/2026",
      "orderedByProvider": "Julius Hibbert, MD",
      "facilityName": "Springfield General Hospital",
      "providerName": null
    }
  ],
  "orderGroupList": {}
}
```

</details>

---

### `get_questionnaires`

Open and completed questionnaires / health assessments.

<details>
<summary><code>mode: raw</code> (260 chars)</summary>

```json
{
  "questionnaires": [
    {
      "id": "QUEST-001",
      "name": "PHQ-9 Depression Screening",
      "status": "Completed",
      "dueDate": "01/10/2026",
      "completedDate": "01/10/2026"
    },
    {
      "id": "QUEST-002",
      "name": "Health Risk Assessment",
      "status": "Pending",
      "dueDate": "04/15/2026",
      "completedDate": ""
    }
  ]
}
```

</details>

<details>
<summary><code>mode: standard</code> (247 chars)</summary>

## questionnaires (2)

| id | name | status | dueDate | completedDate |
| - | - | - | - | - |
| QUEST-001 | PHQ-9 Depression Screening | Completed | 01/10/2026 | 01/10/2026 |
| QUEST-002 | Health Risk Assessment | Pending | 04/15/2026 | (empty) |

</details>

<details>
<summary><code>mode: concise</code> (247 chars)</summary>

## questionnaires (2)

| id | name | status | dueDate | completedDate |
| - | - | - | - | - |
| QUEST-001 | PHQ-9 Depression Screening | Completed | 01/10/2026 | 01/10/2026 |
| QUEST-002 | Health Risk Assessment | Pending | 04/15/2026 | (empty) |

</details>

<details>
<summary><code>mode: json</code> (260 chars)</summary>

```json
{
  "questionnaires": [
    {
      "id": "QUEST-001",
      "name": "PHQ-9 Depression Screening",
      "status": "Completed",
      "dueDate": "01/10/2026",
      "completedDate": "01/10/2026"
    },
    {
      "id": "QUEST-002",
      "name": "Health Risk Assessment",
      "status": "Pending",
      "dueDate": "04/15/2026",
      "completedDate": ""
    }
  ]
}
```

</details>

---

### `get_care_journeys`

Care journeys and care plans.

<details>
<summary><code>mode: raw</code> (228 chars)</summary>

```json
{
  "careJourneys": [
    {
      "id": "CJ-001",
      "name": "Weight Management Program",
      "description": "Comprehensive program including dietary counseling, exercise plan, and regular check-ins",
      "status": "Active",
      "providerName": "Julius Hibbert, MD"
    }
  ]
}
```

</details>

<details>
<summary><code>mode: standard</code> (264 chars)</summary>

## careJourneys (1)

### careJourneys 1

- **id**: CJ-001
- **name**: Weight Management Program
- **description**: Comprehensive program including dietary counseling, exercise plan, and regular check-ins
- **status**: Active
- **providerName**: Julius Hibbert, MD

</details>

<details>
<summary><code>mode: concise</code> (264 chars)</summary>

## careJourneys (1)

### careJourneys 1

- **id**: CJ-001
- **name**: Weight Management Program
- **description**: Comprehensive program including dietary counseling, exercise plan, and regular check-ins
- **status**: Active
- **providerName**: Julius Hibbert, MD

</details>

<details>
<summary><code>mode: json</code> (228 chars)</summary>

```json
{
  "careJourneys": [
    {
      "id": "CJ-001",
      "name": "Weight Management Program",
      "description": "Comprehensive program including dietary counseling, exercise plan, and regular check-ins",
      "status": "Active",
      "providerName": "Julius Hibbert, MD"
    }
  ]
}
```

</details>

---

### `get_activity_feed`

Recent account activity feed items.

<details>
<summary><code>mode: raw</code> (3220 chars)</summary>

```json
{
  "singleItemFeedViewModels": [
    {
      "eptId": "EPT-HOMER",
      "displayName": "Homer",
      "photoUrl": "",
      "tabColor": 0,
      "zeroStateIconKey": "",
      "isSelected": true,
      "feedItems": [
        {
          "phone": "",
          "smsActive": false,
          "allTextEnabled": false,
          "email": "",
          "allEmailEnabled": false,
          "canEditInfo": false,
          "displayText": "New Lab Results Available",
          "type": "TestResult",
          "defaultType": "TestResult",
          "groupCount": 0,
          "priority": 0,
          "priorityInstant": 1768041000000,
          "iconKey": "",
          "subiconKey": "",
          "shouldShowWatermark": false,
          "primaryAction": {
            "uriId": "",
            "uri": "/app/test-results",
            "uriType": 0,
            "uriDisplayText": "",
            "uriAccessibleText": "",
            "uriIconKey": "",
            "isHidden": false
          },
          "secondaryAction": {
            "uriId": "",
            "uri": "",
            "uriType": 0,
            "uriDisplayText": "",
            "uriAccessibleText": "",
            "uriIconKey": "",
            "isHidden": false
          },
          "tertiaryAction": {
            "uriId": "",
            "uriType": 0,
            "uriDisplayText": "",
            "uriAccessibleText": "",
            "uriIconKey": "",
            "isHidden": false
          },
          "defaultAction": {
            "uriId": "",
            "uri": "/app/test-results",
            "uriType": 0,
            "uriDisplayText": "",
            "uriAccessibleText": "",
            "uriIconKey": "",
            "isHidden": false
          },
          "identifier": "FEED-001",
          "topicId": 0,
          "isH2GEnabled": false
        },
        {
          "phone": "",
          "smsActive": false,
          "allTextEnabled": false,
          "email": "",
          "allEmailEnabled": false,
          "canEditInfo": false,
          "displayText": "Annual Physical with Dr. Hibbert on April 15, 2026 at 9:00 AM",
          "type": "Appointment",
          "defaultType": "Appointment",
          "groupCount": 0,
          "priority": 0,
          "priorityInstant": 1775638800000,
          "iconKey": "",
          "subiconKey": "",
          "shouldShowWatermark": false,
          "primaryAction": {
            "uriId": "",
            "uri": "/Visits",
            "uriType": 0,
            "uriDisplayText": "",
            "uriAccessibleText": "",
            "uriIconKey": "",
            "isHidden": false
          },
          "secondaryAction": {
            "uriId": "",
            "uri": "",
            "uriType": 0,
            "uriDisplayText": "",
            "uriAccessibleText": "",
            "uriIconKey": "",
            "isHidden": false
          },
          "tertiaryAction": {
            "uriId": "",
            "uriType": 0,
            "uriDisplayText": "",
            "uriAccessibleText": "",
            "uriIconKey": "",
            "isHidden": false
          },
          "defaultAction": {
            "uriId": "",
            "uri": "/Visits",
            "uriType": 0,
            "uriDisplayText": "",
            "uriAccessibleText": "",
            "uriIconKey": "",
            "isHidden": false
          },
          "identifier": "FEED-002",
          "topicId": 0,
          "isH2GEnabled": false
        },
        {
          "phone": "",
          "smsActive": false,
          "allTextEnabled": false,
          "email": "",
          "allEmailEnabled": false,
          "canEditInfo": false,
          "displayText": "New Message from Dr. Hibbert",
          "type": "Message",
          "defaultType": "Message",
          "groupCount": 0,
          "priority": 0,
          "priorityInstant": 1768118400000,
          "iconKey": "",
          "subiconKey": "",
          "shouldShowWatermark": false,
          "primaryAction": {
            "uriId": "",
            "uri": "/app/communication-center",
            "uriType": 0,
            "uriDisplayText": "",
            "uriAccessibleText": "",
            "uriIconKey": "",
            "isHidden": false
          },
          "secondaryAction": {
            "uriId": "",
            "uri": "",
            "uriType": 0,
            "uriDisplayText": "",
            "uriAccessibleText": "",
            "uriIconKey": "",
            "isHidden": false
          },
          "tertiaryAction": {
            "uriId": "",
            "uriType": 0,
            "uriDisplayText": "",
            "uriAccessibleText": "",
            "uriIconKey": "",
            "isHidden": false
          },
          "defaultAction": {
            "uriId": "",
            "uri": "/app/communication-center",
            "uriType": 0,
            "uriDisplayText": "",
            "uriAccessibleText": "",
            "uriIconKey": "",
            "isHidden": false
          },
          "identifier": "FEED-003",
          "topicId": 0,
          "isH2GEnabled": false
        }
      ]
    }
  ],
  "linkedAccountsViewModel": {
    "externalAlertWidget": {
      "hasAlerts": false,
      "isLoadingFailed": false,
      "patientIndex": 0,
      "linkType": 0,
      "canAccessManageMyAccounts": false,
      "skipSignup": false,
      "isWaitingForResponse": false
    },
    "externalAlertsList": [],
    "noActionCommunityList": [],
    "inActiveCommunityList": [],
    "subjectName": "",
    "isNonPatient": false
  }
}
```

</details>

<details>
<summary><code>mode: standard</code> (1429 chars)</summary>

## singleItemFeedViewModels (1)

### singleItemFeedViewModels 1

- **displayName**: Homer
- **eptId**: EPT-HOMER

#### feedItems (3)

##### feedItems 1

- **identifier**: FEED-001
- **displayText**: New Lab Results Available
- **titleDisplayText**: (none)
- **announcementBody**: (none)
- **type**: TestResult
- **defaultType**: TestResult
- **topicId**: 0
- **priority**: 0
- **priorityInstant**: 1768041000000
- **priorityInstantISO**: 2026-01-10T10:30:00.000Z
- **groupCount**: 0

###### primaryAction

- **uriDisplayText**: (empty)

##### feedItems 2

- **identifier**: FEED-002
- **displayText**: Annual Physical with Dr. Hibbert on April 15, 2026 at 9:00 AM
- **titleDisplayText**: (none)
- **announcementBody**: (none)
- **type**: Appointment
- **defaultType**: Appointment
- **topicId**: 0
- **priority**: 0
- **priorityInstant**: 1775638800000
- **priorityInstantISO**: 2026-04-08T09:00:00.000Z
- **groupCount**: 0

###### primaryAction

- **uriDisplayText**: (empty)

##### feedItems 3

- **identifier**: FEED-003
- **displayText**: New Message from Dr. Hibbert
- **titleDisplayText**: (none)
- **announcementBody**: (none)
- **type**: Message
- **defaultType**: Message
- **topicId**: 0
- **priority**: 0
- **priorityInstant**: 1768118400000
- **priorityInstantISO**: 2026-01-11T08:00:00.000Z
- **groupCount**: 0

###### primaryAction

- **uriDisplayText**: (empty)

- **todayItems**: (none)
- **forYouItems**: (none)

</details>

<details>
<summary><code>mode: concise</code> (549 chars)</summary>

## singleItemFeedViewModels (1)

### singleItemFeedViewModels 1

- **displayName**: Homer

#### feedItems (3)

##### feedItems 1

- **displayText**: New Lab Results Available
- **priorityInstantISO**: 2026-01-10T10:30:00.000Z

##### feedItems 2

- **displayText**: Annual Physical with Dr. Hibbert on April 15, 2026 at 9:00 AM
- **priorityInstantISO**: 2026-04-08T09:00:00.000Z

##### feedItems 3

- **displayText**: New Message from Dr. Hibbert
- **priorityInstantISO**: 2026-01-11T08:00:00.000Z

- **todayItems**: (none)
- **forYouItems**: (none)

</details>

<details>
<summary><code>mode: json</code> (1119 chars)</summary>

```json
{
  "singleItemFeedViewModels": [
    {
      "displayName": "Homer",
      "eptId": "EPT-HOMER",
      "feedItems": [
        {
          "identifier": "FEED-001",
          "displayText": "New Lab Results Available",
          "titleDisplayText": null,
          "announcementBody": null,
          "type": "TestResult",
          "defaultType": "TestResult",
          "topicId": 0,
          "priority": 0,
          "priorityInstant": 1768041000000,
          "priorityInstantISO": "2026-01-10T10:30:00.000Z",
          "groupCount": 0,
          "primaryAction": {
            "uriDisplayText": ""
          }
        },
        {
          "identifier": "FEED-002",
          "displayText": "Annual Physical with Dr. Hibbert on April 15, 2026 at 9:00 AM",
          "titleDisplayText": null,
          "announcementBody": null,
          "type": "Appointment",
          "defaultType": "Appointment",
          "topicId": 0,
          "priority": 0,
          "priorityInstant": 1775638800000,
          "priorityInstantISO": "2026-04-08T09:00:00.000Z",
          "groupCount": 0,
          "primaryAction": {
            "uriDisplayText": ""
          }
        },
        {
          "identifier": "FEED-003",
          "displayText": "New Message from Dr. Hibbert",
          "titleDisplayText": null,
          "announcementBody": null,
          "type": "Message",
          "defaultType": "Message",
          "topicId": 0,
          "priority": 0,
          "priorityInstant": 1768118400000,
          "priorityInstantISO": "2026-01-11T08:00:00.000Z",
          "groupCount": 0,
          "primaryAction": {
            "uriDisplayText": ""
          }
        }
      ],
      "todayItems": [],
      "forYouItems": []
    }
  ]
}
```

</details>

---

### `get_education_materials`

Patient education materials assigned by the care team.

<details>
<summary><code>mode: raw</code> (862 chars)</summary>

```json
[
  {
    "elementId": "EDU-001",
    "displayName": "Heart Health: What You Need to Know",
    "assignedDate": "01/10/2026",
    "eduKey": "EDU-KEY-001",
    "numTopics": 3,
    "numPoints": 12,
    "isAdmitted": false,
    "encounterContext": 0,
    "wasAssignedThisVisit": false,
    "canUserTrackUnderstanding": true,
    "numPagesReviewed": 0,
    "numPagesUnderstood": 0,
    "numPagesQuestions": 0,
    "thumbnailImage": "",
    "thumbnailImageBlobToken": "",
    "thumbnailIcon": 0,
    "tvSupported": false,
    "removeThumbnails": false
  },
  {
    "elementId": "EDU-002",
    "displayName": "Managing Your Cholesterol",
    "assignedDate": "01/10/2026",
    "eduKey": "EDU-KEY-002",
    "numTopics": 2,
    "numPoints": 8,
    "isAdmitted": false,
    "encounterContext": 0,
    "wasAssignedThisVisit": false,
    "canUserTrackUnderstanding": true,
    "numPagesReviewed": 0,
    "numPagesUnderstood": 0,
    "numPagesQuestions": 0,
    "thumbnailImage": "",
    "thumbnailImageBlobToken": "",
    "thumbnailIcon": 0,
    "tvSupported": false,
    "removeThumbnails": false
  }
]
```

</details>

<details>
<summary><code>mode: standard</code> (391 chars)</summary>

## items (2)

| displayName | assignedDate | elementId | eduKey | numTopics | wasAssignedThisVisit | numPagesReviewed | numPagesUnderstood | numPagesQuestions |
| - | - | - | - | - | - | - | - | - |
| Heart Health: What You Need to Know | 01/10/2026 | EDU-001 | EDU-KEY-001 | 3 | false | 0 | 0 | 0 |
| Managing Your Cholesterol | 01/10/2026 | EDU-002 | EDU-KEY-002 | 2 | false | 0 | 0 | 0 |

</details>

<details>
<summary><code>mode: concise</code> (151 chars)</summary>

## items (2)

| displayName | assignedDate |
| - | - |
| Heart Health: What You Need to Know | 01/10/2026 |
| Managing Your Cholesterol | 01/10/2026 |

</details>

<details>
<summary><code>mode: json</code> (463 chars)</summary>

```json
[
  {
    "displayName": "Heart Health: What You Need to Know",
    "assignedDate": "01/10/2026",
    "elementId": "EDU-001",
    "eduKey": "EDU-KEY-001",
    "numTopics": 3,
    "wasAssignedThisVisit": false,
    "numPagesReviewed": 0,
    "numPagesUnderstood": 0,
    "numPagesQuestions": 0
  },
  {
    "displayName": "Managing Your Cholesterol",
    "assignedDate": "01/10/2026",
    "elementId": "EDU-002",
    "eduKey": "EDU-KEY-002",
    "numTopics": 2,
    "wasAssignedThisVisit": false,
    "numPagesReviewed": 0,
    "numPagesUnderstood": 0,
    "numPagesQuestions": 0
  }
]
```

</details>

---

### `get_ehi_export`

Electronic Health Information export templates this instance offers.

<details>
<summary><code>mode: raw</code> (524 chars)</summary>

```json
{
  "isNoBuildEhie": false,
  "existingEHIE": false,
  "ehieTemplates": [
    {
      "description": "Complete export of all health information",
      "hideAdditionalComments": false,
      "name": "Full Health Record",
      "id": "EHI-001"
    }
  ],
  "__Status": "",
  "__UpdateableSettings": {
    "maxThrottleConnections": 0,
    "connectionReleaseDelay": 0,
    "virtualQueueLoadThreshold": 0,
    "virtualQueuePopDelay": 0,
    "virtualQueueSize": 0,
    "isVirtualQueueEnabled": false,
    "lastDynamicSettingsUpdate": {
      "CredentialSettings": "",
      "LicenseSettings": "",
      "MyChartCentralSettings": "",
      "ServerStatusSettings": ""
    }
  }
}
```

</details>

<details>
<summary><code>mode: standard</code> (195 chars)</summary>

- **existingEHIE**: false
- **isNoBuildEhie**: false

## ehieTemplates (1)

| name | description | id |
| - | - | - |
| Full Health Record | Complete export of all health information | EHI-001 |

</details>

<details>
<summary><code>mode: concise</code> (122 chars)</summary>

## ehieTemplates (1)

| name | description |
| - | - |
| Full Health Record | Complete export of all health information |

</details>

<details>
<summary><code>mode: json</code> (165 chars)</summary>

```json
{
  "existingEHIE": false,
  "isNoBuildEhie": false,
  "ehieTemplates": [
    {
      "name": "Full Health Record",
      "description": "Complete export of all health information",
      "id": "EHI-001"
    }
  ]
}
```

</details>

---

### `get_linked_accounts`

MyChart accounts at other organizations that are linked to this one.

<details>
<summary><code>mode: raw</code> (1738 chars)</summary>

```json
{
  "IsConsentNeeded": false,
  "HideAskLater": false,
  "HasSearchableOrgs": false,
  "OrgList": {
    "ORG-SHELBYVILLE": {
      "OrganizationName": "Shelbyville Medical Center",
      "OrganizationId": "",
      "CELocationId": "",
      "RelatedOrganizations": null,
      "HasChildOrgs": false,
      "LinkType": 0,
      "LogoUrl": "",
      "TermsAndConditionsUrl": "",
      "ProxyTermsAndConditionsUrl": "",
      "UserActionStatus": 0,
      "IsDisabled": false,
      "ShowSignup": false,
      "ShowSignUpUnavailableMessage": false,
      "Accept": false,
      "UserMyChartStatus": 0,
      "CanScheduleCrossOrgVideoVisit": false,
      "IsSSO": false,
      "IncompleteH2GSetup": false,
      "LastEncounterDetail": {
        "Patient": "",
        "Physician": "",
        "Department": "",
        "Date": "",
        "Time": ""
      },
      "LastAccessTokenDateTime": null,
      "DisplayAutoRefresh": false,
      "DisplayAddress": [],
      "ShowUnavailableMsg": false,
      "CurrentlyLoadingDxrData": false,
      "ErrorLoadingDxrData": false,
      "CanJump": false,
      "HiddenFromMyChart": 0,
      "CanCreateCELink": false,
      "InProgressOrgNotSeen": false,
      "LinkErrorCode": "",
      "HasValidRefreshToken": false,
      "IsWithinThrottlingTime": false,
      "ShouldRemindForUpdate": false,
      "ShowInRefreshBanner": false,
      "IsInvalidCeLink": false,
      "InvalidLinkReason": 0,
      "InvalidLinkRetryDate": "",
      "IsMyChartCentral": false,
      "IdentityRelationship": 0,
      "H2GRemoteAuthLinkWorkflow": 0,
      "ShouldDisableLink": false,
      "ErrorMessage": null,
      "DisclaimerOverride": false,
      "NeedCeAuth": false,
      "IsPPOC": false,
      "PayerOrgDetails": {
        "IsPayerOnly": false,
        "IsPayvider": false,
        "IsPayer": false,
        "IsPayerLicensedForMyChart": false,
        "PayerChildWebsiteName": "",
        "PayerCvgLogo": "",
        "PayerCvgToken": "",
        "PayerCvgName": "",
        "PayerCvgLogoMagicId": ""
      },
      "NewSubjectList": null
    }
  },
  "AutoQueryList": {},
  "Spotlight": [],
  "H2GHasBeenViewed": false,
  "CEOptOut": false,
  "IsNPP": false,
  "InProgressList": {},
  "FhirUpdateFrequency": 0,
  "FhirSessionThrottlingTime": 0,
  "IsSelfVerified": false,
  "ForwardedLinks": [],
  "HomeOrgName": ""
}
```

</details>

<details>
<summary><code>mode: standard</code> (666 chars)</summary>

- **HomeOrgName**: (empty)
- **CEOptOut**: false
- **ForwardedLinks**: (none)

## OrgList (1)

### OrgList 1

- **OrganizationName**: Shelbyville Medical Center

#### LastEncounterDetail

- **Patient**: (empty)
- **Physician**: (empty)
- **Department**: (empty)
- **Date**: (empty)
- **Time**: (empty)
- **OrganizationId**: (empty)
- **LinkType**: 0
- **UserActionStatus**: 0
- **UserMyChartStatus**: 0
- **DisplayAddress**: (none)
- **LastAccessTokenDateTime**: (none)
- **IsDisabled**: false
- **IsInvalidCeLink**: false
- **InvalidLinkReason**: 0
- **InvalidLinkRetryDate**: (empty)
- **ErrorMessage**: (none)
- **NeedCeAuth**: false
- **LinkErrorCode**: (empty)

</details>

<details>
<summary><code>mode: concise</code> (223 chars)</summary>

## OrgList (1)

### OrgList 1

- **OrganizationName**: Shelbyville Medical Center

#### LastEncounterDetail

- **Patient**: (empty)
- **Physician**: (empty)
- **Department**: (empty)
- **Date**: (empty)
- **Time**: (empty)

</details>

<details>
<summary><code>mode: json</code> (481 chars)</summary>

```json
{
  "HomeOrgName": "",
  "CEOptOut": false,
  "ForwardedLinks": [],
  "OrgList": [
    {
      "OrganizationName": "Shelbyville Medical Center",
      "LastEncounterDetail": {
        "Patient": "",
        "Physician": "",
        "Department": "",
        "Date": "",
        "Time": ""
      },
      "OrganizationId": "",
      "LinkType": 0,
      "UserActionStatus": 0,
      "UserMyChartStatus": 0,
      "DisplayAddress": [],
      "LastAccessTokenDateTime": null,
      "IsDisabled": false,
      "IsInvalidCeLink": false,
      "InvalidLinkReason": 0,
      "InvalidLinkRetryDate": "",
      "ErrorMessage": null,
      "NeedCeAuth": false,
      "LinkErrorCode": ""
    }
  ]
}
```

</details>

---

### `get_emergency_contacts`

Emergency contacts on file.

<details>
<summary><code>mode: raw</code> (2186 chars)</summary>

```json
{
  "isViewOnly": false,
  "hideEmergencyContacts": false,
  "contacts": [
    {
      "id": "EC-1",
      "formattedName": "Marge Simpson",
      "relationToPatient": {
        "name": "Spouse",
        "labelText": "Spouse",
        "isInactive": false
      },
      "isPrimaryContact": false,
      "isLinkedToOtherPatient": false,
      "isHCA": false,
      "isAddressLinkedToPatient": false,
      "contactInformation": {
        "address": {
          "street": "742 Evergreen Terrace",
          "city": "Springfield",
          "county": {
            "number": "",
            "title": "",
            "isInactive": false
          },
          "state": {
            "number": "",
            "title": "NT",
            "abbreviation": "NT",
            "isInactive": false
          },
          "zip": "49007",
          "country": {
            "number": "1",
            "title": "United States of America",
            "isInactive": false
          },
          "houseNumber": "",
          "district": {
            "number": "",
            "abbreviation": "",
            "isInactive": false
          },
          "formattedValues": [
            "742 Evergreen Terrace",
            "Springfield, NT 49007"
          ],
          "allowArbitraryInput": true,
          "allowDefaults": false
        },
        "emailAddress": "",
        "phoneNumbers": [
          {
            "phoneNumber": "(555) 636-2701",
            "type": "Home"
          }
        ]
      },
      "savedSuccessfully": false,
      "isPending": false,
      "isVRK": false,
      "isEmergencyContact": true
    },
    {
      "id": "EC-2",
      "formattedName": "Barney Gumble",
      "relationToPatient": {
        "name": "Friend",
        "labelText": "Friend",
        "isInactive": false
      },
      "isPrimaryContact": false,
      "isLinkedToOtherPatient": false,
      "isHCA": false,
      "isAddressLinkedToPatient": false,
      "contactInformation": {
        "address": {
          "street": "742 Evergreen Terrace",
          "city": "Springfield",
          "county": {
            "number": "",
            "title": "",
            "isInactive": false
          },
          "state": {
            "number": "",
            "title": "NT",
            "abbreviation": "NT",
            "isInactive": false
          },
          "zip": "49007",
          "country": {
            "number": "1",
            "title": "United States of America",
            "isInactive": false
          },
          "houseNumber": "",
          "district": {
            "number": "",
            "abbreviation": "",
            "isInactive": false
          },
          "formattedValues": [
            "742 Evergreen Terrace",
            "Springfield, NT 49007"
          ],
          "allowArbitraryInput": true,
          "allowDefaults": false
        },
        "emailAddress": "",
        "phoneNumbers": [
          {
            "phoneNumber": "(555) 636-2800",
            "type": "Home"
          }
        ]
      },
      "savedSuccessfully": false,
      "isPending": false,
      "isVRK": false,
      "isEmergencyContact": true
    }
  ],
  "relationToPatientChoices": [
    {
      "name": "Spouse",
      "labelText": "Spouse",
      "isInactive": false
    },
    {
      "name": "Friend",
      "labelText": "Friend",
      "isInactive": false
    },
    {
      "name": "Parent",
      "labelText": "Parent",
      "isInactive": false
    },
    {
      "name": "Child",
      "labelText": "Child",
      "isInactive": false
    }
  ],
  "requiredFields": [],
  "vrkFields": [],
  "hasEndOfLifePageMnemonic": false
}
```

</details>

<details>
<summary><code>mode: standard</code> (838 chars)</summary>

- **hideEmergencyContacts**: false

## contacts (2)

### contacts 1

- **id**: EC-1
- **formattedName**: Marge Simpson

#### relationToPatient

- **name**: Spouse

#### contactInformation

##### phoneNumbers (1)

| phoneNumber | type |
| - | - |
| (555) 636-2701 | Home |
- **emailAddress**: (empty)

##### address

- **formattedValues**: 742 Evergreen Terrace, Springfield, NT 49007
- **isPrimaryContact**: false
- **isEmergencyContact**: true

### contacts 2

- **id**: EC-2
- **formattedName**: Barney Gumble

#### relationToPatient

- **name**: Friend

#### contactInformation

##### phoneNumbers (1)

| phoneNumber | type |
| - | - |
| (555) 636-2800 | Home |
- **emailAddress**: (empty)

##### address

- **formattedValues**: 742 Evergreen Terrace, Springfield, NT 49007
- **isPrimaryContact**: false
- **isEmergencyContact**: true

</details>

<details>
<summary><code>mode: concise</code> (456 chars)</summary>

## contacts (2)

### contacts 1

- **id**: EC-1
- **formattedName**: Marge Simpson

#### relationToPatient

- **name**: Spouse

#### contactInformation

##### phoneNumbers (1)

| phoneNumber | type |
| - | - |
| (555) 636-2701 | Home |

### contacts 2

- **id**: EC-2
- **formattedName**: Barney Gumble

#### relationToPatient

- **name**: Friend

#### contactInformation

##### phoneNumbers (1)

| phoneNumber | type |
| - | - |
| (555) 636-2800 | Home |

</details>

<details>
<summary><code>mode: json</code> (684 chars)</summary>

```json
{
  "hideEmergencyContacts": false,
  "contacts": [
    {
      "id": "EC-1",
      "formattedName": "Marge Simpson",
      "relationToPatient": {
        "name": "Spouse"
      },
      "contactInformation": {
        "phoneNumbers": [
          {
            "phoneNumber": "(555) 636-2701",
            "type": "Home"
          }
        ],
        "emailAddress": "",
        "address": {
          "formattedValues": [
            "742 Evergreen Terrace",
            "Springfield, NT 49007"
          ]
        }
      },
      "isPrimaryContact": false,
      "isEmergencyContact": true
    },
    {
      "id": "EC-2",
      "formattedName": "Barney Gumble",
      "relationToPatient": {
        "name": "Friend"
      },
      "contactInformation": {
        "phoneNumbers": [
          {
            "phoneNumber": "(555) 636-2800",
            "type": "Home"
          }
        ],
        "emailAddress": "",
        "address": {
          "formattedValues": [
            "742 Evergreen Terrace",
            "Springfield, NT 49007"
          ]
        }
      },
      "isPrimaryContact": false,
      "isEmergencyContact": true
    }
  ]
}
```

</details>
