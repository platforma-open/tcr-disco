---
"@platforma-open/milaboratories.tcrdisco-enrichment": patch
"@platforma-open/milaboratories.tcrdisco-enrichment.model": patch
"@platforma-open/milaboratories.tcrdisco-enrichment.ui": patch
---

Update SDK to 1.77.4 (block-tools 2.8.1) and migrate the block to the V3 SDK APIs: `BlockModelV3` with `DataModelBuilder`, `defineAppV3`, and `createPlDataTableV3`. Existing block instances migrate via `upgradeLegacy`; default table filters are preserved.
