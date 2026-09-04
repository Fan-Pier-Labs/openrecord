/**
 * The capability *shape* — what an entry in the registry is, and what a client
 * is allowed to see of one.
 *
 * Split out of `index.ts` so the per-group entry files in `registry/` can type
 * themselves without importing the registry that imports them. **`index.ts`
 * deliberately does not re-export {@link CapabilityImpl}**: `run` stays
 * unreachable from `shared/capabilities`, which is the enforcement described
 * on that interface.
 */

import type { MyChartRequest } from '../../scrapers/myChart/core/myChartRequest';
import type { Processor } from '../../scrapers/myChart/processors/processor';

export type CapabilityKind =
  /** Reads chart data. Safe to batch and to run without confirmation. */
  | 'read'
  /** Mutates the patient's MyChart record (sends, deletes, submits). */
  | 'write'
  /**
   * Changes the credentials or 2FA configuration of the MyChart account
   * itself. Never offered to a model as a tool — clients surface these in
   * their own settings surface (CLI flags, app settings screen).
   */
  | 'account'
  /**
   * Reads a public source that has nothing to do with any MyChart account —
   * the NPI Registry, Epic's directory of MyChart instances. No login, no
   * session, no patient.
   *
   * This is the one kind whose `run` never receives a {@link MyChartRequest}:
   * see {@link PublicCapabilityImpl}. That is not a convenience, it is the
   * guarantee — a capability that cannot reach a session cannot read a chart,
   * so exempting it from the active-patient assertion is safe by construction
   * rather than by review.
   *
   * Read-shaped in every other respect: clients annotate these read-only and
   * offer them to a model, without an `account` parameter to fill in.
   */
  | 'public';

export type CapabilityParamType = 'string' | 'number' | 'boolean' | 'object';

export interface CapabilityParam {
  name: string;
  type: CapabilityParamType;
  /** Prose shown to the model / printed in `--help`. */
  description: string;
  required?: boolean;
  /** Inclusive bounds, numbers only. */
  min?: number;
  max?: number;
}

/**
 * Per-account state a capability may need that does not live on the MyChart
 * session — the stored password, the saved TOTP secret, and the callbacks that
 * persist newly-issued secrets. Each client wires this to its own credential
 * store (`~/.openrecord-mcpb/`, expo-secure-store, the CLI's `.totp-store`).
 */
export interface CapabilityContext {
  /**
   * The account password, if the client has one stored. TOTP setup needs it.
   * Every client reads this out of its own credential store, so "nothing stored"
   * arrives as an explicit undefined; the capabilities that need it check
   * truthiness, so undefined and absent behave identically.
   */
  password?: string | undefined;
  /** The saved TOTP secret for this account, if any. Disabling TOTP needs it. */
  totpSecret?: string | undefined;
  /** Persist a newly-created TOTP secret. */
  saveTotpSecret?: (secret: string) => Promise<void> | void;
  /** Persist a newly-registered passkey credential (already serialized). */
  savePasskey?: (serializedCredential: string) => Promise<void> | void;
}

export type CapabilityArgs = Record<string, unknown>;

export interface Capability {
  /** Canonical tool name. snake_case; identical across every client. */
  id: string;
  /** Older names a client may still receive. Accepted by {@link executeCapability}. */
  aliases?: readonly string[];
  /** Short human label, used for MCP tool titles and CLI section headers. */
  title: string;
  description: string;
  kind: CapabilityKind;
  /** Grouping for help output and tool-list ordering. */
  group: string;
  /**
   * A capability that is real, supported and rarely what anyone wants.
   *
   * MyChart's surface is not evenly valuable: labs, medications, visit notes
   * and messages are the reason to connect an account at all, while goals,
   * education pamphlets, care journeys and the emergency-contact writes are
   * endpoints most charts leave empty and most callers never reach for. Listing
   * all of them at equal weight buries the useful ones — a person skims past
   * them and a model picks a plausible-looking wrong tool out of the noise.
   *
   * So this is a *presentation* flag, never a capability flag: nothing here
   * changes what {@link executeCapability} will run, and every id stays
   * available in every client. It only decides what a listing shows first.
   * The CLI hides these behind `--help --show-all`; see
   * {@link COMMON_CAPABILITIES}.
   */
  lessFrequentlyUsed?: boolean;
  /**
   * Set when this capability deliberately ships **no scraper**: one sentence
   * saying why, which is both appended to the description and returned to any
   * caller that runs it.
   *
   * The alternative — shipping a scraper written against `fake-mychart` and
   * warning about it in prose — was tried and is worse. A read like that
   * answers `[]`, which nobody reads as "this has never seen a real instance";
   * they read it as "your chart has none". A write like that answers HTTP 200
   * from an endpoint that ignored it, and the patient believes their refill was
   * requested. Both are confident wrong answers, and a caveat in the tool
   * description does not stop a model acting on the payload it was handed.
   *
   * So there is no payload. {@link UnimplementedCapabilityImpl} has no `run`
   * at all — attaching one is a compile error, not a review note — and
   * {@link executeCapability} returns this sentence instead of calling
   * anything. What we know about the endpoint lives in a README beside the
   * capability's other code, where the person implementing it will look, rather
   * than in a scraper that runs.
   */
  notImplemented?: string;
  params: readonly CapabilityParam[];
  /**
   * True when the payload contains binary image data that each client has to
   * encode itself (the MCPB ships a pure-JS JPEG encoder, the mobile app uses
   * its own decoder, the CLI uses sharp). Clients must still expose the
   * capability — they just post-process `run`'s output.
   */
  rendersMedia?: boolean;
}

/**
 * A capability that runs against a MyChart session, plus its implementation.
 * **Internal to this module on purpose.**
 *
 * `run` is deliberately absent from the exported {@link Capability}, so
 * `capability.run(...)` does not compile anywhere outside this file. That is
 * the enforcement for "every dispatch goes through {@link executeCapability}",
 * which is where the active-patient assertion lives — and it replaces a regex
 * over three client source files.
 *
 * The regex only ever caught the one spelling that had already caused a bug.
 * Every one of these compiled, bypassed the assertion, and on the imaging
 * capability meant returning a different patient's medical images:
 *
 *     const { run } = capability;  run(session, args)
 *     getCapability(id)!.run(session, args)
 *     CAPABILITIES[0].run(session, args)
 *     for (const c of CAPABILITIES) c.run(session, args)
 *
 * The last of those was live: `downloadStudyJpegs` reached `run` through
 * `getCapability`, in a file the regex never scanned.
 */
export interface AccountCapabilityImpl extends Capability {
  kind: 'read' | 'write' | 'account';
  run: (request: MyChartRequest, args: CapabilityArgs, ctx?: CapabilityContext) => Promise<unknown>;
  /**
   * For read capabilities: `run` returns the scraper's {@link RawResponse}
   * envelope and this turns it into the requested {@link OutputMode}. A
   * capability without one ignores `mode` (writes, account management, media).
   * `unknown` rather than a per-entry type parameter: the registry only ever
   * hands the processor to {@link renderOutput}, which is generic over it.
   */
  processor?: Processor;
}

/**
 * A `public`-kind capability: it takes arguments and nothing else.
 *
 * The absent `request` parameter is the enforcement, not a simplification.
 * Every guarantee in this registry about reading the right patient's chart
 * rests on a session, and the way to be certain a capability cannot violate
 * one is for it to have no session to violate it with. A public capability
 * that grew a chart read would not compile.
 *
 * It is otherwise an ordinary read: a public *scraper* returns a `RawResponse`
 * like every other one, and its `processor` gives it the same `raw` /
 * `standard` / `concise` / `json` modes.
 */
export interface PublicCapabilityImpl extends Capability {
  kind: 'public';
  run: (args: CapabilityArgs) => Promise<unknown>;
  /** As on {@link AccountCapabilityImpl}. Absent when `run` returns a finished object. */
  processor?: Processor;
}

/**
 * A capability the registry declares and deliberately does not implement.
 *
 * `run?: never` is the enforcement. A capability whose shape we have never
 * confirmed against a real MyChart cannot acquire a scraper by someone wiring
 * one up in a hurry — the entry has nowhere to put it, so the mistake is a type
 * error at the point of the mistake rather than an empty list in production.
 * `processor?: never` follows: there is no response to process, so `mode` is
 * meaningless here and clients do not offer it.
 *
 * The entry stays in the registry rather than being deleted, because a client
 * that silently lacks a tool and a client that has one saying "not implemented"
 * are very different for a caller trying to find out whether OpenRecord can do
 * a thing. `capability-parity.unit.test.ts` holds the second one.
 */
export interface UnimplementedCapabilityImpl extends Capability {
  kind: 'read' | 'write';
  notImplemented: string;
  run?: never;
  processor?: never;
}

export type CapabilityImpl = AccountCapabilityImpl | PublicCapabilityImpl | UnimplementedCapabilityImpl;
