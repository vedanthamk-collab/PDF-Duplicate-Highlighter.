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
npm run build
```

Load the generated `dist/` folder in Chrome. The build bundles local `pdfjs-dist` modules. Never use a CDN for the extension's JavaScript.

## Matching behavior

Pages are rendered at reduced scale for comparison. Each page's normalized grayscale thumbnail and difference hash are compared against earlier pages. Strict thresholds avoid blindly marking similar blank forms. The first occurrence owns the group; all later matches receive its page number.

**Limitations:** This is a prototype and visually similar forms can be mistaken for duplicates, particularly when only dates, numbers, or names differ. Review flagged matches before skipping them. Rotated, heavily cropped, or significantly altered scans can be missed. Browser-origin limitations mean some claim-portal PDF URLs cannot be fetched; download those PDFs first. Confirm company policies before processing sensitive patient documents.
