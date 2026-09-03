/**
 * This app's arg check, at the edge where model-emitted tool input arrives.
 *
 * The registry takes `CapabilityArgs` — one scalar per declared param — and
 * every client is responsible for producing that from whatever its own callers
 * hand it. The other two already did: the desktop extension's zod schemas fail
 * a bad tool call with InvalidParams before the handler runs, and the CLI's
 * `coerceCapabilityArgs` narrows each `--arg` by the declared type. This app
 * had nothing. `input` here came straight off the model's JSON, so an object in
 * a string slot reached the scraper as the literal "[object Object]".
 *
 * That is a live hazard rather than a theoretical one, because it is not only
 * ids that flow through: `send_message` takes `subject` and `message`, and
 * `add_emergency_contact` takes a name and a phone number. Those are sent to
 * the patient's provider. A wrong id fetches nothing; a wrong message body is
 * a real message, and there is no honest rendering of an object as one.
 *
 * So a structural value throws, naming the argument. `executeLocalTool` turns a
 * throw into an `{ error }` tool result, which is the one channel the model can
 * read and correct itself from — dropping the arg silently would instead file
 * the message under the wrong topic, or report a required arg as simply missing.
 */
import { type CapabilityArgs } from "../../../../shared/capabilities";

/** "an array", "an object", "a function" — the article has to match the noun. */
function describe(value: unknown): string {
  const kind = Array.isArray(value) ? "array" : typeof value;
  return `${/^[aeiou]/.test(kind) ? "an" : "a"} ${kind}`;
}

export function toCapabilityArgs(input: Record<string, unknown>): CapabilityArgs {
  const out: CapabilityArgs = {};
  for (const [name, value] of Object.entries(input)) {
    // Absent is a valid answer for every optional param; the registry's
    // accessors already fall back. Only a *present* non-scalar is an error.
    if (value === undefined || value === null) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out[name] = value;
      continue;
    }
    throw new Error(
      `Argument "${name}" must be a string, number or boolean; received ${describe(value)}.`,
    );
  }
  return out;
}
