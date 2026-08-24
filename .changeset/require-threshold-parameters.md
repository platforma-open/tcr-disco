---
"@platforma-open/milaboratories.tcrdisco-enrichment.model": patch
"@platforma-open/milaboratories.tcrdisco-enrichment.ui": patch
"@platforma-open/milaboratories.tcrdisco-enrichment": patch
---

Block Run while any threshold parameter is empty.

Clearing a `PlNumberField` writes `undefined`, which previously reached the workflow as a missing threshold. `BlockData` now types the four thresholds as `number | undefined` (what the field can actually produce), the args lambda throws on each so Run is disabled, and the field shows "Value is required" so the user can see which one is holding the run back.
