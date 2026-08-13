# files-pulled-from-mychart

**Not our code. Not a dependency. Nothing here is imported, built, or shipped.**

These are eUnity's own viewer assets, downloaded verbatim from a real MyChart
instance's `/e/viewer/` path. They are kept as **reference material for
reverse-engineering the CLO image format** — the CLO decoder that actually runs
in this repo is `../clo_to_bitmap.ts`, pure TypeScript, written by reading
these.

That distinction is the reason the folder was renamed. It used to be called
`wasm/`, which reads like a build input — the sort of thing a bundler config
might be expected to reference or a reviewer might assume is loaded at runtime.
It isn't. No source file in the repo references any file in here, and a dead-code
audit flagged the whole 6.9 MB as unreferenced, which was true and beside the
point.

## What's here

| File | What it is |
| --- | --- |
| `eunityviewer.dart.js` | The main viewer, Dart compiled to JS (~5.9 MB) |
| `eunity_viewer_worker_wasm.dart.js` | Its worker thread |
| `LookupWrapperJSW512MB.{js,wasm}` | Lookup-table module the viewer instantiates |
| `LookupWrapperWorkerJSW.{js,wasm}` | Worker variant, ~10 instances at runtime |
| `api.js`, `eunitylauncher.js`, `testingApi.js` | Viewer bootstrap and API surface |

The protocol notes derived from reading them live in
`../../eunity/docs/EUNITY_PROTOCOL.md` and
`../../eunity/docs/CLO_TO_IMAGE_WASM_APPROACH.md`.

## Before you touch this folder

- **Don't import from it.** If you need decode behaviour, it belongs in
  `clo_to_bitmap.ts` where it can be tested.
- **Don't add patient data.** `viewer.html` from the same directory on a real
  instance carries an MRN, a date of birth and a physician name; it is
  gitignored by basename and must stay out. See `../PII_FILES_NOT_IN_GIT.md`.
- **It is third-party code**, vendored into a proprietary source-available repo.
  Redistribution terms have not been reviewed — worth settling before this
  folder goes anywhere public.
