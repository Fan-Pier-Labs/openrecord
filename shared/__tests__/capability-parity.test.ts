/**
 * The four clients must expose the same capabilities. This test is what makes
 * that a build failure rather than a thing someone notices in production.
 *
 * It reads each client's *real* surface — the tools the MCP server registers,
 * the tool catalog the mobile agent puts in its prompt, the CLI's dispatch, the
 * npm library's exports — and compares each against `shared/capabilities.ts`.
 * It does not compare the clients against a list written here; a list written
 * here would be a fifth thing to forget.
 *
 * Before the registry existed these four had drifted to 46 / 43 / 46 / 38
 * capabilities, and a patient's answer depended on which client they asked.
 */

import { describe, it, expect } from 'bun:test';

import { CAPABILITIES, CAPABILITY_IDS, AGENT_CAPABILITIES } from '../capabilities';

const ALL = [...CAPABILITY_IDS].sort();
const AGENT_IDS = AGENT_CAPABILITIES.map((c) => c.id).sort();

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
    for (const meta of ['list_accounts', 'search_mycharts', 'setup_account', 'complete_2fa', 'disconnect_account']) {
      expect(names).toContain(meta);
    }
  });

  it('gives every capability tool an `account` parameter plus its own declared ones', async () => {
    const { registerAllTools } = await import('../../claude-desktop-extension/src/tools');
    const server = recordingMcpServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAllTools(server as any);

    for (const capability of CAPABILITIES) {
      const tool = server.tools.find((t) => t.name === capability.id);
      expect(tool).toBeDefined();
      const shape = tool!.config.inputSchema as Record<string, unknown>;
      expect(Object.keys(shape)).toContain('account');
      for (const param of capability.params) {
        expect(Object.keys(shape)).toContain(param.name);
      }
    }
  });

  it('marks reads read-only and everything else destructive', async () => {
    const { registerAllTools } = await import('../../claude-desktop-extension/src/tools');
    const server = recordingMcpServer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerAllTools(server as any);

    for (const capability of CAPABILITIES) {
      const tool = server.tools.find((t) => t.name === capability.id)!;
      const annotations = tool.config.annotations as { readOnlyHint?: boolean; destructiveHint?: boolean };
      if (capability.kind === 'read') {
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

  it('tells the model about every parameter, plus which instance to use', async () => {
    const { TOOLS } = await import('../../expo-app/src/lib/ai/tool-catalog');
    for (const capability of AGENT_CAPABILITIES) {
      const tool = TOOLS.find((t) => t.name === capability.id)!;
      expect(Object.keys(tool.args)).toContain('instance');
      for (const param of capability.params) {
        expect(Object.keys(tool.args)).toContain(param.name);
      }
    }
  });

  it('gates every write behind a confirmation prompt', async () => {
    const { WRITE_TOOL_NAMES } = await import('../../expo-app/src/lib/ai/tool-catalog');
    const writes = CAPABILITIES.filter((c) => c.kind === 'write').map((c) => c.id).sort();
    expect([...WRITE_TOOL_NAMES].sort()).toEqual(writes);
  });

  it('names every tool it lists in the rendered prompt', async () => {
    const { renderToolList } = await import('../../expo-app/src/lib/ai/tool-catalog');
    const prompt = renderToolList();
    for (const id of AGENT_IDS) {
      expect(prompt).toContain(`- ${id}(`);
    }
  });
});

// ── 3. CLI ─────────────────────────────────────────────────────────────────

describe('CLI', () => {
  it('lists every capability under --list-capabilities', async () => {
    const { renderCapabilityList } = await import('../../npm-package/cli/capabilityActions');
    const listing = renderCapabilityList();
    for (const id of ALL) {
      expect(listing).toContain(id);
    }
  });

  it('documents every argument each capability accepts', async () => {
    const { renderCapabilityList } = await import('../../npm-package/cli/capabilityActions');
    const listing = renderCapabilityList();
    for (const capability of CAPABILITIES) {
      for (const param of capability.params) {
        expect(listing).toContain(`--arg ${param.name}=<${param.type}>`);
      }
    }
  });

  it('resolves every capability id as an --action', async () => {
    const { getCapability } = await import('../capabilities');
    for (const id of ALL) {
      expect(getCapability(id)?.id).toBe(id);
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
      request_refill: 'requestMedicationRefill',
      list_patients: 'discoverProxyTargets',
      get_active_patient: 'verifyActiveProxyTarget',
      switch_patient: 'switchProxyTarget',
      register_passkey: 'setupPasskey',
      list_passkeys: 'listPasskeys',
      delete_passkey: 'deletePasskey',
      setup_totp: 'setupTotp',
      disable_totp: 'disableTotp',
    };

    const unmapped = ALL.filter((id) => !methodFor[id]);
    expect(unmapped).toEqual([]);

    const absent = Object.values(methodFor).filter((m) => !methods.includes(m));
    expect(absent).toEqual([]);
  });
});
