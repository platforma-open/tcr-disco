---
'@platforma-open/milaboratories.tcrdisco-enrichment.workflow': patch
'@platforma-open/milaboratories.tcrdisco-enrichment.model': patch
'@platforma-open/milaboratories.tcrdisco-enrichment': patch
---

Unblock TCR Disco against current upstream Samples & Data and Miltenyi TCR/BCR Clonotyping releases. Bumps `@platforma-sdk/block-tools` to 2.8.4, `@platforma-sdk/tengo-builder` to 3.0.3, and `@platforma-sdk/workflow-tengo` to 5.19.0 to clear the CI floor and restore correct synthesized-PColumn propagation through `pframes.tsvFileBuilder` (older 5.8.1 runtime silently dropped the synthesized Barcode ID column from the metadata TSV, killing TCR AB Pairs results). Adds a `multiplexing-source` workflow resolver that synthesizes a "Barcode ID" metadata column from the new `pl7.app/sequencing/multiplexingRules` upstream column when projects no longer emit the legacy column directly, teaches the model's `barcodeColPresent` output to detect single-tag `multiplexingRules` columns so the UI auto-hides the manual pairing-metadata dropdown for the new shape, and guards `wf.resolve(args.cdSubsetCol)` against undefined refs (newer workflow-tengo no longer accepts them silently). Pre-migration projects that still emit the legacy `Barcode ID` metadata column continue to work unchanged.
