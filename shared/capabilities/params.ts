/**
 * The parameters every client offers on top of a capability's own, and the
 * accessors that read them back.
 *
 * Declared once here rather than per-capability: they are identical on every
 * entry, and `executeCapability` — not any `run` — is what applies them.
 */

import {
  DEFAULT_OUTPUT_MODE,
  OUTPUT_MODES,
  isOutputMode,
  type OutputMode,
} from '../../scrapers/myChart/processors/processor';
import type { CapabilityArgs, CapabilityParam } from './types';

/**
 * Which connected MyChart account the call is for.
 *
 * This is the one parameter every capability takes in every client, and it was
 * the last one still hand-written per client — the extension called it
 * `account` and required it, the mobile app called it `instance` and didn't.
 * That is precisely the drift this registry exists to kill, so it is declared
 * here and the parity test checks for it like any other parameter.
 *
 * `instance` stays an accepted alias: the mobile app's alerts generator and
 * alert cards pass it programmatically, and a saved chat may contain it.
 */
export const ACCOUNT_PARAM: CapabilityParam = {
  name: 'account',
  type: 'string',
  description:
    'MyChart hostname identifying which connected account to use — the `account` value from the ' +
    'client\'s account list. Optional when only one account is connected.',
};

/** Accepted spellings of {@link ACCOUNT_PARAM}, newest first. */
export const ACCOUNT_PARAM_NAMES: readonly string[] = [ACCOUNT_PARAM.name, 'instance'];

/** Read the account selector out of a client's arguments, whichever name it used. */
export function readAccountArg(args: CapabilityArgs): string | undefined {
  for (const name of ACCOUNT_PARAM_NAMES) {
    const value = args[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}


/**
 * The output mode a caller asked for, defaulting to {@link DEFAULT_OUTPUT_MODE}.
 * An unknown value is an error rather than a silent fallback: a caller that
 * typed `mode: 'summary'` and got JSON back would not know it was ignored.
 */
export function readOutputMode(args: CapabilityArgs): OutputMode {
  const value = args[MODE_PARAM.name];
  if (value === undefined || value === null || value === '') return DEFAULT_OUTPUT_MODE;
  if (isOutputMode(value)) return value;
  throw new Error(`Unknown mode ${JSON.stringify(value)}. Expected one of: ${OUTPUT_MODES.join(', ')}.`);
}

/**
 * How a read capability's payload is rendered. Declared once, like
 * {@link PATIENT_PARAM}: every client offers it on every capability that
 * {@link acceptsModeParam}, and {@link executeCapability} applies it.
 */
export const MODE_PARAM: CapabilityParam = {
  name: 'mode',
  type: 'string',
  description:
    'Output mode: `concise` (markdown, the interesting fields), `standard` (markdown, every ' +
    'useful field), `json` (the standard fields as JSON), or `raw` (the untouched MyChart ' +
    'response, large).',
};

/**
 * What a model-facing client passes when the model said nothing. The MCPB and
 * the mobile agent hand the payload straight to a context window, and a 200 KB
 * visits payload is what started the processor layer; `concise` is the right
 * default there, and the model can still ask for any other mode by name.
 * Programmatic callers (the library, the CLI) get {@link DEFAULT_OUTPUT_MODE}.
 */
export const MODEL_FACING_OUTPUT_MODE: OutputMode = 'concise';

/** {@link MODE_PARAM} with the client's default stated, for tool descriptions. */
export function describeModeParam(defaultMode: OutputMode): string {
  return `${MODE_PARAM.description} Default: ${defaultMode}.`;
}

/**
 * The patient parameter every chart-touching capability accepts on top of its
 * own. Not declared per-capability — it is the same on all of them, and the
 * assertion is applied by {@link executeCapability} rather than by any `run`.
 */
export const PATIENT_PARAM: CapabilityParam = {
  name: 'patient',
  type: 'string',
  description:
    "Which patient's record this call is about, for accounts with MyChart proxy access to family " +
    "members' charts — a name from list_proxy_targets. Omit for the account holder's own record. " +
    'If MyChart is currently on a different patient the call fails (with instructions) rather than ' +
    'switching silently.',
};

