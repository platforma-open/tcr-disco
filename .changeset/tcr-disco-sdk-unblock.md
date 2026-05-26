---
'@platforma-open/milaboratories.tcrdisco-enrichment.workflow': patch
'@platforma-open/milaboratories.tcrdisco-enrichment.model': patch
'@platforma-open/milaboratories.tcrdisco-enrichment.ui': patch
'@platforma-open/milaboratories.tcrdisco-enrichment': patch
---

Unblock TCR Disco against current upstream Samples & Data and Miltenyi TCR/BCR Clonotyping releases.

- Bump `@platforma-sdk/block-tools` to 2.9.0, `@platforma-sdk/tengo-builder` to 3.0.3, and `@platforma-sdk/workflow-tengo` to 5.19.0 to clear the CI floor. The workflow-tengo bump also fixes empty TCR AB Pairs — older 5.8.1 silently dropped the synthesized Barcode ID column from the metadata TSV.
- Add a `multiplexing-source` workflow resolver that synthesizes a "Barcode ID" metadata column from S&D 2.7.0+'s new `pl7.app/sequencing/multiplexingRules` upstream column.
- Teach the model's `barcodeColPresent` output to detect single-tag `multiplexingRules` columns so the UI auto-hides the manual pairing-metadata dropdown on the new shape.
- Guard `wf.resolve(args.cdSubsetCol)` against undefined refs.
- Stabilize the heatmap pages' `dataStateKey` so navigating away no longer resets the user's filters back to defaults.

Pre-migration projects that still emit the legacy `Barcode ID` metadata column continue to work unchanged.
