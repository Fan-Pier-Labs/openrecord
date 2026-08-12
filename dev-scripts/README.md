# dev-scripts

Run-it-yourself demos and diagnostics. **Nothing here ships**, nothing imports
it, and no test covers it.

It exists so that product modules don't carry `if (import.meta.main)` blocks.
Those blocks are unreachable from a test, which under a per-file coverage gate
means an otherwise well-covered module gets dragged under the bar by a few lines
of demo code — and the only fixes are to waive the whole file or to leave the
gate red. Keeping them here lets `bunfig.toml` ignore one folder instead of
waiving real modules.

Add to this folder freely; the test globs in `package.json` don't reach it.
