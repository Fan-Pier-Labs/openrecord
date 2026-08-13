# Files excluded from git (contain real patient data)

The following files are important for reverse engineering the eUnity imaging viewer but contain real patient identifiers (MRN, DOB, physician name) and are excluded from git via `.gitignore`:

- `files-pulled-from-mychart/viewer.html` — eUnity viewer HTML with embedded patient metadata
- `input_study_one/amf_metadata.bin` — AMF binary metadata containing patient identifiers

`.gitignore` matches these by **basename** (`**/viewer.html`, `**/amf_metadata.bin`), not by the paths above. It used to pin them to `scrapers/myChart/clo-to-jpg-converter/`, which has since been renamed twice — so the rule matched nothing at all while still reading as though it protected these files. Keep the match basename-wide: the directory will move again, and a PII guard that fails open is worse than one that is slightly broad.
