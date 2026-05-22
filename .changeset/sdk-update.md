---
"@platforma-open/milaboratories.tcrdisco-enrichment": minor
"@platforma-open/milaboratories.tcrdisco-enrichment.model": minor
"@platforma-open/milaboratories.tcrdisco-enrichment.ui": minor
"@platforma-open/milaboratories.tcrdisco-enrichment.workflow": minor
---

Update SDK to 1.77.4 (block-tools 2.8.1) and migrate the block to the V3 SDK APIs: `BlockModelV3` with `DataModelBuilder`, `defineAppV3`, and `createPlDataTableV3`. Existing block instances migrate via `upgradeLegacy`; default table filters are preserved.

Adopt the new `pl7.app/sequencing/multiplexingRules` column from Samples & Data 2.7.0+ for the TCR A/B pairing analysis. The block now reads multiplexing rules upstream and synthesizes the per-sample `Barcode ID` column the R script joins against — restoring pairing on fresh-import projects where Samples & Data no longer emits a legacy `Barcode ID` metadata column. Backwards compatibility preserved: projects that carry a legacy `Barcode ID` metadata column (e.g. those upgraded from pre-2.7.0 Samples & Data) continue to use that column unchanged; synthesis is skipped to avoid duplicate columns. No UI changes and no new settings — the block looks identical to the previous release.
