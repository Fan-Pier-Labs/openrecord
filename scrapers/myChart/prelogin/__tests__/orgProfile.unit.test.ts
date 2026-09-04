/**
 * The login-shell mnemonic parser, against the exact script lines real
 * instances emit (values replaced with fictional ones).
 */
import { describe, expect, it } from 'bun:test';

import { hasOrgProfile, parseEmail, parseMnemonics, parseOrgProfile, parsePhone } from '../orgProfile';

const PAGE = `<html><head><title>MyChart - Login Page</title></head><body class="isPrelogin">
<script type="text/javascript">
$$WP.Strings.addMnemonic("@MYCHART@APPTITLE@","MySpringfield Chart", false, "Global", $$WP.Strings.EncodingTypes.None)
$$WP.Strings.addMnemonic("@MYCHART@ABSOLUTEURL@",HTMLUnencode("/MyChart-SGH/"), false, "Global");
$$WP.Strings.addMnemonic("@MYCHART@LOCALIZEDURL@",HTMLUnencode("/MyChart-SGH/en-US/"), false, "Global");
$$WP.Strings.addMnemonic("@MYCHART@HELPDESKPHONE@","<span dir='ltr'><a href='tel:5550100100'>555-010-0100</a></span>", false, "Global", $$WP.Strings.EncodingTypes.None)
$$WP.Strings.addMnemonic("@MYCHART@SCHEDULINGPHONE@","<span dir='ltr'>800-4Sprng</span>", false, "Global", $$WP.Strings.EncodingTypes.None)
$$WP.Strings.addMnemonic("@MYCHART@EMERGENCYPHONE@"," 911 ", false, "Global", $$WP.Strings.EncodingTypes.None)
$$WP.Strings.addMnemonic("@MYCHART@BILLINGPHONE@","<span dir='ltr'><a href='tel:5555555555'>(555) 555-5555</a></span>", false, "Global", $$WP.Strings.EncodingTypes.None)
$$WP.Strings.addMnemonic("@MYCHART@ORGNAME@",HTMLUnencode("Springfield General Hospital &amp; Clinics"), false, "Global");
$$WP.Strings.addMnemonic("@MYCHART@MYORGNAME@",HTMLUnencode("Springfield General Hospital &amp; Clinics"), false, "Global");
$$WP.Strings.addMnemonic("@MYCHART@HELPEMAIL@",HTMLUnencode("MyChartSupport@DoNotUse.DoNotUse"), false, "Global");
</script></body></html>`;

describe('parseMnemonics', () => {
  it('reads every @MYCHART@ mnemonic with its raw value', () => {
    const m = parseMnemonics(PAGE);
    expect(m.APPTITLE).toBe('MySpringfield Chart');
    expect(m.ABSOLUTEURL).toBe('/MyChart-SGH/');
    expect(m.HELPDESKPHONE).toBe("<span dir='ltr'><a href='tel:5550100100'>555-010-0100</a></span>");
    expect(m.EMERGENCYPHONE).toBe(' 911 ');
    expect(Object.keys(m)).toHaveLength(10);
  });

  it('decodes JS string escapes in the literal', () => {
    const m = parseMnemonics('$$WP.Strings.addMnemonic("@MYCHART@ORGNAME@","Say \\"hi\\" \\u0026 bye", false, "Global")');
    expect(m.ORGNAME).toBe('Say "hi" & bye');
  });
});

describe('parsePhone', () => {
  it('takes the digits from the tel: link and the text from the anchor', () => {
    expect(parsePhone("<span dir='ltr'><a href='tel:5550100100'>555-010-0100</a></span>")).toEqual({
      display: '555-010-0100',
      digits: '5550100100',
    });
  });

  it('keeps a vanity number readable and admits it has no digits', () => {
    expect(parsePhone("<span dir='ltr'>800-4Sprng</span>")).toEqual({ display: '800-4Sprng', digits: null });
  });

  it("treats Epic's (555) 555-5555 placeholder as unset", () => {
    expect(parsePhone("<span dir='ltr'><a href='tel:5555555555'>(555) 555-5555</a></span>")).toBeNull();
    expect(parsePhone('(555) 555-5555')).toBeNull();
    expect(parsePhone('')).toBeNull();
    expect(parsePhone(undefined)).toBeNull();
  });

  it('reads a bare number with no markup', () => {
    expect(parsePhone('1-800-010-0100')).toEqual({ display: '1-800-010-0100', digits: '18000100100' });
  });
});

describe('entity decoding', () => {
  /** Swap ORGNAME's value, which `PAGE` states before MYORGNAME's. */
  const withOrgName = (value: string) => PAGE.replace('Springfield General Hospital &amp; Clinics', value);

  it('leaves the mnemonic value raw and decodes it on the way into the profile', () => {
    const page = withOrgName('Children&rsquo;s Hospital &amp; Clinics&reg;');
    expect(parseMnemonics(page).ORGNAME).toBe('Children&rsquo;s Hospital &amp; Clinics&reg;');
    expect(parseOrgProfile(page).organizationName).toBe('Children’s Hospital & Clinics®');
  });

  it('does not decode an entity twice', () => {
    // `&amp;lt;b&amp;gt;` is the text `<b>` spelled out, not a bold tag.
    // Decoding it a second time is how a value that merely mentions markup
    // turns into markup.
    expect(parseOrgProfile(withOrgName('&amp;lt;b&amp;gt;')).organizationName).toBe('&lt;b&gt;');
  });

  it('survives a numeric reference outside the Unicode range', () => {
    expect(parseOrgProfile(withOrgName('&#1114112;')).organizationName).toBe('�');
  });
});

describe('parseEmail', () => {
  it("treats Epic's DoNotUse placeholder as unset", () => {
    expect(parseEmail('MyChartSupport@DoNotUse.DoNotUse')).toBeNull();
    expect(parseEmail('mychartsupport@donotuse.donotuse')).toBeNull();
  });

  it('keeps a real address and drops markup around it', () => {
    expect(parseEmail("<a href='mailto:help@example.org'>help@example.org</a>")).toBe('help@example.org');
    expect(parseEmail('not an email')).toBeNull();
  });
});

describe('parseOrgProfile', () => {
  it('assembles the profile from the page', () => {
    expect(parseOrgProfile(PAGE)).toEqual({
      organizationName: 'Springfield General Hospital & Clinics',
      portalBrand: 'MySpringfield Chart',
      mountPath: '/MyChart-SGH/',
      phones: {
        helpDesk: { display: '555-010-0100', digits: '5550100100' },
        scheduling: { display: '800-4Sprng', digits: null },
        billing: null,
      },
      supportEmail: null,
    });
  });

  it('falls back to MYORGNAME when ORGNAME is missing', () => {
    const page = PAGE.replace(/\$\$WP\.Strings\.addMnemonic\("@MYCHART@ORGNAME@"[^\n]*\n/, '');
    expect(parseOrgProfile(page).organizationName).toBe('Springfield General Hospital & Clinics');
  });

  it('returns an all-null profile for a page with no mnemonics', () => {
    const profile = parseOrgProfile('<html><body>Not MyChart</body></html>');
    expect(profile.organizationName).toBeNull();
    expect(profile.phones).toEqual({ helpDesk: null, scheduling: null, billing: null });
  });
});

describe('hasOrgProfile', () => {
  it('recognizes the mnemonic block and nothing else', () => {
    expect(hasOrgProfile(PAGE)).toBe(true);
    expect(hasOrgProfile('<html><body><input name="__RequestVerificationToken" /></body></html>')).toBe(false);
  });
});
