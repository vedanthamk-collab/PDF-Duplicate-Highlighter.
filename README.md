# PDF Duplicate Highlighter

Chrome Manifest V3 extension for locally finding repeated pages in 50–200 page PDFs.

- Detects exact and near-duplicate scanned pages.
- Marks *later* copies with translucent yellow and `D2`, `D5`, etc., referring to the first occurrence.
- Original pages are untouched. The source PDF is never edited or uploaded.
- Supports local PDFs and browser-accessible direct PDF URLs. Authenticated claim portal URLs may need downloading first.
- Uses PDF.js bundled during the GitHub Actions build. No Python, Node.js, or server is required **on the user computer**.

## Install (recommended)

1. Open the repository's **Actions** tab, then select **Build Chrome Extension**.
2. Select **Run workflow** (or open the latest successful run).
3. Download artifact `pdf-duplicate-highlighter-chrome` from the completed run.
4. Extract the ZIP to a permanent folder.
5. Visit `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and choose the extracted directory containing `manifest.json`.
6. Pin the extension and click **Open PDF viewer**. Choose a downloaded PDF, or use **Import current PDF URL** when a direct PDF tab is active.

The ZIP downloaded from an Actions artifact may contain an additional parent directory. Select the inner directory containing `manifest.json`.

## Build from source (developers)

```sh
npm install
npm test
# Provision assets/eng.traineddata before building (see below).
npm run build
```

Load the generated `dist/` folder in Chrome. The build bundles local `pdfjs-dist` modules. Never use a CDN for the extension's JavaScript.

The offline model is a build prerequisite. Create `assets/` and download
[English tessdata_fast](https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata)
as `assets/eng.traineddata`. GitHub Actions performs this step automatically.
Use Node.js 22 or newer. `npm test` uses synthetic pages and runs without the OCR model.

## Continue development in Codex

This is the existing repository **vedanthamk-collab/PDF-Duplicate-Highlighter.**
(including its final period). Clone it; do not create a new repository or initialize
a new Git history. On Windows give the local folder a name without a trailing period:

```sh
git clone https://github.com/vedanthamk-collab/PDF-Duplicate-Highlighter..git PDF-Duplicate-Highlighter
cd PDF-Duplicate-Highlighter
```

The two periods before `git` are intentional: the first belongs to the repository
name, and the second begins `.git`. Cloning preserves prior commits, including v0.4.
If you already have this checkout, open that folder instead of cloning again.

In the desktop app, open/add the checkout folder as a local project and select it
for Codex. This handoff was cloned into `C:\Users\Kuraganti_V\Documents\ChatGPT\PDF Extension`.
`AGENTS.md` supplies persistent coding and verification guidance. Changes can be
reviewed locally, committed on a branch, and submitted to the same GitHub repository.
The GitHub connector provides repository access; local Git push authentication is
separate and may require signing in.

For Codex Cloud, connect GitHub, grant access to this exact repository, choose it
for a cloud environment, review its dependency/setup checks, and publish the
environment. Use `npm install`, provision the model above, then `npm test` and
`npm run build`. Start tasks against this existing repository and review pull
requests before merging. A connected GitHub plugin alone does not create a cloud
environment.

Official guidance: [desktop app](https://learn.chatgpt.com/docs/app),
[Codex Cloud](https://learn.chatgpt.com/docs/cloud).

## Current development changes after v0.4

- Production matching and clean export are separate modules covered by executable
  regression tests. Pull requests run the same tests as main-branch builds.
- Matching document identifiers or CRP values now requires near-identical word
  content and complete agreement on recognized numeric tokens, including single
  digits. A shared patient ID alone is insufficient. This conservative rule can
  miss duplicate scans when OCR misreads a number; it does not guarantee accuracy.
- Text fingerprints are prepared once per page, rather than once per comparison.
  Documents with embedded text on every page avoid starting OCR workers entirely.
- Superseded PDF loads and OCR results are prevented from overwriting a newer load.
- Clean export tests verify retained page order, original bytes, no added
  annotations, repeated duplicate entries, and invalid page numbers.

No twofold speed improvement has been measured. Scanning still belongs to the
viewer tab: switching tabs has no explicit animation-frame wait, but discard,
browser shutdown and recovery remain unimplemented. Dedicated workers alone do
not solve those lifecycle cases. Next validation should use real Chrome with
visibility changes, discard, cancellation and large mixed scanned/text PDFs.
The prior chat's PDFs are not committed; synthetic regressions do not establish
accuracy on those documents. Benchmark against a human-labeled local sample
before changing automatic-removal thresholds further.

The sections below describe earlier releases; v0.4 and the current notes above
supersede older marked-export and no-OCR descriptions.

## Matching behavior

Pages are rendered at reduced scale for comparison. Each page's normalized grayscale thumbnail and difference hash are compared against earlier pages. Strict thresholds avoid blindly marking similar blank forms. The first occurrence owns the group; all later matches receive its page number.

**Limitations:** This is a prototype and visually similar forms can be mistaken for duplicates, particularly when only dates, numbers, or names differ. Review flagged matches before skipping them. Rotated, heavily cropped, or significantly altered scans can be missed. Browser-origin limitations mean some claim-portal PDF URLs cannot be fetched; download those PDFs first. Confirm company policies before processing sensitive patient documents.

## Version 0.2 — Safer matching and navigation

- **Jump to page:** enter the PDF page number in the top toolbar and press Enter (or Go).
- **Download marked PDF:** top-right button saves a new PDF containing yellow overlays and D-number watermarks on **confirmed** duplicate pages; original PDF remains unmodified. Unconfirmed candidates are not embedded.
- **Conservative duplicate matching:** compare foreground text/line pixels, including page rotations, and check PDF text when available. Unlike the older version, large matching white areas do not count as proof of identical content.
- **Manual confirmation:** potential matches appear in the sidebar; select **Confirm D#** or **Not duplicate**. The annotation export includes manual confirmations.
- **Privacy:** all processing stays in the browser. Note that portal-import permissions still depend on the portal and Chrome access controls.

### Trade-offs and known limitations

This version prioritizes avoiding false positives, so scanned copies with changed lighting or perspective may only appear as review candidates or may be missed altogether. OCR is **not** included: scanned text may not be available for content-level comparison, and visually similar forms with different small numbers must always be checked manually. If identical forms vary significantly in capture angle, add geometric alignment/OCR in a later version.

Creating a downloadable annotated PDF from a large scan (e.g. 100+ MB) requires substantial browser memory. Export annotates pages using source page coordinates and is not a substitute for checking each match. The original document is never overwritten.

## Version 0.3 (offline OCR + low-interruption auto-detection)

This revision replaces the high-volume review queue with **one automatic high-confidence duplicate list**. It bundles Tesseract.js and an English OCR model into the extension during the GitHub Actions build (the model is never fetched while processing PDFs). No documents or medical records are uploaded. OCR may add substantial processing time for large PDFs.

The matcher requires both document identity (when readable, such as invoice or patient/report number) and significant OCR word/number overlap. Pages with insufficient evidence are **not marked**. Report forms containing common headers alone are not enough to confirm a duplicate. The system is deliberately conservative and can miss fuzzy or very faint duplicate scans. Manually inspect any unmarked pages you still suspect are repeated.

The extension does **not** guarantee perfect accuracy. In particular: faint carbon-copy pharmacy pages, rotated scans, heavy camera shadows, and images of near-identical forms can require more advanced alignment and document field extraction. The page-jump and annotated PDF export remain available.

## v0.4 — Faster processing and clean PDF export

- Uses **two offline OCR workers** to process different pages concurrently, rather than one worker for every page.
- Skips OCR on pages with sufficiently rich, embedded selectable PDF text.
- Displays pages lazily when you scroll to them; it no longer renders all page previews before analysis.
- The former annotated export is replaced with **Download PDF without duplicates**. It removes only pages currently classified as confirmed duplicates; the earliest original is retained. Pages are removed from end to beginning to preserve numbering. A confirmation shows the pages to be removed; the original PDF is never overwritten.
- **Browser background-tab note:** Dedicated OCR workers are used, but Chrome can still throttle/discard hidden tabs, depending on system memory and Energy Saver. The extension does not guarantee uninterrupted processing when a viewer tab is minimized or discarded. Keep the browser window open until analysis completes; Chrome Settings → Performance → Always keep these sites active may help for some sites, but extensions aren't necessarily eligible.
- Speed varies by machine, PDF dimensions, number of OCR-heavy pages and Chrome resource limits; **2× is a target, not a guaranteed benchmark**.
- Before removing pages, verify each confirmed match. False-positive matches can cause a necessary document to be excluded from the *new* copy. Use the Not duplicate action to undo an incorrect match.


## Interface theme and local development

The viewer and popup use a Plum-inspired aubergine, cream and coral palette, serif headlines, and rounded controls based on https://www.plumhq.com/ (reviewed 22 October 2026). This is an independent project, not affiliated with or endorsed by Plum. No company logo, remote fonts, analytics, or website assets are loaded.

Use Node.js 22 or newer. Before building, provision the offline English model:

```sh
npm install
mkdir -p assets
curl --fail --location https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata -o assets/eng.traineddata
npm test
npm run build
```

The build packages `assets/eng.traineddata` locally. Do not commit the downloaded model or user PDFs. Tests call the production matcher and clean-export functions using synthetic documents. Theme changes preserve the v0.4 two-worker OCR, embedded-text shortcut, lazy page previews, page navigation and clean export. No new speed or tab-discard reliability claim is made.

### If selecting a PDF does nothing

Load the **built `dist/` directory**, not this source directory: both contain a manifest, but only `dist/` contains the bundled PDF libraries. After replacing a build, reload the extension at `chrome://extensions` and open a fresh viewer tab. The viewer now reports module startup failures instead of silently leaving file selection disconnected.

Import current PDF URL supports direct HTTP(S) and local `file://` PDF tabs. For local-tab import, Chrome requires **Allow access to file URLs** on the extension’s Details page. Choosing a saved PDF in the viewer does not require that setting. Embedded/blob PDF viewers and protected portal pages may not expose a downloadable URL; save the PDF and choose it locally instead.

`npm run build` also provisions the ignored `vendor/` directory beside the source manifest. This supports existing unpacked installations loaded from the source folder; `dist/` remains the recommended distributable. Neither location can run before its bundled assets have been built.

Verified in Chrome on 22 October 2026: the existing unpacked source-folder installation failed with `ERR_FILE_NOT_FOUND` for PDF.js, PDF-lib and Tesseract. After building the generated libraries into that folder and reloading the extension, the viewer reached Ready; selecting a synthetic three-page PDF rendered the document and completed analysis with two duplicates referring to page 1. This verifies the local file-selection path; tab-discard recovery and protected portal imports are not covered by this check.

## Background rendering fix and measured performance (22 October 2026)

PDF.js 4.10.38 internally schedules display rendering with `requestAnimationFrame`. Removing animation-frame waits from the viewer alone did not remove this dependency: thumbnail preparation and OCR-image rendering could stall in a hidden Chrome tab. The build now applies one guarded change to the bundled PDF.js scheduler, using its existing promise-based continuation for display rendering. Display intent, annotations, optional layers, page scales, OCR resolution and matching thresholds are unchanged. A future PDF.js upgrade must explicitly review the patch if the expected scheduling point changes.

Measured in the user's installed Chrome, using identical generated 24-page PDFs at scale 0.75:

| Rendering case | Before | Updated | Evidence |
| --- | --- | --- | --- |
| Foreground, median of 3 alternating runs | 517 ms | 401 ms | About 22% less rendering time; raw runs before 503/577/517, updated 401/405/343 ms |
| Hidden tab, one paired run | 33,209 ms | 1,056 ms | Both started hidden. Updated completed all 24 pages while hidden; baseline completed 0 pages while hidden and finished after tab restoration |

These timings cover rendering only, excluding OCR, matching and export. They do not establish a 2x end-to-end speedup on arbitrary scans. The hidden baseline time depends on how long the tab remains hidden. OCR-heavy documents can still take substantial time. The viewer now reports total elapsed scan time on completion. Chrome tab discard, browser shutdown and memory pressure remain limitations; this change does not introduce a persistent scanning service.

To reproduce: run `npm run build`, then `node scripts/prepare-render-benchmark.mjs`. From the source-folder unpacked extension, open `chrome-extension://<extension-id>/benchmarks/render.html`. Foreground runs alternate engine order; the hidden test starts both engines on the actual visibility transition. Switch away, wait about 15 seconds, then return. All fixtures are generated locally; no user PDFs are read. `npm test` additionally renders a real synthetic PDF (including a form value) through both engines, asserts identical page pixels and unchanged source bytes, and verifies the updated engine completes when animation frames throw.

## Claims workspace: mixed documents and bill expenses

No new plugin, API key or cloud service is required. Existing PDF-lib, PDF.js and offline English Tesseract OCR process everything locally.

1. Click **Add documents** (or drop files into the workspace). Select PDFs, JPGs and PNGs together. Files are appended to the queue; use arrows to reorder or remove items before processing.
2. Click **Merge & scan**. PDF page order is preserved within each file. Images become PDF pages; EXIF-oriented JPEGs are normalized locally. Unsupported, unreadable or encrypted files stop the merge with the filename; partial output is not silently loaded.
3. **All pages PDF** downloads the combined document without added marks. **PDF without duplicates** removes only confirmed duplicates and keeps the earliest original. Both retain non-bill documents; your source files are untouched.
4. Open **Bill calculation**. The full-width editable table shows bill number, date, bill category, amount, currency, document type, remarks and source pages. Click a page link to verify the extraction in the viewer.
5. The draft total is **bill expenses in INR**, before claim eligibility or deductions. It uses integer paise. Receipts (linked or unmatched) are never automatically added. A standalone service receipt can contribute only after you mark it Reviewed and explicitly select Include; a linked payment receipt remains excluded. Confirmed duplicate pages are omitted. Non-bill documents are hidden under **Excluded documents**, where they can be restored for review.
6. Incomplete fields, ambiguous totals, repeated bill numbers, incomplete multi-page bills, credit/cancelled/provisional documents and non-INR values require review rather than automatic inclusion. The **Include** checkbox controls whether an eligible bill amount contributes; **Reviewed** records your check. Multiple bills on one page can be entered separately with **Add bill row**.
7. **Copy table** copies the entire bill/receipt table plus the draft total as HTML and tab-separated text for Excel or Sheets. Clipboard restrictions fall back to selected text for Ctrl+C. **Bills & receipts PDF** exports only the listed document pages (including receipts and bills excluded from the numeric total), omitting non-bills and confirmed duplicate pages.

### Extraction limits and data handling

This is conservative pattern-based extraction from existing embedded text or offline English OCR, not a guarantee of complete accounting accuracy. Handwriting, unusual layouts, OCR mistakes, amounts in words, missing bill labels and multiple bills on one page need correction. Explicit sequential page markers plus matching document number/date/source are required to group a multi-page bill automatically; a shared identifier alone never proves duplication. Other repeated bill numbers are flagged for review. No receipt is matched using amount alone.

Documents and edits remain in the current viewer's memory; closing/reloading loses the session. Non-bills must still be read once to classify them. They are excluded from the calculation, not deleted from your originals. Large/high-resolution batches can require substantial browser memory; the 200-page regression verifies page retention, not a universal speed or memory guarantee. The existing OCR worker count, rendering scheduler and duplicate thresholds remain unchanged.

Synthetic fixtures can be generated with `node scripts/generate-claims-fixtures.mjs` under ignored `tmp/claims-fixtures/`. The expected mixed batch has five pages, one duplicate invoice page, two bills totalling INR 1,734.50, one linked receipt and one excluded report. Test input PDFs/images contain no user data and must not be committed.

For the real-library integration check, run `npm run build` then `node scripts/check-claims-integration.mjs`. It invokes the production merge, OCR scanner, duplicate matcher, ledger and PDF exporters using real offline Tesseract workers in Node. The verified synthetic batch totals INR 1,734.50 and produces 5-page all-pages, 4-page duplicate-free, and 3-page bills/receipts PDFs. This is not a real Chrome lifecycle test or a real-document accuracy benchmark. Live Chrome verification on 23 October 2026 loaded the mixed PDF/JPG/PNG queue, completed offline scanning, found the expected duplicate, and displayed two bills plus one receipt with INR 1,734.50 bill expenses. Copy table reported success. All three actual Chrome downloads were checked against independently generated expected exports: 5/4/3 pages, identical rendered pixels and page order, with no added marks. Reproduce this final check using `node scripts/check-browser-downloads.mjs <synthetic-download-directory>` after generating the integration fixtures. This verifies the synthetic workflow, not tab-discard recovery or real-document extraction accuracy.

### Automatic bill calculation and fresh workspace

Every completed scan automatically extracts bills and receipts after duplicate detection. Confirmed duplicates are excluded from the ledger. Receipts are never automatically added. Reviewed standalone receipts can be explicitly included; linked payments remain excluded. Remarks contain short payment references; review issues stay in their separate column, including in copied tables. Clear all opens a fresh viewer and removes the queue, PDF preview, results and session edits without re-importing the previous URL. Original and downloaded files remain on disk.

### Bill OCR recovery and remaining accuracy limits

Weak OCR (mean confidence below 75) now retries at higher resolution in four page orientations, stopping early at confidence 85. Rotation uses full resized canvases so text is not clipped. Clear embedded text retains its shortcut. Retry text is stored separately for accounting; the duplicate matcher retains its original OCR text and thresholds. Workers remain local and are terminated after processing. Recovery adds OCR work and can make difficult batches slower; no speedup is claimed.

Claim forms/checklists are excluded even when they mention pharmacy bills or cancelled cheques. Standalone invoice numbers, cash/credit memos, repeated date punctuation, net totals and common table separators have regression coverage. A stray OCR dollar symbol does not override explicit Indian currency evidence. Amounts retain paise; they are not rounded to match a reference table. Short remarks remain separate from review issues.

Low-confidence extraction stays excluded pending review. The viewer shows Calculation incomplete when uncertain pages or missing bill totals remain; copied tables label the figure as an included subtotal with an incomplete warning. Review checkboxes and manual edits are still necessary for handwriting. Recognizer confidence is not proof of correctness.

Run `node scripts/check-bill-ocr-integration.mjs` for real offline OCR on a generated sideways invoice image. The measured synthetic case improved confidence from 50 to 95 and recovered number/date/1320.57 exactly. Local inspection of a user-supplied batch recovered two printed invoices after rotation recovery, but did **not** recover the entire human-reviewed ledger. Handwritten numbers, dates and totals remain unresolved. This change does not establish human-level extraction accuracy, real Chrome lifecycle reliability, or a complete real-batch total. User documents and extracted text remain outside Git in ignored temporary files; synthetic regressions contain no patient information.
## v0.6: local AI image reader for bill calculation (Windows)

The viewer can send page images to a vision model running on the same PC through Chrome Native Messaging. No document images are sent to an external API. The downloaded runtime and model weights come from official llama.cpp and Qwen releases; downloads are checksum-verified by setup. No API key, subscription or new npm dependency is needed. The bundled model is Qwen3-VL-4B-Instruct Q4_K_M with its Q8 vision projector (roughly 3 GB of downloads). Native Messaging requires Node.js 22+ and a separately registered helper; ordinary OCR remains available when it is absent.

From the repository in PowerShell, run:

```powershell
.\scripts\setup-local-reader.ps1 -ExtensionId YOUR_CHROME_EXTENSION_ID
```

The extension ID is shown at `chrome://extensions`. Pass `-NodePath 'C:\path\to\node.exe'` when Node is not on PATH. Setup uses only the current user's `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.pdfclaims.reader` registration and restricts access to the supplied extension ID. Its launcher, model files and generated manifest stay in ignored `tmp/local-vision/`; keep that folder while using the reader. If loading `dist/` produces a different extension ID, run setup again with that ID. Reload the extension after building so Chrome grants its declared nativeMessaging permission, then open a fresh viewer.

Local AI bill reader is enabled by default in the bill tab. After duplicate detection/OCR, candidate pages are read locally; confirmed duplicates and clear report/form pages are skipped. The model is started on demand, bound to authenticated loopback only, and shut down when the native connection closes. A single page is processed at a time. Stop AI reading cancels the active request and retains completed fields and basic OCR. Closing the viewer clears the session. Keep the viewer open; discard/shutdown recovery is not implemented.

AI fields are validated for document type, numeric amounts, currency and real calendar dates. Two-digit years are expanded using a 1969/2069 pivot and explicitly flagged. Missing or invalid fields cannot become auto-included expenses. Every AI-extracted bill remains marked for source review; totals are drafts. Independently charged service receipts can contribute as draft expenses, while explicitly linked payment acknowledgements are excluded. Remarks remain blank or short generated payment links; model prose is not copied into them. Patient names and clinical details are not requested in the output. Duplicate matching retains its original text and thresholds.

This CPU-only PC has 16 GB RAM. Local inference adds substantial processing time; do not expect OCR speed. The first 4B handwritten-invoice check took about 94 seconds, and the next about 71 seconds. Number and amount were recovered on both, but a handwritten date was still incorrect. These results are not a complete 11-bill accuracy benchmark and do not establish human-level accuracy. A smaller 2B model was tested and rejected as the default after field errors. No cloud fallback is used.

Tests: `npm test`, `npm run build`, and (after provisioning) `node scripts/check-local-reader-integration.mjs`. The last check drives the production native host framing and real local inference with a synthetic invoice. Runtime/model provisioning is intentionally outside the extension ZIP: Chrome extensions cannot bundle and execute a native model server by themselves.

Official references: https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF and https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging .

Measured 4B checks through the production native host: invoice 15 amount 473 and date normalized to 27-06-2026; invoice 1069 amount 2100 but date misread as 29-06-2026; hospital bill 3370 amount 77000 and date 02-07-2026. Thus these three images yielded 3/3 correct bill numbers and amounts, 2/3 correct dates. They are selected diagnostic checks, not an unbiased accuracy estimate for other documents. The real native-reader synthetic integration passed number/date/amount assertions. A Chrome-to-native live check remains pending a user reload of the updated extension. The current Windows launcher hello/framing check passed.

### Local AI latency fixes

The viewer publishes duplicate results and its initial bill table as soon as the OCR scan completes. AI then enhances bill fields in the same open viewer without blocking document review, duplicate-free/all-pages export, or a new upload. Partial table copies are explicitly provisional; bills-only export waits until the AI queue ends. New scans cancel the previous AI request, and stale results are ignored. Stop AI reading is accessible beside the workspace tabs.

The accounting retry planner skips clear report/form pages, confirmed duplicate pages and complete, sufficiently clear OCR bill rows. Unreadable candidates remain eligible rather than being silently discarded. This also avoids four high-resolution accounting OCR retries for clear medical reports such as the one shown in the supplied recording. AI image resolution, model weights and duplicate thresholds are unchanged. This reduces unnecessary work, not the intrinsic CPU cost of difficult handwriting.

The native helper caches up to 32 image results by SHA-256 in memory for identical page requests. Rescanning identical rendered images can reuse those results; changed images require new inference. Cache entries disappear when the native helper closes. Cancelled or failed requests are not cached. A page request now has a two-minute client deadline; a timeout retains basic OCR and marks remaining results for review. It does not mean the page was successfully read within two minutes.

Measured with the production native host on an identical generated invoice: first request 80,536 ms; same-image cache hit 2 ms with identical fields. This measures inference reuse only, not a 2x end-to-end speedup or first-read handwriting performance. Chrome live review of the new staged UI is still pending. The recording was inspected locally; it showed high-resolution OCR retries on page 20/40, before model inference.
