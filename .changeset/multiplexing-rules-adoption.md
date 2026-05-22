---
"@platforma-open/milaboratories.tcrdisco-enrichment": patch
"@platforma-open/milaboratories.tcrdisco-enrichment.model": patch
"@platforma-open/milaboratories.tcrdisco-enrichment.workflow": patch
---

Adopt the new `pl7.app/sequencing/multiplexingRules` column from Samples & Data 2.7.0+ for the TCR A/B pairing analysis. The block now reads multiplexing rules upstream and synthesizes the per-sample `Barcode ID` column the R script joins against — restoring pairing on fresh-import projects where Samples & Data no longer emits a legacy `Barcode ID` metadata column. Backwards compatibility preserved: projects that carry a legacy `Barcode ID` metadata column (e.g. those upgraded from pre-2.7.0 Samples & Data) continue to use that column unchanged; synthesis is skipped to avoid duplicate columns. No UI changes and no new settings — the block looks identical to the previous release.
