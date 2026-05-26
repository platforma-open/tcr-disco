---
'@platforma-open/milaboratories.tcrdisco-enrichment.workflow': patch
'@platforma-open/milaboratories.tcrdisco-enrichment': patch
---

Unblock TCR Disco against current upstream Samples & Data and Miltenyi TCR/BCR Clonotyping releases. Bumps `@platforma-sdk/block-tools` to 2.8.4 to clear the CI floor and adds a `multiplexing-source` workflow resolver that synthesizes a "Barcode ID" metadata column from the new `pl7.app/sequencing/multiplexingRules` upstream column when projects no longer emit the legacy column directly. Pre-migration projects that still emit the `Barcode ID` metadata column continue to work unchanged.
