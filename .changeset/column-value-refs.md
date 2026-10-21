---
"@platforma-open/milaboratories.tcrdisco-enrichment": major
"@platforma-open/milaboratories.tcrdisco-enrichment.kind": major
"@platforma-open/milaboratories.tcrdisco-enrichment.model": major
"@platforma-open/milaboratories.tcrdisco-enrichment.ui": major
"@platforma-open/milaboratories.tcrdisco-enrichment.workflow": major
---

The main dataset, CD4/CD8 dataset, CD4/CD8 subset, design covariate, contrast factor and pairing metadata columns are stored as column ids of the result pool instead of references to upstream outputs or column labels, and the numerator and denominator groups as column value references to the contrast factor column, so the block that produced the metadata knows which of its values this block uses. The options of every column and value picker, and the check that the CD4/CD8 subset column holds CD4 or CD8 values, are built by the model. Opening a project created before this change keeps the picked columns, converted to the new ids, but clears the numerators, the denominators and the pairing metadata column, since they were stored as plain values and a column label, which name no producing block; the numerators and denominators have to be picked again before the block runs, and the pairing column again where the data has no barcode to pair by. The initialization params of the kind carry the same column ids and references, so templates made for an earlier version of the kind cannot be applied.
Numerators and denominators that are no longer among the values of the contrast factor column stay selected and are marked as not available instead of being removed silently, with a tooltip naming the block that was to provide them, as a link to it, and what went wrong. Changing the contrast factor still clears them.
