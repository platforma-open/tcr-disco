---
"@platforma-open/milaboratories.tcrdisco-enrichment.kind": minor
"@platforma-open/milaboratories.tcrdisco-enrichment.model": minor
"@platforma-open/milaboratories.tcrdisco-enrichment": minor
---

Add the block-kind package, so the block satisfies the canonical structure of block-tools 2.14.3 (every block must declare exactly one sibling `kind/`) and can be created from a project template.

`BlockParams` carries the analysis only — the input dataset, the contrast factor and its numerators/denominators, covariates, the A/B pairing switch and its metadata column, and the four thresholds. View state is out by design, and so are `cdRef` / `cdSubsetCol`: the args lambda refuses a `cdRef` whose subset column has not been confirmed to hold CD4/CD8 values, and that confirmation is only produced when a user picks the column in the UI, so a template-set pair would leave the block permanently args-invalid.

The model gains the three wiring points 1.82.0 requires: `new DataModelBuilder({ kind })`, `init(({ params }) => …)` falling back to the hand-created defaults for every field, and `templateParams()` projecting the same fields back out for template export.
