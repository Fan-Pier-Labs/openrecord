/**
 * Whether this instance serves `/api/conversations/GetConversationMessages`.
 *
 * `serves` is the shape the endpoint was captured with: it answers the whole
 * thread. `errors` is the other real behavior — a live instance answers every
 * call to it with a 500 and `{"Message":"An error has occurred."}`, for every
 * conversation, body and content-type, while inlining that account's messages
 * in `GetConversationList` instead. It is not a release difference (the same
 * Epic release serves it elsewhere), so it rides on its own knob rather than
 * `epicVersion`.
 *
 * Switch with `POST /mode {"conversationMessages":"errors"}`. Global to the
 * process and restored by `/reset`.
 */

export const THREAD_ENDPOINT_MODES = ['serves', 'errors'] as const;
export type ThreadEndpointMode = (typeof THREAD_ENDPOINT_MODES)[number];

export const DEFAULT_THREAD_ENDPOINT_MODE: ThreadEndpointMode = 'serves';

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
