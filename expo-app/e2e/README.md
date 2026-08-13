# Maestro flows

Two kinds of flow live here, and the difference matters.

## `android-smoke.yaml` — the only one CI runs

Run by the `emulator` tier of `.github/workflows/android-smoke.yml`, by explicit path:

```
cd expo-app && maestro test e2e/android-smoke.yaml
```

**It must never be able to reach a real model.** The flow stops at the Google sign-in gate, the
release build strips the `__DEV__` skip button that would get past it, and the workflow bakes a dead
`EXPO_PUBLIC_BACKEND_URL`. All three layers are load-bearing — see
[`docs/testing.md`](../../docs/testing.md#android-smoke-tests) before extending it.

## Everything else — hand-run against fake-mychart

`alerts.yaml`, `chat-tool-call.yaml`, `drawer.yaml`, `keyboard.yaml`, `signin.yaml`.

Local development flows. They assume an already-authenticated app pointed at a running
`fake-mychart`, and several start from the home screen rather than a cold boot, so they are not
self-contained. `chat-tool-call.yaml` **sends a real chat message and expects a model response** —
which is exactly why it is not, and must not become, part of the CI tier above.

If you ever replace CI's explicit path with a glob over this directory, these come with it. Don't.
