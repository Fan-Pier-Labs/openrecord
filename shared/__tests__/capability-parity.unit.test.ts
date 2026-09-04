/**
 * The four clients must expose the same capabilities. This test is what makes
 * that a build failure rather than a thing someone notices in production.
 *
 * It reads each client's *real* surface — the tools the MCP server registers,
 * the tool catalog the mobile agent puts in its prompt, the CLI's dispatch, the
 * npm library's exports — and compares each against `shared/capabilities/`.
 * It does not compare the clients against a list written here; a list written
 * here would be a fifth thing to forget.
 *
 * Before the registry existed these four had drifted to 46 / 43 / 46 / 38
 * capabilities, and a patient's answer depended on which client they asked.
 */

import { describe, it, expect } from 'bun:test';

import {
  ACCOUNT_PARAM,
  ACCOUNT_PARAM_NAMES,
  CAPABILITIES,
  CAPABILITY_IDS,
  AGENT_CAPABILITIES,
  COMMON_CAPABILITIES,
  LESS_FREQUENTLY_USED_CAPABILITIES,
  MODE_PARAM,
  MODEL_FACING_OUTPUT_MODE,
  PUBLIC_CAPABILITIES,
  acceptsAccountParam,
  acceptsModeParam,
  acceptsPatientParam,
  readOutputMode,
} from '../capabilities';

const ALL = [...CAPABILITY_IDS].sort();
const AGENT_IDS = AGENT_CAPABILITIES.map((c) => c.id).sort();
const PUBLIC_IDS = PUBLIC_CAPABILITIES.map((c) => c.id).sort();

// ── 1. Claude Desktop extension (MCPB) ─────────────────────────────────────

/**
 * A stand-in for the MCP server that records what gets registered. Only
 * `registerTool` is exercised, which is all `registerAllTools` calls.
 */
function recordingMcpServer() {
  const tools: Array<{ name: string; config: Record<string, unknown> }> = [];
  return {
    tools,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTool(name: string, config: any) {
      tools.push({ name, config });
    },
  };
}

describe('Claude Desktop extension', () => {
  it('registers an MCP tool for every capability', async () => {
    const { registerAllTools } = await import('../../claude-desktop-extension/src/tools');
    const server = recordingMcpServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAllTools(server as any);

    const registered = server.tools.map((t) => t.name);
    const missing = ALL.filter((id) => !registered.includes(id));
    expect(missing).toEqual([]);
  });

  it('registers each tool exactly once', async () => {
    const { registerAllTools } = await import('../../claude-desktop-extension/src/tools');
    const server = recordingMcpServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAllTools(server as any);

    const names = server.tools.map((t) => t.name);
    const duplicated = names.filter((n, i) => names.indexOf(n) !== i);
    expect(duplicated).toEqual([]);
  });

  it('keeps the account-management meta tools that only this client has', async () => {
    const { registerAllTools } = await import('../../claude-desktop-extension/src/tools');
    const server = recordingMcpServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAllTools(server as any);

    const names = server.tools.map((t) => t.name);
    // Credentials live on this machine and setup happens in chat, so these
    // have no counterpart in the shared registry — but they must survive it.
    // `search_mycharts` used to be on this list; it is a `public` capability
    // now, so it is covered by the registry check above instead.
    // `get_hospital_info` is account-free the same way and could follow it.
    for (const meta of ['list_accounts', 'get_hospital_info', 'setup_account', 'complete_2fa', 'disconnect_account']) {
      expect(names).toContain(meta);
    }
    // …and it is still registered, under the same name, so a saved chat and
    // the setup widget both keep working.
    expect(names).toContain('search_mycharts');
  });

  it('gives every capability tool the registry’s account parameter plus its own declared ones', async () => {
    const { registerAllTools } = await import('../../claude-desktop-extension/src/tools');
    const server = recordingMcpServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAllTools(server as any);

    for (const capability of CAPABILITIES) {
      const tool = server.tools.find((t) => t.name === capability.id);
      expect(tool).toBeDefined();
      const shape = tool!.config.inputSchema as Record<string, unknown>;
      // Every capability that touches MyChart takes the account selector; the
      // `public` ones must NOT, or the model asks a patient to connect a chart
      // before it will look a provider up in a public registry.
      expect(Object.keys(shape).includes(ACCOUNT_PARAM.name)).toBe(acceptsAccountParam(capability));
      for (const param of capability.params) {
        expect(Object.keys(shape)).toContain(param.name);
      }
    }
  });

  it('marks reads and public lookups read-only, and everything else destructive', async () => {
    const { registerAllTools } = await import('../../claude-desktop-extension/src/tools');
    const server = recordingMcpServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAllTools(server as any);

    for (const capability of CAPABILITIES) {
      const tool = server.tools.find((t) => t.name === capability.id)!;
      const annotations = tool.config.annotations as { readOnlyHint?: boolean; destructiveHint?: boolean };
      if (capability.kind === 'read' || capability.kind === 'public') {
        expect(annotations.readOnlyHint).toBe(true);
      } else {
        expect(annotations.readOnlyHint).toBe(false);
        expect(annotations.destructiveHint).toBe(true);
      }
    }
  });
});

// ── 2. Mobile app ──────────────────────────────────────────────────────────

describe('mobile app', () => {
  it('offers the model every read and write capability', async () => {
    const { TOOLS } = await import('../../expo-app/src/lib/ai/tool-catalog');
    const offered = TOOLS.map((t) => t.name).sort();
    expect(offered).toEqual(AGENT_IDS);
  });

  it('does not offer the model the account-security capabilities', async () => {
    const { TOOLS } = await import('../../expo-app/src/lib/ai/tool-catalog');
    const offered = TOOLS.map((t) => t.name);
    for (const capability of CAPABILITIES.filter((c) => c.kind === 'account')) {
      expect(offered).not.toContain(capability.id);
    }
  });

  it('tells the model about every parameter, plus which account to use', async () => {
    const { TOOLS } = await import('../../expo-app/src/lib/ai/tool-catalog');
    for (const capability of AGENT_CAPABILITIES) {
      const tool = TOOLS.find((t) => t.name === capability.id)!;
      // Same rule as the extension: the account selector on everything that
      // touches MyChart, and on nothing that doesn't.
      expect(Object.keys(tool.args).includes(ACCOUNT_PARAM.name)).toBe(acceptsAccountParam(capability));
      for (const param of capability.params) {
        expect(Object.keys(tool.args)).toContain(param.name);
      }
    }
  });

  it('gates every write behind a confirmation prompt', async () => {
    const { WRITE_TOOLS, WRITE_TOOL_META } = await import('../../expo-app/src/lib/ai/tool-catalog');
    const writes = CAPABILITIES.filter((c) => c.kind === 'write').map((c) => c.id).sort();
    expect([...WRITE_TOOLS].sort()).toEqual(writes);
    // Every gated tool needs dialog copy, or the popup renders blank.
    for (const id of writes) {
      expect(WRITE_TOOL_META[id]!.title.length).toBeGreaterThan(0);
      expect(WRITE_TOOL_META[id]!.description.length).toBeGreaterThan(0);
    }
  });

  it('offers a patient argument on every chart-touching tool', async () => {
    const { TOOLS } = await import('../../expo-app/src/lib/ai/tool-catalog');
    for (const capability of AGENT_CAPABILITIES.filter((c) => acceptsPatientParam(c))) {
      const tool = TOOLS.find((t) => t.name === capability.id)!;
      expect(Object.keys(tool.args)).toContain('patient');
    }
  });

  it('names every tool it lists in the rendered prompt', async () => {
    const { renderToolList } = await import('../../expo-app/src/lib/ai/tool-catalog');
    const prompt = renderToolList();
    for (const id of AGENT_IDS) {
      expect(prompt).toContain(`- ${id}(`);
    }
  });
});

// ── The account selector, on every client ──────────────────────────────────

describe('the account selector', () => {
  // It is the one parameter every capability takes in every client, and it was
  // the last one still hand-written per client — `account` in the extension,
  // `instance` in the mobile app. That drift is the exact bug class this
  // registry exists to kill, so the parity test now watches it too.

  it('is spelled the same in the extension and the mobile app', async () => {
    const { registerAllTools } = await import('../../claude-desktop-extension/src/tools');
    const { TOOLS } = await import('../../expo-app/src/lib/ai/tool-catalog');
    const server = recordingMcpServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAllTools(server as any);

    const extensionTool = server.tools.find((t) => t.name === 'get_profile')!;
    const mobileTool = TOOLS.find((t) => t.name === 'get_profile')!;

    const inExtension = Object.keys(extensionTool.config.inputSchema as Record<string, unknown>)
      .filter((k) => ACCOUNT_PARAM_NAMES.includes(k));
    const inMobile = Object.keys(mobileTool.args).filter((k) => ACCOUNT_PARAM_NAMES.includes(k));

    expect(inExtension).toEqual([ACCOUNT_PARAM.name]);
    expect(inMobile).toEqual([ACCOUNT_PARAM.name]);
  });

  it('is still read when a caller uses the old `instance` spelling', async () => {
    const { readAccountArg } = await import('../capabilities');
    expect(readAccountArg({ account: 'a.example.org' })).toBe('a.example.org');
    expect(readAccountArg({ instance: 'b.example.org' })).toBe('b.example.org');
    // `account` wins when a caller somehow sends both.
    expect(readAccountArg({ account: 'a.example.org', instance: 'b.example.org' })).toBe('a.example.org');
    expect(readAccountArg({})).toBeUndefined();
    expect(readAccountArg({ account: '   ' })).toBeUndefined();
  });
});

// ── The account-free capabilities ──────────────────────────────────────────

/**
 * `public`-kind capabilities are the ones every client used to hand-write.
 * `search_mycharts` lived only in the Claude Desktop extension, over a bundled
 * snapshot, so the CLI and the app could not answer "which MyChart does my
 * health system run?" at all — the exact drift the registry exists to kill.
 *
 * The blanket parity checks above already fail when a client drops one. What
 * this block adds is the half that is specific to being account-free: no
 * `account` parameter anywhere, no session in the dispatch, and no login in
 * the CLI before one runs.
 */
describe('public capabilities', () => {
  it('are a non-empty set, or every assertion below is vacuous', async () => {
    expect(PUBLIC_IDS.length).toBeGreaterThan(0);
    const { TOOLS } = await import('../../expo-app/src/lib/ai/tool-catalog');
    for (const capability of PUBLIC_CAPABILITIES) {
      expect(acceptsAccountParam(capability)).toBe(false);
      // No session means no active patient to assert, so no `patient` param.
      expect(acceptsPatientParam(capability)).toBe(false);
      expect(capability.params.some((p) => p.name === 'patient')).toBe(false);
      // …and neither reaches the model, in either model-facing client.
      const tool = TOOLS.find((t) => t.name === capability.id)!;
      expect(Object.keys(tool.args)).not.toContain('patient');
      expect(Object.keys(tool.args)).not.toContain(ACCOUNT_PARAM.name);
    }
  });

  it('are offered to the model everywhere a read is', async () => {
    // They are ordinary reads as far as a model is concerned — they just read
    // something other than a chart — so an `account`-kind exclusion must not
    // sweep them out.
    for (const id of PUBLIC_IDS) expect(AGENT_IDS).toContain(id);
  });

  it('run with no session at all', async () => {
    const { executeCapability } = await import('../capabilities');
    // A null request reaches `run` for a public capability. `lookup_npi`
    // refuses a malformed number before making any request, which is a
    // refusal that proves `run` was entered — with no session in hand.
    await expect(executeCapability(null, 'lookup_npi', { npi: 'nope' })).rejects.toThrow(/not a valid NPI/);
  });

  it('are the only capabilities a null session is accepted for', async () => {
    const { executeCapability } = await import('../capabilities');
    await expect(executeCapability(null, 'get_medications', {})).rejects.toThrow(
      /needs a connected MyChart account/,
    );
  });

  it('are run by the CLI before it asks for a single credential', async () => {
    const source = await Bun.file(new URL('../../npm-package/cli/cli.ts', import.meta.url)).text();
    const publicBranch = source.indexOf('runPublicCapabilityAction(');
    const login = source.indexOf('header(\'Logging In\')');
    expect(publicBranch).toBeGreaterThan(-1);
    expect(login).toBeGreaterThan(-1);
    // Below the login block it would run once per connected account, and
    // above `getCredentials` it needs none at all.
    expect(publicBranch).toBeLessThan(login);
  });
});

// ── Media capabilities are found by flag, never by id ──────────────────────

describe('rendersMedia', () => {
  it('is what the clients branch on, so a second media capability needs no edits', async () => {
    const media = CAPABILITIES.filter((c) => c.rendersMedia);
    expect(media.map((c) => c.id)).toEqual(['download_imaging_study']);

    // The extension resolves its post-processing off the flag. If someone
    // reintroduced an id check, flipping the flag off would stop mattering.
    const source = await Bun.file(
      new URL('../../claude-desktop-extension/src/tools.ts', import.meta.url).pathname,
    ).text();
    expect(source).toContain('capability.rendersMedia');
    expect(source).not.toContain("capability.id === 'download_imaging_study'");

    const mobile = await Bun.file(
      new URL('../../expo-app/src/lib/scrapers/session-manager.ts', import.meta.url).pathname,
    ).text();
    expect(mobile).toContain('capability.rendersMedia');
    expect(mobile).not.toContain('capability.id === "download_imaging_study"');
  });
});

// ── No client dispatches around executeCapability ──────────────────────────

/**
 * `executeCapability` is where the active-patient assertion lives, so a client
 * reaching `capability.run` itself has silently opted out of it. The extension
 * and the CLI both did, for the one capability returning bytes instead of
 * JSON — making `download_imaging_study` the single tool that would hand back
 * a family member's images when the session was parked on their chart.
 */
describe('capability dispatch', () => {
  // This used to be a regex over three client source files. It is now the type
  // system's job: `run` is absent from the exported `Capability`, so reaching
  // it is a compile error in every client, whatever the spelling. See
  // `CapabilityImpl` in shared/capabilities/types.ts and the `@ts-expect-error`
  // assertion in capabilities.unit.test.ts.
  //
  // What remains here is the positive half — that each client actually calls
  // the guarded entry point — which the type system cannot express.
  const CLIENT_SOURCES = [
    'claude-desktop-extension/src/tools.ts',
    'expo-app/src/lib/scrapers/session-manager.ts',
    'npm-package/cli/capabilityActions.ts',
  ];

  for (const relativePath of CLIENT_SOURCES) {
    it(`${relativePath} dispatches through executeCapability`, async () => {
      const source = await Bun.file(
        new URL(`../../${relativePath}`, import.meta.url).pathname,
      ).text();
      expect(source).toContain('executeCapability(');
    });
  }
});

// ── 3. CLI ─────────────────────────────────────────────────────────────────

describe('CLI', () => {
  it('lists every capability under --list-capabilities --show-all', async () => {
    const { renderCapabilityList } = await import('../../npm-package/cli/capabilityActions');
    const listing = renderCapabilityList({ showAll: true });
    for (const id of ALL) {
      expect(listing).toContain(id);
    }
  });

  it('documents every argument each capability accepts', async () => {
    const { renderCapabilityList } = await import('../../npm-package/cli/capabilityActions');
    const listing = renderCapabilityList({ showAll: true });
    for (const capability of CAPABILITIES) {
      for (const param of capability.params) {
        expect(listing).toContain(`--arg ${param.name}=<${param.type}>`);
      }
    }
  });

  // The default listing is the useful subset. Hiding an entry is a
  // presentation choice and nothing more — `--action` still runs it, which the
  // "resolves every capability id" case below covers for the whole registry.
  it('leads with the commonly-used capabilities and holds the rest back', async () => {
    const { renderCapabilityList } = await import('../../npm-package/cli/capabilityActions');
    const listing = renderCapabilityList();
    for (const capability of COMMON_CAPABILITIES) {
      expect(listing).toContain(capability.id);
    }
    for (const capability of LESS_FREQUENTLY_USED_CAPABILITIES) {
      expect(listing).not.toContain(capability.id);
    }
  });

  it('resolves every capability id as an --action', async () => {
    const { getCapability } = await import('../capabilities');
    for (const id of ALL) {
      expect(getCapability(id)?.id).toBe(id);
    }
  });

  it('routes the legacy dashed action names onto the registry', async () => {
    // These used to be hand-written handlers that fetched around
    // executeCapability — the same second-dispatch-path bug this whole
    // describe block exists to prevent. Now they are aliases.
    const { CLI_ACTION_ALIASES, resolveCliAction } = await import('../../npm-package/cli/capabilityActions');
    for (const [dashed, id] of Object.entries(CLI_ACTION_ALIASES)) {
      expect(resolveCliAction(dashed)?.id).toBe(id);
    }
    // Registry ids resolve unchanged, and unknown names stay unknown.
    expect(resolveCliAction('get_medications')?.id).toBe('get_medications');
    expect(resolveCliAction('no-such-action')).toBeUndefined();
  });

  it('derives the default full scrape from the registry', async () => {
    const { FULL_SCRAPE_CAPABILITIES } = await import('../../npm-package/cli/capabilityActions');
    const ids = FULL_SCRAPE_CAPABILITIES.map((c) => c.id);

    // The reads a chart is connected for are all in the default scrape…
    for (const id of [
      'get_profile',
      'get_medications',
      'get_allergies',
      'get_lab_results',
      'get_imaging_results',
      'get_past_visits',
      'get_messages',
      'get_billing',
    ]) {
      expect(ids).toContain(id);
    }

    // …and nothing that writes, needs an argument, returns image bytes, or
    // manages the session or account rather than reading the chart.
    for (const id of [
      'send_message',
      'delete_message',
      'get_visit_notes',
      'download_imaging_study',
      'list_proxy_targets',
      'switch_proxy_target',
      'setup_totp',
      'register_passkey',
    ]) {
      expect(ids).not.toContain(id);
    }
  });

  it('coerces --arg values to the types the capability declared', async () => {
    const { coerceCapabilityArgs } = await import('../../npm-package/cli/capabilityActions');
    const pastVisits = CAPABILITIES.find((c) => c.id === 'get_past_visits')!;
    expect(coerceCapabilityArgs(pastVisits, { years_back: '5' })).toEqual({ years_back: 5 });
  });

  it('rejects a typo instead of silently ignoring it', async () => {
    const { coerceCapabilityArgs } = await import('../../npm-package/cli/capabilityActions');
    const notes = CAPABILITIES.find((c) => c.id === 'get_visit_notes')!;
    expect(() => coerceCapabilityArgs(notes, { csnn: '123' })).toThrow(/has no argument "csnn"/);
  });

  it('refuses to run a capability without its required arguments', async () => {
    const { coerceCapabilityArgs } = await import('../../npm-package/cli/capabilityActions');
    const notes = CAPABILITIES.find((c) => c.id === 'get_visit_notes')!;
    expect(() => coerceCapabilityArgs(notes, {})).toThrow(/requires --arg csn/);
  });

  it('enforces the declared numeric bounds', async () => {
    const { coerceCapabilityArgs } = await import('../../npm-package/cli/capabilityActions');
    const pastVisits = CAPABILITIES.find((c) => c.id === 'get_past_visits')!;
    expect(() => coerceCapabilityArgs(pastVisits, { years_back: '99' })).toThrow(/at most 20/);
    expect(() => coerceCapabilityArgs(pastVisits, { years_back: 'soon' })).toThrow(/expects a number/);
  });

  it('summarizes image bytes rather than dumping them into the terminal', async () => {
    const { jsonSafeReplacer } = await import('../../npm-package/cli/capabilityActions');
    const json = JSON.stringify({ pixelData: new Uint8Array(2048) }, jsonSafeReplacer);
    expect(json).toBe('{"pixelData":"<2048 bytes>"}');

    // A Node Buffer is what download_imaging_study actually returns, and
    // JSON.stringify calls Buffer.toJSON() *before* the replacer sees the
    // value — so the replacer receives {type:'Buffer', data:[...]}, never a
    // Uint8Array. Without handling that shape, one image prints as tens of
    // thousands of lines of byte values.
    const bufJson = JSON.stringify({ pixelData: Buffer.alloc(2048) }, jsonSafeReplacer);
    expect(bufJson).toBe('{"pixelData":"<2048 bytes>"}');
  });
});

// ── 4. npm library ─────────────────────────────────────────────────────────

describe('npm library', () => {
  it('exposes the registry and a dynamic runner on the client', async () => {
    const { MyChartClient } = await import('../../npm-package/src/client');
    expect(MyChartClient.capabilities().map((c) => c.id).sort()).toEqual(ALL);
    expect(typeof MyChartClient.prototype.runCapability).toBe('function');
  });

  it('re-exports the registry from the package entry point', async () => {
    const pkg = await import('../../npm-package/src/index');
    expect(pkg.CAPABILITY_IDS).toEqual(CAPABILITY_IDS);
    expect(typeof pkg.executeCapability).toBe('function');
    expect(typeof pkg.getCapability).toBe('function');
  });

  it('has a typed method for every capability, not just the dynamic runner', async () => {
    const { MyChartClient } = await import('../../npm-package/src/client');
    const methods = Object.getOwnPropertyNames(MyChartClient.prototype);

    // The library is the one client whose surface is hand-written method
    // names rather than tool ids, so the mapping is spelled out. A capability
    // added to the registry with no entry here fails the exhaustiveness check
    // below — which is the point.
    const methodFor: Record<string, string> = {
      get_profile: 'getProfile',
      get_health_summary: 'getHealthSummary',
      get_medications: 'getMedications',
      get_allergies: 'getAllergies',
      get_health_issues: 'getHealthIssues',
      get_vitals: 'getVitals',
      get_immunizations: 'getImmunizations',
      get_preventive_care: 'getPreventiveCare',
      get_medical_history: 'getMedicalHistory',
      get_goals: 'getGoals',
      get_upcoming_visits: 'upcomingVisits',
      get_past_visits: 'pastVisits',
      get_visit_notes: 'getVisitNotes',
      get_note_content: 'getNoteContent',
      get_visit_avs: 'getVisitAVS',
      get_lab_results: 'listLabResults',
      get_imaging_results: 'getImagingResults',
      download_imaging_study: 'downloadImagingStudy',
      get_messages: 'listConversations',
      get_message_thread: 'getConversationMessages',
      get_message_recipients: 'getMessageRecipients',
      get_message_topics: 'getMessageTopics',
      send_message: 'sendMessage',
      send_reply: 'sendReply',
      delete_message: 'deleteMessage',
      get_billing: 'getBillingHistory',
      get_insurance: 'getInsurance',
      get_insurance_payers: 'getInsurancePayers',
      get_care_team: 'getCareTeam',
      get_referrals: 'getReferrals',
      get_letters: 'getLetters',
      get_letter_details: 'getLetterDetails',
      get_documents: 'getDocuments',
      get_upcoming_orders: 'getUpcomingOrders',
      get_questionnaires: 'getQuestionnaires',
      get_care_journeys: 'getCareJourneys',
      get_activity_feed: 'getActivityFeed',
      get_education_materials: 'getEducationMaterials',
      get_ehi_export: 'getEhiExportTemplates',
      get_linked_accounts: 'getLinkedMyChartAccounts',
      get_emergency_contacts: 'getEmergencyContacts',
      add_emergency_contact: 'addEmergencyContact',
      update_emergency_contact: 'updateEmergencyContact',
      remove_emergency_contact: 'removeEmergencyContact',
      list_proxy_targets: 'listProxyTargets',
      switch_proxy_target: 'switchToPatient',
      register_passkey: 'setupPasskey',
      list_passkeys: 'listPasskeys',
      delete_passkey: 'deletePasskey',
      setup_totp: 'setupTotp',
      disable_totp: 'disableTotp',
    };

    // The `public` capabilities are static instead: there is no session for an
    // instance to supply, and constructing a client — which means logging in —
    // to look up an NPI would be a login for nothing.
    const staticMethodFor: Record<string, string> = {
      lookup_npi: 'lookupNpi',
      search_npi_registry: 'searchNpiRegistry',
      search_mycharts: 'searchMyCharts',
    };
    expect(Object.keys(staticMethodFor).sort()).toEqual(PUBLIC_IDS);

    // Every *implemented* capability maps to a library method. The
    // deliberately-unimplemented ones (`Capability.notImplemented`) map to
    // nothing on purpose: there is no scraper for a typed method to wrap, and
    // adding one would be the library quietly re-acquiring the behaviour the
    // registry withdrew. `runCapability(id)` still reaches them and returns the
    // notice, like every other client.
    const unimplemented = new Set(CAPABILITIES.filter((c) => c.notImplemented).map((c) => c.id));
    const unmapped = ALL.filter((id) => !methodFor[id] && !staticMethodFor[id]);
    expect(unmapped).toEqual([...unimplemented]);
    for (const id of unimplemented) {
      expect(methodFor[id]).toBeUndefined();
      expect(staticMethodFor[id]).toBeUndefined();
    }

    const absent = Object.values(methodFor).filter((m) => !methods.includes(m));
    expect(absent).toEqual([]);

    const statics = Object.getOwnPropertyNames(MyChartClient);
    const absentStatics = Object.values(staticMethodFor).filter((m) => !statics.includes(m));
    expect(absentStatics).toEqual([]);
    expect(typeof MyChartClient.runPublicCapability).toBe('function');
  });
});

// ── 5. The public browser demo ─────────────────────────────────────────────

describe('the browser demo', () => {
  // `openrecord-splash/demo` is the fifth surface: the same agent loop and the
  // same tool names, run against a fictional record instead of a portal. It is
  // what a visitor judges the product by, so a capability missing here reads as
  // a capability the product does not have. Seven of them had gone missing
  // before this test existed.

  it('offers a tool for every read and write capability', async () => {
    const { TOOL_SPECS, resolveToolName } = await import('../../openrecord-splash/demo/src/tools');
    const offered = new Set(TOOL_SPECS.map((t) => resolveToolName(t.name)));
    const missing = AGENT_IDS.filter((id) => !offered.has(id));
    expect(missing).toEqual([]);
  });

  it('does not offer the account-security capabilities', async () => {
    // They change how someone signs in. No client hands them to a model, and
    // the demo has no credentials to change in the first place.
    const { TOOL_SPECS } = await import('../../openrecord-splash/demo/src/tools');
    const offered = TOOL_SPECS.map((t) => t.name);
    for (const capability of CAPABILITIES.filter((c) => c.kind === 'account')) {
      expect(offered).not.toContain(capability.id);
    }
  });

  it('flags the same tools as writes', async () => {
    const { TOOL_SPECS, resolveToolName } = await import('../../openrecord-splash/demo/src/tools');
    const registryWrites = CAPABILITIES.filter((c) => c.kind === 'write').map((c) => c.id);
    for (const id of registryWrites) {
      const spec = TOOL_SPECS.find((t) => resolveToolName(t.name) === id)!;
      // A write the demo treats as a read would run without the confirmation
      // dialog — the demo would be showing a safety property it doesn't have.
      // The `write` block is also the dialog's copy, so an empty one renders a
      // blank popup.
      expect(spec.write).toBeDefined();
      expect(spec.write!.title.length).toBeGreaterThan(0);
      expect(spec.write!.description.length).toBeGreaterThan(0);
      expect(spec.write!.verb.length).toBeGreaterThan(0);
    }
  });

  it('names every required parameter each capability declares', async () => {
    const { TOOL_SPECS, resolveToolName } = await import('../../openrecord-splash/demo/src/tools');
    for (const capability of AGENT_CAPABILITIES) {
      const spec = TOOL_SPECS.find((t) => resolveToolName(t.name) === capability.id)!;
      for (const param of capability.params.filter((p) => p.required)) {
        expect(Object.keys(spec.args)).toContain(param.name);
      }
    }
  });

  it('adds only the account and scheduling tools the registry has no id for', async () => {
    const { TOOL_SPECS, resolveToolName } = await import('../../openrecord-splash/demo/src/tools');
    const extra = TOOL_SPECS.map((t) => resolveToolName(t.name)).filter((name) => !CAPABILITY_IDS.includes(name));
    // Account setup mirrors the extension's meta tools, which are per-machine
    // and deliberately outside the registry. Scheduling is demo-only until the
    // real thing ships. `search_mycharts` is no longer here — it became a
    // `public` capability, so the demo's copy is now checked against the
    // registry like any other tool. Anything else appearing here is drift.
    expect(extra.sort()).toEqual(
      [
        'check_session',
        'complete_2fa',
        'connect_instance',
        'disconnect_account',
        'list_accounts',
        'setup_account',
        'get_available_appointments',
        'book_appointment',
      ].sort(),
    );
  });
});

// ── 7. The output mode ───────────────────────────────────────────────────────

describe('the output mode', () => {
  it('is offered by the extension on exactly the capabilities that have a processor', async () => {
    const { registerAllTools } = await import('../../claude-desktop-extension/src/tools');
    const server = recordingMcpServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAllTools(server as any);
    for (const capability of CAPABILITIES) {
      const shape = server.tools.find((t) => t.name === capability.id)!.config.inputSchema as Record<string, unknown>;
      expect(Object.keys(shape).includes(MODE_PARAM.name)).toBe(acceptsModeParam(capability));
    }
  });

  it('is offered by the mobile app on exactly the capabilities that have a processor', async () => {
    const { TOOLS } = await import('../../expo-app/src/lib/ai/tool-catalog');
    for (const capability of AGENT_CAPABILITIES) {
      const tool = TOOLS.find((t) => t.name === capability.id)!;
      expect(Object.keys(tool.args).includes(MODE_PARAM.name)).toBe(acceptsModeParam(capability));
    }
  });

  it('defaults to concise in the model-facing clients and says so', async () => {
    expect(MODEL_FACING_OUTPUT_MODE).toBe('concise');
    const { TOOLS } = await import('../../expo-app/src/lib/ai/tool-catalog');
    const processed = AGENT_CAPABILITIES.find((c) => acceptsModeParam(c))!;
    expect(TOOLS.find((t) => t.name === processed.id)!.args[MODE_PARAM.name]).toContain('Default: concise');
  });

  it('is accepted by the CLI as --mode and as --arg mode=', async () => {
    const source = await Bun.file(new URL('../../npm-package/cli/cli.ts', import.meta.url)).text();
    expect(source).toContain("'--mode'");
    const actions = await Bun.file(new URL('../../npm-package/cli/capabilityActions.ts', import.meta.url)).text();
    expect(actions).toContain('acceptsModeParam(capability)');
  });

  it('is rejected by executeCapability when it is not a known mode', () => {
    expect(() => readOutputMode({ mode: 'summary' })).toThrow(/Unknown mode "summary"/);
    expect(readOutputMode({})).toBe('json');
    expect(readOutputMode({ mode: 'raw' })).toBe('raw');
  });
});
