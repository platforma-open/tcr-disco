---
'@platforma-open/milaboratories.tcrdisco-enrichment.workflow': patch
'@platforma-open/milaboratories.tcrdisco-enrichment.model': patch
'@platforma-open/milaboratories.tcrdisco-enrichment': patch
---

Unblock TCR Disco against current upstream Samples & Data and Miltenyi TCR/BCR Clonotyping releases. Bumps `@platforma-sdk/block-tools` to 2.8.4 and `@platforma-sdk/tengo-builder` to 3.0.3 to clear the CI floor, adds a `multiplexing-source` workflow resolver that synthesizes a "Barcode ID" metadata column from the new `pl7.app/sequencing/multiplexingRules` upstream column when projects no longer emit the legacy column directly, and teaches the model's `barcodeColPresent` output to detect single-tag `multiplexingRules` columns so the UI auto-hides the manual pairing-metadata dropdown for the new shape. Pre-migration projects that still emit the legacy `Barcode ID` metadata column continue to work unchanged.
