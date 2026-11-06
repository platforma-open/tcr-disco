# @platforma-open/milaboratories.tcrdisco-enrichment.kind

## 2.0.0

### Major Changes

- 0d09745: The main dataset, CD4/CD8 dataset, CD4/CD8 subset, design covariate, contrast factor and pairing metadata columns are stored as column ids of the result pool instead of references to upstream outputs or column labels, and the numerator and denominator groups as column value references to the contrast factor column, so the block that produced the metadata knows which of its values this block uses. The options of every column picker are built by the model. A CD4/CD8 subset column that is gone keeps Run disabled and is shown as not available, and one whose values cannot be read says why under its picker, instead of the block waiting for its values; why the values of the contrast factor column cannot be read is shown under the numerator and denominator pickers. Opening a project created before this change keeps the picked columns, converted to the new ids, and keeps the numerators and denominators, converted to column value references to the same contrast factor column. Picked values are always text, so a group picked from a numeric column still matches its value. Picks that cannot be converted are reset and must be picked again: the pairing metadata column, which was stored as a column label that names no producing block, the numerators and denominators of a block that had no contrast factor column picked, and the sequence, label and color columns of the alignment that were picked from upstream blocks. Until the pairing metadata column is picked again, TCR alpha/beta pairs are found by the "Barcode ID" metadata column, as for a block that never had one picked. The initialization params of the kind carry the same column ids and references, so templates made for an earlier version of the kind cannot be applied.
  Numerators and denominators that are no longer among the values of the contrast factor column stay selected and are marked as not available instead of being removed silently, with a tooltip naming the block that was to provide them, as a link to it, and what went wrong. Changing the contrast factor still clears them.

## 1.1.1

### Patch Changes

- 4819a25: Change block name

## 1.1.0

### Minor Changes

- 41ba15b: Add the block-kind package, so the block satisfies the canonical structure of block-tools 2.14.3 (every block must declare exactly one sibling `kind/`) and can be created from a project template.

  `BlockParams` carries the analysis only — the input dataset, the contrast factor and its numerators/denominators, covariates, the A/B pairing switch and its metadata column, and the four thresholds. View state is out by design, and so are `cdRef` / `cdSubsetCol`: the args lambda refuses a `cdRef` whose subset column has not been confirmed to hold CD4/CD8 values, and that confirmation is only produced when a user picks the column in the UI, so a template-set pair would leave the block permanently args-invalid.

  The model gains the three wiring points 1.82.0 requires: `new DataModelBuilder({ kind })`, `init(({ params }) => …)` falling back to the hand-created defaults for every field, and `templateParams()` projecting the same fields back out for template export.
