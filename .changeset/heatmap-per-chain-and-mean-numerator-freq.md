---
"@platforma-open/milaboratories.tcrdisco-enrichment.model": minor
"@platforma-open/milaboratories.tcrdisco-enrichment.ui": minor
"@platforma-open/milaboratories.tcrdisco-enrichment.workflow": minor
"@platforma-open/milaboratories.run-tcrdisco-enrichment.software": minor
"@platforma-open/milaboratories.tcrdisco-enrichment": minor
---

Enriched-clonotypes heatmap: log-transformed blue-red frequency map with CDR3 + V-gene Y labels, ranked by a per-clonotype "Mean numerator frequency" — the mean of the clonotype's per-replicate fraction over the target (numerator) replicates where it is present.

Per-chain state for the volcano plot and the enriched-clonotypes heatmap: alpha and beta keep independent chart state, so a custom data-mapping on one chain no longer becomes inconsistent after switching to the other. Both charts also precompute per-chain pFrames/columns, so switching chains does not trigger a model recompute.
