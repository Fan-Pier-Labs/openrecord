/**
 * Whether this instance serves `/api/conversations/GetConversationMessages`.
 *
 * `errors` is the default because it is the only behavior anyone has actually
 * observed: all four instances checked answer every call to it with a 500 and
 * `{"Message":"An error has occurred."}` — every conversation, every body
 * shape and content-type tried — and inline that account's messages in
 * `GetConversationList` instead. It is not a release difference; the instances
 * span different Epic releases and behave identically here. The capture
 * harness has no skeleton for this endpoint either, which is the same finding
 * from a fourth angle.
 *
 * `serves` returns the thread. No captured instance does this, so treat it as
 * an assumption rather than a capture: the request body we send
 * (`{conversationId, PageNonce}`) has the same provenance as the response
 * fields this endpoint's parser used to guess, so the 500 may well be our
 * request rather than the endpoint. It stays because a conversation whose
 * messages the listing truncates has to come from somewhere, and we want the
 * parsing path covered for when the right request is worked out.
 *
 * Switch with `POST /mode {"conversationMessages":"serves"}`. Global to the
 * process and restored by `/reset`.
 */

export const THREAD_ENDPOINT_MODES = ['serves', 'errors'] as const;
export type ThreadEndpointMode = (typeof THREAD_ENDPOINT_MODES)[number];

export const DEFAULT_THREAD_ENDPOINT_MODE: ThreadEndpointMode = 'errors';

const endpointState: { mode: ThreadEndpointMode } = {
  mode: DEFAULT_THREAD_ENDPOINT_MODE,
};

export function getThreadEndpointMode(): ThreadEndpointMode {
  return endpointState.mode;
}

export function threadEndpointErrors(): boolean {
  return endpointState.mode === 'errors';
}

export function setThreadEndpointMode(mode: ThreadEndpointMode): void {
  endpointState.mode = mode;
}

export function resetThreadEndpointMode(): void {
  endpointState.mode = DEFAULT_THREAD_ENDPOINT_MODE;
}
