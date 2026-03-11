


import { RequestConfig } from "../types";
import { MockData } from "./types";


// TODO: In the future we could add checks to make sure the credentials are correct and return a different response if they're not correct.
// This endpoint 302s a few times and then the final result ends up with HTML.
// This could be replaced to be multiple different mock data for each 302 that would be more accurate.
export const doLogin: MockData = {
  path: ['/MyChartPRD/Authentication/Login/DoLogin'],
  handle: async (_: string, config: RequestConfig): Promise<Response> => {

    const url = new URL(`https://example.com?${config.body}`);
    const loginInfo = url.searchParams.get('LoginInfo');

    const body = JSON.parse(loginInfo!)

    const user = atob(body.Credentials.Username)
    const pass = atob(body.Credentials.Password)

    if (user !== 'mock_username' || pass !== 'mock_password_valid') {
      console.log("MOCK server, returing login failed", user, pass)
      return new Response(` login failed</div>`)
    }


    if (user === 'mock_username' && pass === 'mock_password_valid') {
      console.log("MOCK server, returing secondary validation", user, pass)
      return new Response(` secondaryvalidationcontroller
    
        <input name="__RequestVerificationToken" type="hidden" value="qmpggc8W7pwFFxM57sZeLbbLg3yTWkWqZy8Z_LFY1WohPUvEksk6qdx3L1VNkPtBoM7qJzE7CdWl7jWXCdi74_bQs2Y1" /></div>
    `)
    }

    // console.log()

    throw new Error('unsure which mock ldfjdlkasjfls' + user + ' ' + pass)
  }
}


export const secondaryValidation: MockData = {
  path: ['/MyChartPRD/Authentication/SecondaryValidation'],
  response: new Response(` fdklsajflks
    
    <input name="__RequestVerificationToken" type="hidden" value="qmpggc8W7pwFFxM57sZeLbbLg3yTWkWqZy8Z_LFY1WohPUvEksk6qdx3L1VNkPtBoM7qJzE7CdWl7jWXCdi74_bQs2Y1" /></div>

    `)
}

// This could also have cases where if you pass in the wrong code it returns success:false in some area or whatever it does in production.
export const validate2faCode: MockData = {
  path: ['/MyChartPRD/Authentication/SecondaryValidation/Validate'],
  handle: async (_: string, config: RequestConfig): Promise<Response> => {
    if (config.body!.includes('123456')) {
      return new Response(JSON.stringify({ Success: true }));
    } else {
      // there's more fields here too
      return new Response(JSON.stringify({ Success: false, TwoFactorCodeFailReason: 'codewrong' }));
    }
  },
}


// TODO: In the future we could add checks to make sure the credentials are correct and return a different response if they're not correct.
export const home: MockData = {
  path: ['/MyChartPRD/Home'],
  response: new Response(`wow its a valid response, also here's some data from the html Name:
    <div class="printheader">
    Name: John Doe | DOB: 01/01/1999 | MRN: 123456 | PCP: Dr. Smith
    </div>
    `)
}

// TODO: In the future we could add checks to make sure the credentials are correct and return a different response if they're not correct.
export const secondaryValidationSMSConsent: MockData = {
  path: ['/MyChartPRD/Authentication/SecondaryValidation/GetSMSConsentStrings'],
  response: new Response(` ??? `)
}

// TODO: In the future we could add checks to make sure the credentials are correct and return a different response if they're not correct.
export const smsVerification: MockData = {
  path: ['/MyChartPRD/Authentication/SecondaryValidation/SendCode'],
  response: new Response(` i sent a code to the user `)
}

// TODO: In the future we could add checks to make sure the credentials are correct and return a different response if they're not correct.
export const insideASP: MockData = {
  path: ['/MyChartPRD/inside.asp'],
  response: new Response(` prlly should be some html here `)
}


export const login: MockData = {
  path: ['/MyChartPRD/Authentication/Login'],
  response: new Response(`


	<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
	<html xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en" dir="ltr" class="notile">
	<head>
		<title>MyChart - Login Page</title>
		<link rel="canonical" href="https://mychart.cvshealth.com/MyChartPRD/Authentication/Login" />
		<meta http-equiv="content-type" content="text/html; charset=utf-8" />
		<meta http-equiv="X-UA-Compatible" content="IE=edge" />
		<meta property="og:title" content="MyChart - Login Page" />
		<meta property="og:image" content="/MyChartPRD/en-US/images/MyChart_city.png" />
		<meta property="og:site_name" content="CVS Health &amp; MinuteClinic" />
			<meta name="apple-itunes-app" content="app-id=382952264, app-argument=epicmychart://orgselect?orgID=921" />
		<meta name="format-detection" content="telephone=no" />
					<noscript><meta http-equiv="refresh" content="0;url=/MyChartPRD/nojs.asp" /></noscript>



		<link rel="icon" href="/MyChartPRD/en-US/images/favicon.ico" type="image/x-icon" />
		<link type="text/css" rel="stylesheet" media="All" href="/MyChartPRD/localization/requiredoptionalindicators?updateDt=1738945968" />
<link type="text/css" rel="stylesheet" media="All" href="/MyChartPRD/en-us/styles/common.css?updateDt=1738945951" />
<link type="text/css" rel="stylesheet" media="All" href="/MyChartPRD/en-us/styles/prelogin.css?updateDt=1738945955" />
<link type="text/css" rel="stylesheet" media="All" href="/MyChartPRD/en-us/styles/menu.css?updateDt=1738945952" />
<link type="text/css" rel="stylesheet" media="All" href="/MyChartPRD/en-us/styles/mobile_responsivemenu.css?updateDt=1738945952" />
<link type="text/css" rel="stylesheet" media="All" href="/MyChartPRD/en-us/styles/component.css?updateDt=1738945951" />
<link type="text/css" rel="stylesheet" media="All" href="/MyChartPRD/en-us/styles/colors.css?updateDt=1738945951" />
<link type="text/css" rel="stylesheet" media="All" href="/MyChartPRD/en-us/styles/themes.css?updateDt=1738945956" />
<link type="text/css" rel="stylesheet" media="All" href="/MyChartPRD/en-us/styles/externalcolors.css?updateDt=1730758842" />
<link type="text/css" rel="stylesheet" media="All" href="/MyChartPRD/en-us/styles/calendars.css?updateDt=1738945950" />
<link type="text/css" rel="alternate stylesheet" media="All" href="/MyChartPRD/en-us/styles/highcontrast.css?updateDt=1738945954" disabled="" title="High Contrast"  />

<link href="/MyChartPRD/en-US/styles/bundles/sdk?v=uJzoyeqS0As9pm3CNGMq6OxpIUZN_RBvR7oGCZhAfiU1" rel="stylesheet"/>



		<!-- Include responsive resources when appropriate -->
<meta name="viewport" content="initial-scale=1, width=device-width" />
<link type="text/css" rel="stylesheet" media="All" href="/MyChartPRD/en-us/styles/mobile_responsivesite.css?updateDt=1738945952" />
<link type="text/css" rel="stylesheet" media="All" href="/MyChartPRD/en-us/styles/mobile_gridadapter.css?updateDt=1738945952" />

		<link type="text/css" rel="stylesheet" media="All" href="/MyChartPRD/en-us/styles/override.css?updateDt=1652810782" />
<link type="text/css" rel="stylesheet" media="Print" href="/MyChartPRD/en-us/styles/print.css?updateDt=1738945955" />


				<!--anti click-jacking script-->
				<style nonce='852cbc2b53d948168bc1c6f318c1f585' type="text/css" id="initialBodyClass">html {background: none !important;} body {display: none !important;}</style>
				<script nonce='852cbc2b53d948168bc1c6f318c1f585' type="text/javascript">
					if (self === top)
					{
						var InitialBodyClass = document.getElementById("initialBodyClass");
						if (InitialBodyClass)
						{
							InitialBodyClass.parentNode.removeChild(InitialBodyClass);
						}
					}
					else
					{
						top.location = "/MyChartPRD/Home/LogOut";
					}
				</script>
				<!--end anti click-jacking script-->
				<script nonce='852cbc2b53d948168bc1c6f318c1f585' type="application/ld+json">
				{
					"@context" : "https://schema.org",
					"@type" : "WebSite",
					"name" : "CVS Health & MinuteClinic",
					"url" : "https://mychart.cvshealth.com/MyChartPRD/Authentication/Login",
					"alternateName" : ["CVS Health & MinuteClinic MyChart", "MyChart", "CHM MyChart", "CHM"]}
				</script>

					<script nonce='852cbc2b53d948168bc1c6f318c1f585' type='text/javascript'>
						if (typeof WP === 'undefined') {
							WP = {};
						}
						WP.myPath = '/MyChartPRD/';
					</script>
	</head>
	<body class="loginPage  isPrelogin hasNoCommunityLinks color1 md_login_login" =>
		<div id="mychartHiddenImage" class="hidden"><img id="hiddenImage" alt="" src="/MyChartPRD/en-US/images/MyChart_city.png"></img></div>

<div id="jsdisabled" class="overlay"><div class="lightbox_overlay"></div><div class="jsdisabled"><p><span class='clearlabel'>Error: </span>Please enable JavaScript in your browser before using this site.</p></div><script nonce='852cbc2b53d948168bc1c6f318c1f585' type='text/javascript'>document.getElementById('jsdisabled').style.display = 'none';</script></div>		<div id ="appPopupRoot" class="overlayContainer"></div>
<div id = "classicPopupRoot" class="overlayContainer">
<div id = "onboarding-content" class="jqHidden"></div>
<div id="lightbox" class="lb_content jqHidden"></div>
<div id="lightbox_overlay" class="lightbox_overlay lb_overlay jqHidden" onclick="$$WP.Utilities.HideLightbox(this);"></div>
</div>




		<div id="wrap" data-hide-during-popup="true">
			<div class='hidden' id='__CSRFContainer'><input name="__RequestVerificationToken" type="hidden" value="qmpggc8W7pwFFxM57sZeLbbLg3yTWkWqZy8Z_LFY1WohPUvEksk6qdx3L1VNkPtBoM7qJzE7CdWl7jWXCdi74_bQs2Y1" /></div>




			<div id="toastWrapper" class="fitme width animToast" role="status" aria-live="polite" aria-atomic="true"></div>
			<div id="content" class="hasSidebar">
					<main id="main">
							<a href="/MyChartPRD/" class="logo" title="" aria-label="MyChart - Your secure online health connection"></a>































	<div id="LoginNoCookies">
		<div id="noCookies" class="noCookies jqHidden">
			<div class="verticalCenter">
				<div class="icon"></div>
				<div>
					<p id="noCookiesButtonContainer">
						<a href="#" target="_top" id="noCookiesButton" role="button" class="button">Sign in to MyChart</a>
					</p>
				</div>
			</div>
		</div>
		<div id="noCookiesError" class="noCookies jqHidden">


			<div class="verticalCenter">
				<div class="icon"></div>
				<div>
					<span>
						<span class='clearlabel'>Error: </span>Please <a href="/MyChartPRD/Help/Cookies" target="_blank">enable cookies</a> to log in to MyChart.
					</span>
				</div>
			</div>
		</div>
	</div>


	<div class="mainLoginContent beforeLoginFields">
	</div>



						<div id="appRoot" class="section"></div>
						<div role="alert" class="ajaxspinner defaultajaxoverlay hidden"><div class="loadingmessage">Loading...<div class="loadingHeart"></div></div></div>
					</main> 									<aside id="sidebar">










				<div class="loginAlerts">
		<div class="errorMessage" id="loginErrorMessage">
			<span class="alert card hidden ">
				<img id="WarningIcon" alt="" src="/MyChartPRD/en-US/images/warning.png" />
				<span id="errorMessage"></span>
			</span>
		</div>
	</div>


			<p class="pretext"><h2 class="header center" style="text-align: left;">Sign in to your <br> MyChart account</h2>
<p style="text-align:center;">This is distinct from your CVS.com account.</p>
<style>

div.login a.button
{
display:none;
}


</style>
</p>		<div class="login">
	<form autocomplete="off" method="post" action="#" id="loginForm" target="_top">
		<div class="formcontents">
			<input class="hidden" type="hidden" id="jsenabled" name="jsenabled" value="0" autocomplete="off">
	<div class="legacyLabelledField">
		<label for="Login" class="required">MyChart Username</label>
		<input data-permissive="true" class="jsreq withAutoComplete" type="text" id="Login" name="Login" maxlength="128" autocomplete="username" aria-describedby="errorMessage">
	</div>
	<div class="legacyLabelledField">
		<label for="Password" class="required">Password</label>
		<input class="jsreq withAutoComplete" type="password" id="Password" name="Password" autocomplete="current-password" aria-describedby="errorMessage">
	</div>

			<input class="button tall jsreq completeworkflow" type="submit" name="submit" id="submit" value="Sign in" title="" autocomplete="off" disabled>
			<div class="recovery">
				<a href=/MyChartPRD/recoverlogin.asp >Forgot username?</a>
				<a href=/MyChartPRD/passwordreset.asp >Forgot password?</a>
			</div>
	<form method="post" action="#" id="loginForm" class="withAutoComplete" target="_top">
				<div id="invisibleCaptchaContainer" class="loginCaptcha"></div>

		</div>
	</form>
<form Class="hidden" action="/MyChartPRD/Authentication/Login/DoLogin" autocomplete="off" id="actualLogin" method="post" target="_top"><input name="__RequestVerificationToken" type="hidden" value="qmpggc8W7pwFFxM57sZeLbbLg3yTWkWqZy8Z_LFY1WohPUvEksk6qdx3L1VNkPtBoM7qJzE7CdWl7jWXCdi74_bQs2Y1" />		<div class="formcontents">
		</div>
</form>

			<a class="button tall " title="Click here to sign in with CVSHEALTH" role="button" href=/MyChartPRD/Authentication/Saml/Login?idp=CVSHEALTH&amp;forceAuthn=False>Sign in with CVSHEALTH</a>
			<a class="button tall " title="Click here to sign in with CVSCAREMARK" role="button" href=/MyChartPRD/Authentication/Saml/Login?idp=CVSCAREMARK&amp;forceAuthn=False>Sign in with CVSCAREMARK</a>

		</div>
	<div class="signup">
		<h2 class="header center">New User?</h2>
		<a class="button tall newworkflow" role="button" href="/MyChartPRD/accesscheck.asp" >Sign up now</a>
	</div>
<p class="posttext"><a id="CVSSIGNUP" class="button tall" href="/MyChartPRD/Signup">Create an account</a>
<a id="CVSMINORRESULTS" class="button tall" href="/MyChartPRD/MinorTestResults.pdf">Looking for COVID results for a minor?</a>
<a id="CVSSIGNUP" class="button tall" href="/MyChartPRD/accesscheck.asp">Have an activation code? Click here</a>
<a id="CVSSIGNUP" class="button tall" href="/MyChartPRD/billing/guestpay">Coram pay as guest</a>
<p style="font-size: 14px;"><b>Questions about MyChart?</b>
<ul style="font-size: 14px;"><li>MinuteClinic patients call 1-866-389-ASAP (2727)</li>
</ul></p>
<ul style="font-size: 14px;"><li>Coram patients call 1-800-718-5031</li>
</ul></p></p>
	<div class="mainLoginContent afterLoginFields">
			<div class="mainLoginContentBody">

<iframe class="loginiframe" style="border: 0;height: 1000px;width: 1000px;" src="../index.html"></iframe>		</div>
	</div>


					</aside>
				<footer id="footer"><div id="mainFooter" class="mainStyle"></div><div id="sidebarFooter" class="sidebarStyle"><div id="mychart_by_epic_logo_wrapper"><img id="mychart_by_epic_logo" src="/MyChartPRD/en-US/images/MyChartByEpic_inline_dark.svg"></img></div><div class="copyright" lang="en"><a target='_top' href="/MyChartPRD/Authentication/Login?mode=stdfile&amp;option=epiccopyright"><span class='copystring'>MyChart&reg; licensed from Epic Systems Corporation</span> <span class='copyyear'>&copy; 1999 - 2025</span></a></div></div></footer>			</div>
		</div>
		<div id="_coreScripts" class="hidden">
			<script src="/MyChartPRD/scripts/external/jquery.min.js?updateDt=1673913530" type="text/javascript"></script>
<script src="/MyChartPRD/scripts/utilities/jqwrappers.min.js?updateDt=1688330268" type="text/javascript"></script>
<script src="/MyChartPRD/scripts/utilities/jqueryextensions.min.js?updateDt=1688330268" type="text/javascript"></script>
<script src="/MyChartPRD/scripts/external/handlebars.runtime.min.js?updateDt=1673913530" type="text/javascript"></script>
<script src="/MyChartPRD/bundles/core-1-pre?v=viUF9Oi3uBqOhoqb3fMlyvb2Th9Rbv-pNNkLe63jZtw1"></script>

<script src="/MyChartPRD/scripts/ui_framework/core/uiframeworkbindings.min.js?updateDt=1688330268" type="text/javascript"></script>
<script src="/MyChartPRD/debug/debugsettings?updateDt=1709748092" type="text/javascript"></script>
<script src="/MyChartPRD/localization/formats?lang=en-us&amp;updateDt=1709748092" type="text/javascript"></script>
<script src="/MyChartPRD/context/webserversettings?updateDt=1709748092" type="text/javascript"></script>
<script src="/MyChartPRD/bundles/core-2-en-US?v=fq3fsSfOPB5dYOyjVPzRDCoxpwUr5dNpW5lzvKIzK8c1"></script>

<script nonce='852cbc2b53d948168bc1c6f318c1f585' type='text/javascript'>
$$WP.Strings.addMnemonic("@MYCHART@DATE@",HTMLUnencode("Saturday, February 15, 2025"), false, "Global");
$$WP.Strings.addMnemonic("@MYCHART@TIME@",HTMLUnencode("6:38:05 PM"), false, "Global");
$$WP.Strings.addMnemonic("@MYCHART@CURRENT_YEAR@",HTMLUnencode("2025"), false, "Global");
$$WP.Strings.addMnemonic("@MYCHART@BrandECheckIn@",HTMLUnencode(""), false, "Global");
$$WP.Strings.addMnemonic("@MYCHART@BrandEOLPlanning@",HTMLUnencode(""), false, "Global");
$$WP.Strings.addMnemonic("@MYCHART@BrandVideoVisits@",HTMLUnencode(""), false, "Global");
$$WP.Strings.addMnemonic("@MYCHART@EVisit@",HTMLUnencode("E-Clinic"), false, "Global");
$$WP.Strings.addMnemonic("@MYCHART@BrandEVisit@",HTMLUnencode("E-Clinic"), false, "Global");
$$WP.Strings.addMnemonic("@MYCHART@BrandEDSelfRegistration@",HTMLUnencode(""), false, "Global");
$$WP.Strings.addMnemonic("@MYCHART@APPTITLE@","MyChart", false, "Global", $$WP.Strings.EncodingTypes.None)
$$WP.Strings.addMnemonic("@MYCHART@ABSOLUTEURL@",HTMLUnencode("/MyChartPRD/"), false, "Global");
$$WP.Strings.addMnemonic("@MYCHART@LOCALIZEDURL@",HTMLUnencode("/MyChartPRD/en-US/"), false, "Global");
$$WP.Strings.addMnemonic("@MYCHART@HELPDESKPHONE@","<span dir='ltr'><a href='tel:1866389'>1-866-389</a>-ASAP (2727)</span>", false, "Global", $$WP.Strings.EncodingTypes.None)
$$WP.Strings.addMnemonic("@MYCHART@SCHEDULINGPHONE@","<span dir='ltr'><a href='tel:1866389'>1-866-389</a>-ASAP (2727)</span>", false, "Global", $$WP.Strings.EncodingTypes.None)
$$WP.Strings.addMnemonic("@MYCHART@EMERGENCYPHONE@","<span dir='ltr'><a href='tel:1866389'>1-866-389</a>-ASAP (2727)</span>", false, "Global", $$WP.Strings.EncodingTypes.None)
$$WP.Strings.addMnemonic("@MYCHART@BILLINGPHONE@","<span dir='ltr'><a href='tel:1866389'>1-866-389</a>-ASAP (2727)</span>", false, "Global", $$WP.Strings.EncodingTypes.None)
$$WP.Strings.addMnemonic("@MYCHART@HELPEMAIL@",HTMLUnencode("MyChartSupport@DoNotUse.DoNotUse"), false, "Global");
$$WP.Strings.addMnemonic("@MYCHART@PATIENT@",HTMLUnencode("&nbsp;"), false, "Global");
$$WP.Strings.addMnemonic("@MYCHART@PROXY@",HTMLUnencode("&nbsp;"), false, "Global");
$$WP.Strings.addMnemonic("@MYCHART@WEBUSER@",HTMLUnencode("&nbsp;"), false, "Global");
$$WP.Strings.addMnemonic("@MYCHART@PATIENTLEGALNAME@",HTMLUnencode("&nbsp;"), false, "Global");
$$WP.Strings.addMnemonic("@MYCHART@WEBUSERLEGALNAME@",HTMLUnencode("&nbsp;"), false, "Global");
$$WP.Strings.addMnemonic("@MYCHART@MRN@",HTMLUnencode("&nbsp;"), false, "Global");
$$WP.Strings.addMnemonic("@MYCHART@DOB@",HTMLUnencode("&nbsp;"), false, "Global");
$$WP.Strings.addMnemonic("@MYCHART@PCP@",HTMLUnencode("&nbsp;"), false, "Global");
$$WP.Strings.addMnemonic("@MYCHART@SSNFORMAT@",HTMLUnencode("NNN-NN-NNNN"), false, "Global");
$$WP.Strings.addMnemonic("@MYCHART@NationalIDLabel@",HTMLUnencode("Social Security number"), false, "Global");
$$WP.Strings.addMnemonic("@MYCHART@NationalIDShortLabel@",HTMLUnencode("SSN"), false, "Global");
$$WP.Strings.addMnemonic("@MYCHART@CURRENCYSYMBOL@",HTMLUnencode("$"), false, "Global");
$$WP.Strings.addMnemonic("@MYCHART@CURRENCYCODE@",HTMLUnencode("USD"), false, "Global");
</script>

<script src="/MyChartPRD/bundles/core-3-en-US?v=u8Y5vgLxduxG2LkAL-Vl5IethY5ml00HggFh9pk7-AE1"></script>

<script src="/MyChartPRD/bundles/core-4-header?v=9-zsiMqKIsBE4ZJCy-zaur_5rHPVyp7EWqFs8uNf6_s1"></script>

<script nonce='852cbc2b53d948168bc1c6f318c1f585' type='text/javascript'>
$$WP.I18N.AllLocales = $$WP.I18N.Locale.createModelCollection();
$$WP.I18N.Locale.convertRawLocales({"en-US":{"Direction":1,"Language":"EN","ForceMetricUnits":false,"PrimaryLocaleName":"en-US","NationalIDLabel":"Social Security number","NationalIDShortLabel":"SSN","DateSeparator":"/","TimeSeparator":":","Is24HourTime":false,"FirstDayOfTheWeek":1,"DecimalSeparator":".","GroupSeparator":",","RangeSeparator":" - ","DecimalPlaces":"2","GroupSize":"3","NegativePattern":"-n","CurrencySymbol":"$","CurrencyCode":"USD","CurrencyDecimalPlaces":"2","CurrencyGroupSize":"3","CurrencyPositivePattern":"$n","CurrencyNegativePattern":"-$n","PercentSymbol":"%","ListSeparator":",","ListSpaces":1}}, $$WP.I18N.AllLocales);
var locale = $$WP.I18N.getMyChartLocale();
var tmp = $$WP.I18N.AllLocales.getFromIndex('Identifier', locale);
if (tmp === null) { $$WP.Debug.logError('Unable to load locale "' + locale + '" from $$WP.I18N.AllLocales.'); tmp = new $$WP.I18N.Locale(); }
$$WP.CurrentLocale = tmp.toRawObject();
</script>

<script src="/MyChartPRD/bundles/core-5-en-US?v=My0X4ar210oxpMg-HRgABuhlxSUea77t42t9FkWefis1"></script>

<script nonce='852cbc2b53d948168bc1c6f318c1f585' type='text/javascript'>
if (typeof $$WP === 'undefined') {$$WP = {};}
$$WP.Settings = $$WP.Settings || {};
$$WP.Settings.WebsiteUrl = '/MyChartPRD/';
$$WP.Settings.PublicDomain = 'https://mychart.cvshealth.com';
$$WP.Settings.WebsiteName = 'CVS';
$$WP.Settings.WebAnalyticsEnabled = 'False';
$$WP.Settings.DrivingDirectionsUrlTemplate = '';
$$WP.Settings.IsDrivingDirectionsConsentEnabled =  'False';
</script>


<script nonce='852cbc2b53d948168bc1c6f318c1f585' type='text/javascript'>
EpicPx = EpicPx || {}; EpicPx.ReactContext = EpicPx.ReactContext || {};
EpicPx.ReactContext.user = EpicPx.ReactContext.user || {};
EpicPx.ReactContext.isUserUnknown = true;
EpicPx.ReactContext.patient = EpicPx.ReactContext.patient || {};
EpicPx.ReactContext.isPatientUnknown = true;
EpicPx.ReactContext.locale = EpicPx.ReactContext.locale || {};
EpicPx.ReactContext.locale.systemLocale = EpicPx.ReactContext.locale.systemLocale || {};
EpicPx.ReactContext.locale.systemLocale.identifier = "english";
EpicPx.ReactContext.locale.systemLocale.name = "en-US";
EpicPx.ReactContext.locale.systemLocale.timeZoneIdentifier = "America/New_York";
EpicPx.ReactContext.locale.systemLocale.currencyCode = "USD"
EpicPx.ReactContext.locale.userLocale = EpicPx.ReactContext.locale.userLocale || {};
EpicPx.ReactContext.locale.userLocale.identifier = "english";
EpicPx.ReactContext.locale.userLocale.name = "en-US";
EpicPx.ReactContext.locale.userLocale.weekdays = EpicPx.ReactContext.locale.userLocale.weekdays || [];
EpicPx.ReactContext.locale.userLocale.weekdays.push({order:1,name:"Sunday",abbreviation:"Sun"});
EpicPx.ReactContext.locale.userLocale.weekdays.push({order:2,name:"Monday",abbreviation:"Mon"});
EpicPx.ReactContext.locale.userLocale.weekdays.push({order:3,name:"Tuesday",abbreviation:"Tue"});
EpicPx.ReactContext.locale.userLocale.weekdays.push({order:4,name:"Wednesday",abbreviation:"Wed"});
EpicPx.ReactContext.locale.userLocale.weekdays.push({order:5,name:"Thursday",abbreviation:"Thu"});
EpicPx.ReactContext.locale.userLocale.weekdays.push({order:6,name:"Friday",abbreviation:"Fri"});
EpicPx.ReactContext.locale.userLocale.weekdays.push({order:7,name:"Saturday",abbreviation:"Sat"});
EpicPx.ReactContext.locale.userLocale.months = EpicPx.ReactContext.locale.userLocale.months || [];
EpicPx.ReactContext.locale.userLocale.months.push({order:1,name:"January",abbreviation:"Jan"});
EpicPx.ReactContext.locale.userLocale.months.push({order:2,name:"February",abbreviation:"Feb"});
EpicPx.ReactContext.locale.userLocale.months.push({order:3,name:"March",abbreviation:"Mar"});
EpicPx.ReactContext.locale.userLocale.months.push({order:4,name:"April",abbreviation:"Apr"});
EpicPx.ReactContext.locale.userLocale.months.push({order:5,name:"May",abbreviation:"May"});
EpicPx.ReactContext.locale.userLocale.months.push({order:6,name:"June",abbreviation:"Jun"});
EpicPx.ReactContext.locale.userLocale.months.push({order:7,name:"July",abbreviation:"Jul"});
EpicPx.ReactContext.locale.userLocale.months.push({order:8,name:"August",abbreviation:"Aug"});
EpicPx.ReactContext.locale.userLocale.months.push({order:9,name:"September",abbreviation:"Sep"});
EpicPx.ReactContext.locale.userLocale.months.push({order:10,name:"October",abbreviation:"Oct"});
EpicPx.ReactContext.locale.userLocale.months.push({order:11,name:"November",abbreviation:"Nov"});
EpicPx.ReactContext.locale.userLocale.months.push({order:12,name:"December",abbreviation:"Dec"});
EpicPx.ReactContext.platform = EpicPx.ReactContext.platform || {};
EpicPx.ReactContext.platform.application = "MyChart-Web";
EpicPx.ReactContext.platform.isMobileDevice = !!WP.DOM.Browser.isMobile;
EpicPx.ReactContext.platform.isMobileOptimized = false;
EpicPx.ReactContext.platform.websiteUrl = "/MyChartPRD/";
EpicPx.ReactContext.platform.publicDomain = "https://mychart.cvshealth.com";
EpicPx.ReactContext.platform.isDebugMode = (false);
EpicPx.ReactContext.platform.enablePerformanceMonitoring = (true);
EpicPx.ReactContext.platform.isSinglePageApp = false;
EpicPx.ReactContext.platform.isWidget = ($$WP.WidgetMode === true);
EpicPx.ReactContext.platform.subjectTitleIndicator = "\u003cspan class="subjectIndicator"\u003e\u003c/span\u003e";
EpicPx.ReactContext.personalizations = EpicPx.ReactContext.personalizations || {};
EpicPx.scriptSources = [
"scripts/external/polyfill.js?updateDt=1687329674",
"scripts/external/js-joda.min.js?updateDt=1666383764",
"scripts/external/js-joda-timezone.min.js?updateDt=1666383764",
"scripts/external/react-libs.min.js?updateDt=1706384532",
"scripts/lib/shared/epic-px-kit-async.bundle.js?updateDt=1733939712",
"scripts/lib/shared/epic-px-sdk-async.bundle.js?updateDt=1733939696",
"scripts/lib/shared/epic-px-kit.bundle.js?updateDt=1733939694",
"scripts/lib/shared/epic-px-form.bundle.js?updateDt=1711558984",
"scripts/lib/shared/mychart-client-async.bundle.js?updateDt=1733939698",
"scripts/lib/shared/epic-px-sdk.bundle.js?updateDt=1733939626",
"scripts/lib/shared/mychart-client.bundle.js?updateDt=1712288548",
]
EpicPx.scriptUpdates = {
'access-logs-async': 1706904408,'access-logs': 1706904408,'account-management-async': 1706904408,'account-management': 1706904408,'action-previews-async': 1711548426,'action-previews': 1711548426,'activation-async': 1712097410,'activation': 1711578964,'address-async': 1711467100,'address': 1711467100,'allergies-async': 1733939688,'allergies': 1733939656,'attachments-async': 1706904408,'attachments': 1706904408,'auto-sync-async': 1710862232,'auto-sync': 1710862232,'auto-update-settings-async': 1706904408,'auto-update-settings': 1706904408,'bedside-checklist-async': 1711891164,'bedside-checklist': 1711891164,'bedside-homepage-async': 1733939688,'bedside-homepage': 1733939652,'bedside-info-async': 1733939738,'bedside-info': 1733939738,'bedside-messages-async': 1733939764,'bedside-messages': 1733939632,'bedside-provisioning-async': 1706904408,'bedside-provisioning': 1706904408,'bedside-requests-async': 1706904408,'bedside-requests': 1706904408,'bedside-tv-client-async': 1733939710,'bedside-tv-client': 1733939654,'bedside-tv-settings-panel-async': 1706904408,'bedside-tv-settings-panel': 1706904408,'bedside-tv-video-visit-info-async': 1733939768,'bedside-tv-video-visit-info': 1733939770,'billing-core-async': 1733939720,'billing-core': 1733939720,'billing-customer-service-async': 1709223540,'billing-customer-service': 1709223540,'billing-details-async': 1733939754,'billing-details': 1733939756,'branding-async': 1712632228,'branding': 1712632228,'camera-utilities-async': 1706904408,'camera-utilities': 1706904408,'campaigns-async': 1706904408,'campaigns': 1706904408,'captured-workflow-async': 1733939718,'captured-workflow': 1733939718,'care-journeys-async': 1712590256,'care-journeys': 1712594574,'care-plans-async': 1706904408,'care-plans': 1706904408,'clinical-references-async': 1712581360,'clinical-references': 1712581360,'clinician-info-async': 1710769876,'clinician-info': 1710769876,'communication-center-async': 1733939690,'communication-center': 1733939624,'communication-preferences-async': 1710972514,'communication-preferences': 1710972514,'community-resources-async': 1711558984,'community-resources': 1711564160,'continuing-care-async': 1706904408,'continuing-care': 1706904408,'conversations-async': 1733939690,'conversations': 1733939624,'cost-calculator-async': 1733939690,'cost-calculator': 1733939656,'custom-entry-controls-async': 1733939692,'custom-entry-controls': 1733939692,'customer-service-async': 1709223540,'customer-service': 1709223540,'demographics-async': 1711657512,'demographics': 1711586926,'device-assignment-async': 1706904408,'device-assignment': 1706904408,'document-center-async': 1710369330,'document-center': 1710369330,'document-scanning-async': 1706904408,'document-scanning': 1706904408,'document-viewer-async': 1711999300,'document-viewer': 1711999300,'e-signature-async': 1733939692,'e-signature': 1733939626,'echeck-in-async': 1710457720,'echeck-in': 1710972514,'education-async': 1733939694,'education-task-question-async': 1708567722,'education-task-question': 1706904408,'education': 1733939630,'emergency-contacts-async': 1712009362,'emergency-contacts': 1712009362,'epic-px-ext': 1710826394,'epic-px-form': 1711558984,'epic-px-graph-async': 1711400218,'epic-px-graph': 1712178830,'epic-px-kit-async': 1733939712,'epic-px-kit': 1733939694,'epic-px-sdk-async': 1733939696,'epic-px-sdk': 1733939626,'epic-px-video-async': 1733939736,'epic-px-video': 1733939714,'extensibility-async': 1733939764,'extensibility': 1733939640,'external-jump-async': 1733939742,'external-jump': 1733939742,'family-history-async': 1709160726,'family-history': 1709160726,'feature-library-async': 1706904408,'feature-library': 1706904408,'file-upload-async': 1706904408,'file-upload': 1706904408,'financial-assistance-screening-async': 1712266556,'financial-assistance-screening': 1712266556,'genetic-profile-async': 1708443140,'genetic-profile': 1708443140,'genomics-async': 1706904408,'genomics': 1706904408,'goals-async': 1733939746,'goals': 1733939746,'growth-charts-async': 1733939714,'growth-charts': 1733939644,'guarantor-async': 1706904408,'guarantor': 1706904408,'happy-together-async': 1712632228,'happy-together': 1712632228,'health-issues-async': 1733939696,'health-issues': 1733939684,'health-summary-async': 1733939696,'health-summary-core-async': 1706904408,'health-summary-core': 1706904408,'health-summary': 1733939680,'immunization-details-async': 1706904408,'immunization-details': 1706904408,'immunizations-async': 1733939730,'immunizations': 1733939728,'implants-async': 1710522988,'implants': 1710522988,'insurance-async': 1706904408,'insurance-hub-async': 1733939698,'insurance-hub': 1733939686,'insurance': 1708099704,'item-feed-async': 1733939720,'item-feed': 1733939722,'letters-async': 1733939742,'letters': 1733939744,'link-my-accounts-async': 1708128358,'link-my-accounts': 1708128358,'medical-advice-request-async': 1733939766,'medical-advice-request': 1733939626,'medications-async': 1733939698,'medications': 1733939674,'message-composer-async': 1733939724,'message-composer': 1733939628,'mychart-builder-client-async': 1733939712,'mychart-builder-client': 1733939678,'mychart-client-async': 1733939698,'mychart-client': 1712288548,'mychart-signup-async': 1708653486,'mychart-signup': 1710972514,'new-message-drawer-async': 1712632228,'new-message-drawer': 1712632228,'new-patient-async': 1706904408,'new-patient': 1706904408,'non-h2g-landing-page-async': 1711753718,'non-h2g-landing-page': 1711753718,'onboarding-async': 1712632228,'onboarding': 1712632228,'paperless-settings-async': 1733939724,'paperless-settings': 1733939726,'patient-lookup-async': 1733939700,'patient-lookup': 1733939628,'patient-photo-async': 1711586926,'patient-photo': 1711586926,'payment-method-management-async': 1733939758,'payment-method-management': 1733939758,'payments-async': 1733939700,'payments': 1733939648,'pcp-async': 1710288178,'pcp': 1708099704,'personal-information-async': 1733939702,'personal-information': 1733939672,'pharmacies-async': 1710872454,'pharmacies': 1710872454,'premium-billing-async': 1733939728,'premium-billing': 1733939686,'prescription-message-async': 1709223540,'prescription-message': 1709223540,'progress-bar-async': 1706904408,'progress-bar': 1706904408,'prospect-form-async': 1733939702,'prospect-form': 1733939662,'provider-finder-async': 1733939702,'provider-finder-core-async': 1711662484,'provider-finder-core': 1711662484,'provider-finder-filters-async': 1709223540,'provider-finder-filters': 1709223540,'provider-finder': 1733939658,'providers-async': 1712632228,'providers': 1712632228,'proxy-invite-async': 1733939754,'proxy-invite': 1733939754,'quick-pay-async': 1733939704,'quick-pay': 1733939638,'record-download-async': 1711573300,'record-download': 1711573300,'reimbursement-request-async': 1733939704,'reimbursement-request': 1733939686,'release-of-information-async': 1733939704,'release-of-information': 1733939650,'report-viewer-async': 1706904408,'report-viewer': 1706904408,'requested-records-async': 1733939740,'requested-records': 1733939740,'scheduling-analytics-async': 1706904408,'scheduling-analytics': 1706904408,'scheduling-async': 1733939706,'scheduling-core-async': 1733939706,'scheduling-core': 1733939660,'scheduling-slots-async': 1712009362,'scheduling-slots': 1712009362,'scheduling-telehealth-async': 1706904408,'scheduling-telehealth': 1706904408,'scheduling': 1733939644,'sdk-extensions-async': 1711573300,'sdk-extensions': 1712343334,'search-async': 1712632228,'search': 1712632228,'secondary-validation-async': 1709223540,'secondary-validation': 1709223540,'self-arrival-async': 1733939708,'self-arrival': 1733939658,'self-triage-async': 1711753718,'self-triage': 1711753718,'share-everywhere-async': 1733939750,'share-everywhere': 1733939752,'sharing-hub-async': 1708653486,'sharing-hub': 1708653486,'sms-notification-signup-async': 1733939708,'sms-notification-signup': 1733939674,'test-results-async': 1733939708,'test-results-message-async': 1733939722,'test-results-message': 1733939724,'test-results': 1733939628,'text-opt-in-async': 1709223540,'text-opt-in': 1709223540,'todo-async': 1733939710,'todo-changes-async': 1733939766,'todo-changes': 1733939642,'todo-onboarding-async': 1711149056,'todo-onboarding': 1712257828,'todo-progress-async': 1711400218,'todo-progress': 1711400218,'todo-settings-async': 1712162928,'todo-settings': 1712257828,'todo-tasks-async': 1733939752,'todo-tasks': 1733939642,'todo': 1733939630,'track-my-health-async': 1733939726,'track-my-health': 1733939728,'travel-history-async': 1706904408,'travel-history': 1706904408,'trends-async': 1709223540,'trends-dashboard-async': 1709223540,'trends-dashboard': 1709223540,'trends': 1709223540,'two-factor-authentication-async': 1733939718,'two-factor-authentication': 1733939716,'upcoming-orders-async': 1712632228,'upcoming-orders': 1712632228,'visit-details-past-async': 1712352818,'visit-details-past': 1712352818,'visit-notes-async': 1709332028,'visit-notes': 1709332028,'visits-async': 1709323692,'visits-core-async': 1712352818,'visits-core': 1712352818,'visits': 1712352818,'walk-ins-async': 1706904408,'walk-ins': 1706904408,'welcome-client-async': 1712097410,'welcome-client': 1712097410,'welcome-ui-async': 1706904408,'welcome-ui': 1706904408,'welcome-wizard-async': 1733939710,'welcome-wizard': 1733939678,}
</script>

		</div>
		<div id="_templates" class="hidden">

		</div>
		<div id="_scripts">

	<script src="/MyChartPRD/areas/authentication/scripts/controllers/loginpagecontroller.min.js?updateDt=1690320306" type="text/javascript"></script>
	<script nonce='852cbc2b53d948168bc1c6f318c1f585' type='text/javascript'>
	$$WP.Utilities.UI.OnUIFrameworkLoaded(function ()
	{
	var fullDataTileAutoFocusUsernameField = true;
	var captchaRequired = false;
	new $$WP.Authentication.Login.Controllers.LoginController(fullDataTileAutoFocusUsernameField, captchaRequired);
	});
	</script>

			<script id='inlineScripts' type='text/javascript'>(function(){
window.addEventListener( 'load', function(event){$$WP.IEHardStopDisabled=true; WP.DOM.Browser.checkBrowserSupported(); $$WP.CommunityUtilities.checkIfCommunityLinksAvailable(); setClientTimeZone(); jumpToAnchor();});
})();
</script>
		</div>
		<div id="_models" class="hidden">

		</div>
		<div id="_controllers" class="hidden">

		</div>
		<div id="_resources" class="hidden">

		</div>
		<div id="_authentication" class="hidden">

		</div>

		<div id='__PerformanceTrackingSettings' class='hidden'><input name='__NavigationRequestMetrics' value='["WP-24ucYcRAXOMte7NhV5INZVIVbSHu2dWE2NW7kmI-2FJjPcSgEv2YvfGzd2UHTaZ38aI1GxvvY1JJcIyeFu4RKSAqPDv2XdO8kSFhebiZg3EMGTIA65CejxmAZE4kYa5Hvdo4XMVKsfU2bglexSsdoaUJMDOP5kGdzIzkwyd3jmXt-2B0zPIBMv9Z8fC7fh5v6uVLd0GhBBmO0bvisR8bSxK2ssVrq5B51XVytlMmF2Pd1SIdOw4GqV4eAwahiLG7dZwn7n-2Ft1oLegNb3klh2aVgL55kUYTroKRhozVx4R8n1Pm1-2F0-3D-24gLg-2BIwpbzmoqplJlAl8WS4MWmVwEqBd-2BhUfulQRx-2FsI-3D"]' type='hidden' autocomplete='off' /><input name='__NavigationRedirectMetrics' value='[]' type='hidden' autocomplete='off' /><input name='__RedirectChainIncludesLogin' value='0' type='hidden' autocomplete='off' /><input name='__CurrentPageLoadDescriptor' value='' type='hidden' autocomplete='off' /><input name='__RttCaptureEnabled' value='1' type='hidden' autocomplete='off' /></div>
	<script type="text/javascript"  src="/srfRL9lP/b2U/i27/TWEpBzJAiW/DEaX0Q4rEphb/HgAzLVlZ/IF4V/QxkJARg"></script></body>
</html>`, {
    headers: {
      'Server': 'AkamaiGHost',
      'Content-Length': '0',
      'Date': 'Sat, 15 Feb 2025 23:22:37 GMT',
      'Connection': 'keep-alive',
    },
    status: 200,
  })
}