# Login URL research — October 2026

Two questions, researched by hand: what the real portal is for the entries Epic's directory gets wrong, and which MyChart portals the directory doesn't list at all. What was confirmed is in [`mychart-instances-manual.json`](mychart-instances-manual.json), which `listMyCharts()` merges into the generated list.

## Entries the sweep couldn't confirm

The 66 directory entries the first full sweep could not confirm automatically (58 the resolver then called `unconfirmed`, now `down`, plus 8 broken for anyone; see [Checking login URLs](README.md#checking-login-urls)), researched by hand: the organization's own website, news of mergers and portal moves, and an anonymous page load of every candidate URL checked for Epic login markup — the same test `resolveLoginUrl` uses. Nothing here logged in.

A snapshot, not a contract: portals move. The organizations are public; none of this is patient data.

### Summary

| Verdict | Count |
| --- | --- |
| Found | 25 |
| Defunct | 6 |
| Epic's URL is fine | 9 |
| Exists, but blocked from the US | 9 |
| Custom sign-in in front of MyChart | 17 |

What it says about the directory:

- **Most bad URLs are migrations Epic never caught up with**, not typos: Bellin → Emplify Health, Alleghany → Atrium, CHI Memorial / St. Joseph's / St. Vincent → CommonSpirit, Dreyer → Advocate's LiveWell, Children's Hospital Oakland → UCSF, University Health Shreveport → Ochsner.
- **The Allina affiliates all point at Allina's own account site.** Each affiliate's website links to `www.mychartweb.com/MyChart/` — Allina's MyChart for affiliate partners — instead.
- **A missing intermediate certificate is not a dead portal.** Nine entries work in any browser, though Bun and Node can't load them; the refresh marks them `down`, so a client should not read `down` as "dead".
- **The login-page check can be fooled by an SSO hand-off.** Sentara's `/MyChart/Authentication/Login` carries the same anti-forgery token as a real login page but hands off to Sentara's own OAuth sign-in, with no password form.
- **A site can block us and not curl.** Communitycare PLAN's mount answers 403 to the resolver and works from `curl` (the parent portal `mychart.mhs.net/mychart/` works too).

Two shortcuts were measured and rejected:

- **The affiliate's parent portal** (`306-2` → `306`) is right for 8 of the 20 affiliates with a known answer: when the affiliate was absorbed into its parent, not when it runs its own portal (Spry, Lumina, Bay Clinic) or moved to another system (Bellin, St. Luke's).
- **The `faq` link** — see the README.

Separately, every organization in Epic's FHIR endpoint list (`open.epic.com`, 479) is in the MyChart directory under some name, apart from a few small practices.

### Found: a working MyChart login patients use

Epic's URL is wrong or out of date, and the right portal was found and confirmed to serve a MyChart login page. Each of these is a `correction` in the manual file, except Duke (Epic's mount is right; only `?liteMode=true` reaches the form). Three more are corrections too: Summit Surgical and University Health (below, defunct with a successor), and Communitycare PLAN, whose parent portal `mychart.mhs.net/mychart/` works where its own mount refuses non-browser requests. The custom-sign-in organizations are not corrected even where a direct Epic login exists behind the sign-in, because nothing confirms a patient's credentials work there.

| Organization | `slgId` | Epic's URL | Real URL | Confidence | Evidence |
| --- | --- | --- | --- | --- | --- |
| Alleghany Health | `905-6` | `https://my.alleghanyhealth.org/alh/` | `https://my.atriumhealth.org/MyAtriumHealth/` | high | epicUrl page: 'MyAlleghanyHealth has moved to MyAtriumHealth', redirects to my.atriumhealth.org; credentials carry over. |
| Allina | `465` | `https://account.allinahealth.org/dashboard/` | `https://mychart.allinahealth.org/MyChart/` | high | account.allinahealth.org embeds Epic's MyChart login widget from mychart.allinahealth.org/MyChart (branded 'Allina Health Systems & Excellian Affiliates'). Borderline custom_signin. |
| Bay Clinic | `1030-3` | `https://bayclinic.net/Bay-Clinic-pp.html` | `https://mychart.bayclinic.net/BC/` | high | bayclinic.net -> bayclinicoregon.com, which links mychart.bayclinic.net/BC/Authentication/Login ('Bay Clinic, LLC MyChart'). |
| Bellin | `306-2` | `https://www.mybellin.org/MyChart/` | `https://mychart.emplifyhealth.org/MyChart/` | high | mybellin.org NXDOMAIN; bellin.org/mychartchanges: moved to Emplify Health MyChart July 2025, same logins. |
| Bois Forte Health and Human Services | `343-3` | `https://boisforte.com/services/medical-services/` | `https://communityconnect.essentiahealth.org/MyChart/` | high | boisforte.com/hhs/ links MyChart to communityconnect.essentiahealth.org/MyChart; epicUrl path 404. |
| CHI Memorial | `845-1` | `https://mychart.memorial.org/TN/` | `https://patientportalsouth.commonspirit.org/PRD/` | high | commonspirit.org/patient-resources/memorial-patient-portal links patientportalsouth.commonspirit.org/PRD; mychart.memorial.org never responds. |
| CHI St. Joseph's Health | `845-2` | `https://mychart.chisaintjosephhealth.org/KY/` | `https://patientportalsouth.commonspirit.org/PRD/` | high | epicUrl is a 'Patient Portal Redirect' meta-refresh to patientportalsouth.commonspirit.org; says records moved and credentials unchanged. |
| CHI St. Vincent | `575-3` | `https://www.chistvincentonecare.com/#/login` | `https://patientportalsouth.commonspirit.org/PRD/` | high | https://www.commonspirit.org/patient-resources/stvincent-patient-portal links patientportalsouth.commonspirit.org/PRD; remaining facilities move from My OneCare Oct 31. |
| Children's Hospital Oakland | `871` | `https://mychart.cho.org/MyChartPRD/` | `https://ucsfmychart.ucsfmedicalcenter.org/UCSFMyChart/` | medium | mychart.cho.org times out; now UCSF Benioff Children's Hospital Oakland, whose pages send MyChart to ucsfhealth.org/mychart -> ucsfmychart.ucsfmedicalcenter.org. No Oakland-specific cutover notice found. |
| Cuyuna Regional Medical Center | `465-9` | `https://account.allinahealth.org/dashboard/` | `https://www.mychartweb.com/MyChart/` | medium | Independent Allina Epic affiliate; mychartweb.com is 'MyChart \| Powered by Allina Health for Affiliate Partners'; search results list mychartweb.com/MyChart/Signup for Cuyuna. |
| Dreyer | `342` | `https://myadvocateaurora.org/chart/` | `https://livewell.aah.org/chart/` | medium | myadvocateaurora.org has no DNS; Advocate's portal is now LiveWell (advocatehealth.com/help-center/livewell); search points Dreyer patients to livewell.aah.org/chart. |
| Duke University Health System | `835` | `https://www.dukemychart.org/home/` | `https://www.dukemychart.org/home/` | high | Mount is right, but /home/ redirects to a 'My Duke Health' marketing page; real login only at /home/Authentication/Login?liteMode=true. |
| Geisinger | `223` | `https://www.geisinger.org/mygeisinger` | `https://mychart.mycarecompass.org/mychart/` | high | geisinger.org is behind a bot CAPTCHA; MyGeisinger Epic instance is mychart.mycarecompass.org (Geisinger-branded; mygeisinger.org/mychart/ redirects into it). |
| Glencoe Regional Health Services | `465-5` | `https://account.allinahealth.org/dashboard/` | `https://www.mychartweb.com/MyChart/` | high | https://glencoehealth.org/patient-tools/mychart/ links www.mychartweb.com/mychart/Authentication/Login (Allina's affiliate-partner MyChart). |
| Mayo Clinic | `958` | `https://mayoclinichealthsystem.org/patient-online-services` | `https://mychart.et0958.epichosted.com/MyChart/` | medium | Patients use custom onlineservices.mayoclinic.org/patientportal; patientportal.mayoclinic.org CNAMEs to mychart.et0958.epichosted.com whose login works (branded Mayo Clinic). Vanity host fails TLS SNI. |
| Medical Clinic of Houston L.L.P. | `922-1` | `https://mchllp.houstonmethodist.org/MCHMyChart/` | `https://mychart.houstonmethodist.org/MyChart/` | high | mchllp.com links houstonmethodist.org/mychart/ ('via Houston Methodist Community Connect'); old MCHMyChart mount gone. |
| Men's Mental Health | `1206-1` | `https://mensmentalhealthservices.com/` | `https://my.baptistchart.com/mychart/` | high | Baptist Health (Jacksonville) Epic partner; site embeds the Epic widget SDK from my.baptistchart.com/mychart/ (user also found this). |
| Ochsner Health System Digital Medicine | `796-5` | `https://mydigmed.ochsner.org/digitalmedicine/Authentication/Login` | `https://my.ochsner.org/PRD/` | high | mydigmed instance 404s; https://digital.ochsner.org/digital-medicine-1/ links login to https://my.ochsner.org/PRD/Authentication/Login (MyOchsner). |
| Ridgeview | `343-8` | `https://www.ridgeviewmedical.org/mychart/` | `https://mychart.ridgeviewmedical.org/mychart/` | medium | www.ridgeviewmedical.org 403s (Akamai) from here; mychart.ridgeviewmedical.org login is branded 'Ridgeview Patients:'. |
| River's Edge Hospital & Clinic | `465-8` | `https://account.allinahealth.org/dashboard/` | `https://mychart.allinahealth.org/MyChart/` | medium | Allina's MyChart login widget (content.wellclicks.com/scripts/mychart_login_widget.js) points to https://mychart.allinahealth.org/MyChart; River's Edge listed under Allina MyChart signup. |
| RiverView Health | `575-4` | `https://mychart.riverview.org/#/login` | `https://riverview.mychartcc.com/` | high | https://www.riverview.org/EHRupdate links 'Login to New MyChart' to https://riverview.mychartcc.com/Authentication/Login (Riverview-branded). |
| St. Croix Health | `465-7` | `https://account.allinahealth.org/dashboard/` | `https://www.mychartweb.com/MyChart/` | high | saintcroixhealth.org header MyChart link -> www.mychartweb.com/MyChart/Authentication/Login (Allina affiliate MyChart). |
| UW Health | `412` | `https://uwhealthmychart.org/mychart/` | `https://mychart.uwhealth.org/mychart/` | high | epicUrl redirects to the empty bare host mychart.uwhealth.org/; the /mychart/ mount there is a working UW Health login. |
| Welia Health | `465-1` | `https://account.allinahealth.org/dashboard/` | `https://www.mychartweb.com/MyChart/` | high | https://www.weliahealth.org/mychart/ links mychartweb.com/mychart and embeds its widget (Allina affiliate MyChart). |
| Western Wisconsin Health | `465-11` | `https://account.allinahealth.org/dashboard/` | `https://www.mychartweb.com/MyChart/` | high | https://www.wwhealth.org/mychart/ links www.mychartweb.com/MyChart/default.asp -> Allina affiliate login. |

### Defunct: organization or portal no longer exists

The portal is gone, usually because the organization merged. A successor is given where one exists.

| Organization | `slgId` | Epic's URL | Real URL | Confidence | Evidence |
| --- | --- | --- | --- | --- | --- |
| Department of Veterans Affairs | `985-1` | `https://www.myhealth.va.gov/mhv-portal-web/user-login` | — | medium | Columbus VA's Epic scheduling (mass.columbus.va.gov) is gone; VA moved Columbus to its new non-Epic EHR in 2022. |
| Hally | `1228` | `https://mychart.hally.com/MyChart/` | — | medium | Health Alliance ceased all lines of business Jan 1 2026 (healthalliance.org); MyChart vanity host fails TLS; no successor. |
| Metro Imaging | `575-8` | `https://mychart.metroimaging.org/app/login` | — | high | Now Mercy Imaging; portal became MyMercy (https://www.mercy.net/service/imaging-labs-and-tests/metro-imaging). mychart.metroimaging.org 301s to mercy.net/app/login (no Epic login markup). |
| St. Luke's Hospital | `905-3` | `https://www.mystlukeschart.org/MyStLukesChart/` | `https://mychart.adventhealth.com/MyChartPRD/` | medium | Now AdventHealth Polk; mystlukeschart.org NXDOMAIN; adventhealth.com/locations/hospitals/polk/patient-portal sends patients to account.adventhealth.com (custom sign-in over mychart.adventhealth.com/MyChartPRD). |
| Summit Surgical Center | `1017-2` | `https://summitsurgical.virtua.org/SummitSurgical/` | `https://secure.myvirtua.org/MyChart/` | high | virtua.org/locations/summit-surgical-center: now Virtua Voorhees Ambulatory Surgery; MyChart links to secure.myvirtua.org/MyChart. |
| University Health | `950` | `https://mychart.uhsystem.com/MyChart/` | `https://my.ochsner.org/PRD/` | medium | Ochsner LSU Health took over University Health Shreveport; uhsystem.com times out; ochsnerlsuhs.org portal link -> my.ochsner.org/PRD. |

### Epic's URL is fine

Our check failed, but the published URL works. Most of these servers leave an intermediate certificate out of their chain: browsers fetch the missing certificate, Bun/Node do not.

| Organization | `slgId` | Epic's URL | Real URL | Confidence | Evidence |
| --- | --- | --- | --- | --- | --- |
| Buffalo Medical Group | `317` | `https://www.mybmgchart.com/mychart/` | `https://www.mybmgchart.com/mychart/` | high | buffalomedicalgroup.com links it; server omits intermediate cert (Node rejects, browsers/curl fine). |
| Care New England | `893` | `https://mychart.carene.org/MyChart/` | `https://mychart.carene.org/MyChart/` | high | Works in browsers/curl; server omits DigiCert Global G2 intermediate (openssl verify 21), so Node/Bun fail. |
| Community First Medical Center | `1070` | `https://mychart.cfmedicalcenter.com/mychart/` | `https://mychart.cfmedicalcenter.com/mychart/` | medium | Real but very old classic-ASP MyChart (logincheck.asp, no RequestVerificationToken, /Authentication/Login 404) - likely unsupported by our scraper. |
| Communitycare PLAN | `763-2` | `https://mychart.mhs.net/mychartCCP/` | `https://mychart.mhs.net/mychartCCP/` | medium | curl GET follows through to a working /mychartCCP/Authentication/Login (our Bun request got 403); parent portal mychart.mhs.net/mychart (user's find) also works. |
| ETSU Health | `879-1` | `https://mychart.etsuhealth.org/community_connect/` | `https://mychart.etsuhealth.org/community_connect/` | high | Works; server omits Sectigo intermediate (Node fails, browsers fine). |
| Highland District Hospital | `319-1` | `https://mychart.hdh.org/MyChartConnect/` | `https://mychart.hdh.org/MyChartConnect/` | high | Works; server omits Sectigo intermediate (Node fails, browsers fine). |
| Lumina | `292-2` | `https://mychart.luminaimaging.com/Lumina/` | `https://mychart.luminaimaging.com/Lumina/` | high | Lumina-branded MyChart login; server omits intermediate cert (Node fails, browsers fine). |
| Spry Health | `292-1` | `https://mychart.myspry.com/MySpry/Authentication/Login` | `https://mychart.myspry.com/MySpry/` | high | Serves a Spry-branded Epic login via curl; server omits its intermediate cert (openssl verify 21), so Node/Bun fail. |
| SprySenior | `292-3` | `https://mychart.sprysenior.com/SprySenior/Authentication/Login` | `https://mychart.sprysenior.com/SprySenior/` | high | Serves a working Epic login via curl; TLS failure in Bun likely the same missing intermediate. |

### Exists, but blocked from the US

The organization's own site links to the portal, but it times out from the US. Almost certainly geo-blocking: six Dutch hospitals and an NHS trust.

| Organization | `slgId` | Epic's URL | Real URL | Confidence | Evidence |
| --- | --- | --- | --- | --- | --- |
| Amphia | `767` | `https://mijn.amphia.nl/mychart/` | `https://mijn.amphia.nl/mychart/` | medium | amphia.nl links mijn.amphia.nl (DigiD); port 443 closed from here, likely geo-blocking. |
| Ciro | `1371-1` | `https://mychart.mijnciro.nl/MyChart-Ciro-PRD/` | `https://mychart.mijnciro.nl/MyChart-CIRO-PRD/` | high | https://www.ciro-horn.nl/mijnciro links Inloggen to mychart.mijnciro.nl/MyChart-CIRO-PRD (DigiD login); times out from here (geo-block likely). |
| Elisabeth-TweeSteden Ziekenhuis | `1019` | `https://www.mijnetz.nl/mychart` | `https://www.mijnetz.nl/MyChart/` | medium | https://www.etz.nl/mijnetz/ links mijnetz.nl/MyChart/Authentication/Login; times out from the US (geo-block likely). |
| GlobalHealth Holdings | `192` | `https://myglobal.globalhealth.com/MyGlobal/` | `https://myglobal.globalhealth.com/MyGlobal/` | medium | globalhealth.com/oklahoma/myglobal/login/ links the epicUrl; host times out from here. |
| Manchester Foundation Trust | `1203` | `https://my.mft.nhs.uk/MyMFT/` | `https://my.mft.nhs.uk/MyMFT/` | high | https://mft.nhs.uk/mymft/ links my.mft.nhs.uk/MyMFT/Authentication/Login (epicUrl correct); times out from here, likely UK geo-blocking. |
| Medisch Centrum Leeuwarden | `933` | `https://www.mijnmcl.nl/mychart/` | `https://www.mijnmcl.nl/mychart/` | high | Merged into Frisius MC, whose login page still links www.mijnmcl.nl/mychart/Authentication/Login; times out from here (geo-block likely). |
| OLVG | `696` | `https://www.mijnolvg.nl/mychart-prd/` | — | medium | olvg.nl/mijnolvg directs patients to www.mijnolvg.nl / app with DigiD login; all mijnolvg.nl URLs time out from here (likely geo-blocking). |
| St Jansdal Ziekenhuis | `955` | `https://mijn.stjansdal.nl/mychart/` | — | medium | stjansdal.nl links MijnStJansdal to https://mijn.stjansdal.nl/; all mijn.stjansdal.nl URLs fail to connect from here (likely geo-blocking). |
| The Pediatric Center Boulder | `1105-1` | `https://tpcportal.bch.org/MyChartPRD-PEDS/` | — | low | thepediatriccenter.net/portal-inactivation still links tpcportal.bch.org; every path 503s from here; may be retired. BCH main portal my.bch.org/MyChartPRD works but no evidence these patients use it. |

### Custom sign-in in front of MyChart

The organization puts its own sign-in (SSO, an app, an account site) in front of MyChart. Where a direct Epic login exists behind it, it is listed, but patients are steered to the custom sign-in.

| Organization | `slgId` | Epic's URL | Real URL | Confidence | Evidence |
| --- | --- | --- | --- | --- | --- |
| AdventHealth | `1194` | `https://account.adventhealth.com/login` | `https://mychart.adventhealth.com/MyChartPRD/` | medium | account.adventhealth.com is a custom unified-portal SPA proxying MyChart; a direct AdventHealth-branded Epic login works at mychart.adventhealth.com/MyChartPRD/. |
| Alberta Health Services | `1088` | `https://myhealth.alberta.ca/MyHealthRecords` | — | high | MyChart (ex-MyAHS Connect) reached only via MyHealth Records with Alberta.ca account; Epic hosts redirect into ADFS SSO. No direct Epic login. |
| Boys Town | `575-7` | `https://www.myboystown.org/login` | — | medium | myboystown.org is a Mercy Technology Services 'MyMercy' app with its own login handing off to MyChart via SSO; no direct Epic login found. |
| District One Hospital | `465-6` | `https://account.allinahealth.org/dashboard/` | `https://mychart.allinahealth.org/MyChart/` | medium | Now Allina Health Faribault; patients steered to account.allinahealth.org; direct Epic login exists at mychart.allinahealth.org/MyChart. |
| Dubai Health | `973` | `https://services.dubaihealth.ae/Mychart` | — | high | /Mychart paths redirect to Dubai Health's IBM ISAM SSO (Dubai Health account / UAE Pass); no direct Epic login. |
| Froedtert | `453` | `https://www.mychartlink.com/mychart` | — | high | All Epic paths SAML-redirect to Froedtert's Okta (id.my.froedtert.com); no direct Epic login. |
| HealthPartners | `227` | `https://www.healthpartners.com/public/login/` | — | medium | Redirects to HealthPartners' ForgeRock sign-in; MyChart is 'part of your HealthPartners online account'; no standalone Epic host. |
| Hutchinson Health | `465-4` | `https://account.allinahealth.org/dashboard/` | `https://mychart.allinahealth.org/mychart/` | low | hutchhealth.com now redirects to HealthPartners (Hutchinson is part of HealthPartners), whose sign-in is ForgeRock with no direct MyChart; unclear if Allina MyChart still applies. |
| Kaiser Permanente | `459` | `https://healthy.kaiserpermanente.org/consumer-sign-on` | — | high | Redirects to KP's own OAuth (identityauth.kaiserpermanente.org); no public Epic MyChart login. |
| King Fahad Medical City | `1107` | `https://www.kfmc.med.sa/EN/Pages/Home.aspx` | — | medium | Homepage links patient.kfmc.med.sa, a custom portal with Nafath SSO; no Epic MyChart login found. |
| MTS | `575-6` | `https://www.mtsmychart.com/#/login` | — | medium | Redirects to Mercy's custom 'MyMercy' Angular app; no direct Epic login found. |
| Mercy | `580` | `https://www.mymercy.net/#/login` | — | medium | Redirects to Mercy's own 'MyMercy' app; mychart.mercy.net port 443 closed from here; no direct Epic login confirmed. |
| Presbyterian Healthcare Services | `416` | `https://mypres.phs.org/Pages/default.aspx` | — | high | phs.org says MyChart is reached through myPRES; mypres.phs.org and mychart.phs.org/MyChart/ both redirect to ds.phs.org SSO. No direct Epic login. |
| Sentara Health | `531` | `https://myhealth.sentara.com/Login/Login.aspx` | `https://mychart.sentara.com/MyChart/` | medium | mychart.sentara.com/MyChart/Authentication/Login redirects to an Epic OpenId hand-off to Sentara's OAuth (sentara.com/am/oauth2/authorize); check passes only on the hand-off page's token. No direct username/password form. |
| Stanford | `541` | `https://myhealth.stanfordhealthcare.org/` | — | high | MyHealth is a custom front end over SSO-only mychart.stanfordhealthcare.org/myhealth_sso/; no direct Epic password login. |
| Tahoe Forest Health System | `575-5` | `https://mychart.tfhd.com/#/login` | — | high | Sign In goes to Mercy's 'MyMercy' custom app; no direct Epic login. |
| UPMC | `261` | `https://myupmc.upmc.com/myupmc/login` | — | high | MyUPMC is a custom app embedding Epic pages behind SAML; no direct Epic password login. |

### Corrections the resolver made

The 18 automatic corrections were checked the same way; 17 are confirmed by the page's own sign-in link or the portal's branding. Two notes:

- **Evangelical Community Hospital** (`223-4`) → `my.wellspan.org/MyWellSpan/`. The page Epic points to also links Geisinger's MyChart (`mychart.mycarecompass.org`), which holds Evangelical's records from its 2022 move to Epic until the merger; WellSpan tells current patients to use MyWellSpan and to link the two ([WellSpan](https://www.wellspan.org/WellSpan-Evangelical-Community-Hospital-Patient-Resources)).
- **Baylor Scott & White** (`856`) → `mychart.bswhealth.com/fa/` serves a MyBSWHealth-branded login, but the system's real sign-in is a custom page; unverified with an account.

## Missing from Epic's directory

Searched for portals the directory doesn't list: Epic's FHIR endpoint list (`open.epic.com/Endpoints/R4` and `/Endpoints/Brands`, 457 organizations, fuzzy-matched against directory names and aliases), every country Epic lists a presence in, go-live news for 2023–2026, login-page title patterns (`"MyCare - Login Page"`, `"Connect - Login Page"`…), student health centers, and a DNS + HTTP sweep of 13,017 likely subdomains (`my.`, `portal.`, `connect.`, `mycare.`…) across the 688 domains the directory uses. A portal counted only if it serves Epic login markup and its host isn't in the directory. Certificate-transparency logs (crt.sh) were down for wildcard searches throughout.

**The directory is very nearly complete.** No large US system was missing, nor anything in the Netherlands, Belgium, Switzerland, Denmark, Finland, Norway or the UK beyond one trust. What was missing is recent or niche; each is an `addition`:

| Organization | Portal | Source |
| --- | --- | --- |
| My NSW Health | `https://mynswhealth.health.nsw.gov.au/MNH/` | health.nsw.gov.au/single-digital-patient-record/Pages/patients.aspx; in pilot, Hunter New England LHD first. |
| Royal National Orthopaedic Hospital | `https://mycare.rnoh.nhs.uk/RNOHMyCare/` | rnoh.nhs.uk/services/mycare-rnoh; live on Epic since November 2025. |
| Orthopaedic Institute for Children | `https://oic.mednet.ucla.edu/MychartConnect/` | The login page names 'Orthopaedic Institute for Children (OIC) myHealth' (UCLA Community Connect). |
| UCLA Ashe Center | `https://mystudentchart.sdh.ucla.edu/Ashe/` | studenthealth.ucla.edu/epic; moved to Epic July 2025. |
| UT Health Rio Grande Valley | `https://utrgv.utmb.edu/utrgv/` | uthealthrgv.org/epic-transition links this login; on Epic since November 2024, hosted on UTMB's server. |
| Penn State Health | `https://mychart.pennstatehealth.org/Mychart/` | pennstatehealth.org: MyChart launching systemwide October 2026. |

**Seventeen listed organizations have a second hostname** the directory doesn't carry — sometimes the one patients now use (Northwestern's is `mynm.nm.org`; Epic lists the older `mychart.cdh.org`). Each is an `extraHosts` entry, so search finds the organization by it and password import recognises a password saved there: none of these names reads like a portal, so the import's probe would never have tried them.

| Organization | `slgId` | Extra hostname |
| --- | --- | --- |
| Northwestern Medicine | `650` | `mynm.nm.org` |
| Columbia University Irving Medical Center | `1089-3` | `connect.doctors.columbia.edu` |
| El Camino Health | `920` | `mycare.elcaminohealth.org` |
| Monument Health | `1004` | `mychart.monument.health` |
| University Health System | `1130` | `mychart.universityhealth.com` |
| Lifespan | `895` | `my.lifespan.org` |
| CommonSpirit Mountain Region | `942` | `mountain.mycommonspirit.org` |
| Thomas Jefferson University Health System | `957` | `my.jeffersonhealth.org` |
| VHC Health | `1039` | `myvhc.vhchealth.org` |
| Children's Nebraska | `553` | `connect.childrensnebraska.org` |
| UTHealth Houston | `1178` | `www.myuthealthhouston.org` |
| UMC Southern Nevada | `1023` | `umconlinecare.umcsn.com` |
| Alameda Health System | `1075` | `www.my-ahs.org` |
| WellSpan | `975` | `my.wellspan.org` |
| Bon Secours Health System | `742-5` | `my.bonsecours.com` |
| Emplify Health | `605` | `mycare.gundersenhealth.org` |
| Dartmouth | `722` | `portal.mydh.org` |

Left out: `www.mijntjongerschans.nl` (times out from the US, like the directory's own Frisian hospital) and `mystudentchart.uci.edu` (goes straight to UCI's single sign-on). Sharp HealthCare publishes an Epic FHIR endpoint but its portal is still FollowMyHealth.
