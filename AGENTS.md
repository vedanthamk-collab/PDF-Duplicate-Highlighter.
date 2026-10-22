# Working on PDF Duplicate Highlighter

Continue this repository's existing history (v0.4 baseline). Never initialize a replacement repository or rewrite published commits. Work on a branch and submit a pull request for review.

Use Node.js 22 or newer. Install dependencies, run `npm test`, and run `npm run build` after provisioning the offline English OCR model as described in README.md. Tests must exercise production matching/export functions, not search source code for expected phrases.

Prioritize false-positive prevention: the same patient, form, invoice ID, or test name alone does not prove that pages are duplicates. Changed dates, values, identifiers and short/blank pages need regression coverage. Keep the earliest original and preserve page order in exports. Never add marks to the cleaned PDF or mutate the source bytes.

Keep document processing local. Never commit user PDFs or upload their contents. Use synthetic fixtures in tests. Report accuracy and speed with evidence; do not promise a twofold speedup without measurements on equivalent inputs.

The current viewer owns scans; dedicated OCR workers do not guarantee survival of tab discard or browser shutdown. Avoid animation-frame dependencies in scanning. A future persistent/offscreen scanning design needs real Chrome lifecycle tests, cancellation and recovery; source assertions cannot prove background reliability.
