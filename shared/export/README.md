# `shared/export`

The whole-chart export, and grouping it by health issue.

| | |
| --- | --- |
| **Clients** | Claude Desktop extension: `export_everything`, `list_export_items`, `organize_export` · CLI: `--action export` |
| **Source** | [`exportEverything.ts`](exportEverything.ts) · [`organizeExport.ts`](organizeExport.ts) · [`nodeExportFolder.ts`](nodeExportFolder.ts) |

## Why it is built this way

- **Deterministic, not model-driven.** A model can call every read tool, but a chart does not fit in
  a context window (Claude Desktop refuses tool results over 1 MB), cannot be written to disk from a
  chat, and would come out different every run. The export walks the registry instead:
  `FULL_SCRAPE_CAPABILITIES` for the category data, then each record's drill-down capability.
- **Every read is its own `executeCapability` call**, so the active-patient assertion runs before
  each. A patient switched mid-export makes the rest refuse; it never writes another family member's
  records into the folder. Reads are sequential.
- **Grouping is the model's judgement, written deterministically.** Which bill was for the shoulder
  is not in any field. The model reads one line per record (`list_export_items`) and returns item
  ids; `organizeExport` writes the pages, and an id that is not in the export is reported back, not
  rendered. In Claude Desktop the model is the user's own Claude — no API key, no second model.
- **Composites, not registry capabilities.** They need a folder on disk, which only the Node
  clients have. The Expo app does not expose the export yet (it would need `expo-file-system` and a
  share sheet).

## Layout

```
OpenRecord export - <hostname> - <YYYY-MM-DD>/
├── README.md              counts, layout, and every item that could not be exported, with why
├── index.json             format "openrecord-export/1": every record — id, category, date, title, about, files
├── data/<capability>.json every argument-free read, in `json` mode (every field the processor keeps)
├── data/<capability>.md   the same, as Markdown
├── records/<Category>/<date> <title>.md   one per record; empty fields pruned for reading
│   Visits/…md             the visit, then each clinical note, then the After Visit Summary
│   Messages/…md           the full thread; attachments beside it as `<record> - <name>.<ext>`
│   Documents/…pdf|jpg|…   the Document Center file beside its record
│   Billing statements/…pdf
│   Imaging/… - images/NNN <series>.jpg   full-resolution, decoded from CLO
└── By health issue/       written by organizeExport: README.md, one page per issue, groups.json
```

`index.json` is written last, so its presence means the export finished. Paths in it are
`/`-separated and relative to the export root.

## Behaviours worth knowing

- Document Center entries MyChart serves for in-portal viewing only (e.g. some Visit Summaries)
  have no file to download; they are listed under "Not exported" with MyChart's reason. The
  visit's own After Visit Summary is still in its visit record.
- A visit's index line carries the first 200 characters of its first note, because a visit type
  like "Office Visit" says nothing about which issue it was for.
- Rerunning `organizeExport` rewrites the issue pages; a page for an issue dropped from the new
  grouping stays on disk, but the issue README only links the current ones.
