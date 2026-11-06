# @platforma-open/milaboratories.tcrdisco-enrichment.workflow

## 2.0.0

### Major Changes

- 0d09745: The main dataset, CD4/CD8 dataset, CD4/CD8 subset, design covariate, contrast factor and pairing metadata columns are stored as column ids of the result pool instead of references to upstream outputs or column labels, and the numerator and denominator groups as column value references to the contrast factor column, so the block that produced the metadata knows which of its values this block uses. The options of every column picker are built by the model. A CD4/CD8 subset column that is gone keeps Run disabled and is shown as not available, and one whose values cannot be read says why under its picker, instead of the block waiting for its values; why the values of the contrast factor column cannot be read is shown under the numerator and denominator pickers. Opening a project created before this change keeps the picked columns, converted to the new ids, and keeps the numerators and denominators, converted to column value references to the same contrast factor column. Picked values are always text, so a group picked from a numeric column still matches its value. Picks that cannot be converted are reset and must be picked again: the pairing metadata column, which was stored as a column label that names no producing block, the numerators and denominators of a block that had no contrast factor column picked, and the sequence, label and color columns of the alignment that were picked from upstream blocks. Until the pairing metadata column is picked again, TCR alpha/beta pairs are found by the "Barcode ID" metadata column, as for a block that never had one picked. The initialization params of the kind carry the same column ids and references, so templates made for an earlier version of the kind cannot be applied.
  Numerators and denominators that are no longer among the values of the contrast factor column stay selected and are marked as not available instead of being removed silently, with a tooltip naming the block that was to provide them, as a link to it, and what went wrong. Changing the contrast factor still clears them.

## 1.3.2

### Patch Changes

- 64007a8: Release every package through npm trusted publishing (OIDC) so each package's trusted publisher is used before it expires.
- Updated dependencies [64007a8]
  - @platforma-open/milaboratories.run-tcrdisco-enrichment.software@1.3.1

## 1.3.1

### Patch Changes

- 4819a25: Change block name

## 1.3.0

### Minor Changes

- 66f209d: Enriched-clonotypes heatmap: log-transformed blue-red frequency map with CDR3 + V-gene Y labels, ranked by a per-clonotype "Mean numerator frequency" — the mean of the clonotype's per-replicate fraction over the numerator replicates where it is present.

  Per-chain state for the volcano plot and the enriched-clonotypes heatmap: alpha and beta keep independent chart state, so a custom data-mapping on one chain no longer becomes inconsistent after switching to the other. Both charts also precompute per-chain pFrames/columns, so switching chains does not trigger a model recompute.

### Patch Changes

- d6494fa: Drop the stale `test` script from the workflow package, which failed CI with `sh: 1: vitest: not found`.

  The script survived the structurer migration, but `vitest` is centralized in the `test` package and is not a workflow dependency. The workflow has no test files, so the canonical end-state for it is no `test` script at all; the `test` package keeps running `vitest run --passWithNoTests`.

- Updated dependencies [66f209d]
- Updated dependencies [6ae7506]
  - @platforma-open/milaboratories.run-tcrdisco-enrichment.software@1.3.0

## 1.2.2

### Patch Changes

- c475f61: Unblock TCR Disco against current upstream Samples & Data and Miltenyi TCR/BCR Clonotyping releases.

  - Bump `@platforma-sdk/block-tools` to 2.9.0, `@platforma-sdk/tengo-builder` to 3.0.3, and `@platforma-sdk/workflow-tengo` to 5.26.0 to clear the CI floor. The workflow-tengo bump also fixes empty TCR AB Pairs — older 5.8.1 silently dropped the synthesized Barcode ID column from the metadata TSV.
    - `tengo-builder` major bump (2.x → 3.0): adds a `wasm` artefact type and build-time size guards (≤ 2 MiB per WASM, ≤ 3.4 MiB per gzipped template pack). TCR Disco ships no WASM and its template pack is well under the cap, so the bump is observationally a no-op here.
    - `workflow-tengo` at 5.26.0 (latest in the 5.x line). Verified against the 5.20–5.26 changelog: the synthesize-fix that restores the Barcode ID PColumn in `pframes.tsvFileBuilder` landed earlier in the 5.x series, and none of the breaking or behavior changes in the 5.20–5.26 window apply to TCR Disco — the block uses no `.gpuMemory()`, no `exec.builder().writeFile`, no in-place input mutation, and no WASM imports. Verified end-to-end on S&D v2 v1.17.3 with multiplexed data.
  - Add a `multiplexing-source` workflow resolver that synthesizes a "Barcode ID" metadata column from S&D 2.7.0+'s new `pl7.app/sequencing/multiplexingRules` upstream column.
  - Teach the model's `barcodeColPresent` output to detect single-tag `multiplexingRules` columns so the UI auto-hides the manual pairing-metadata dropdown on the new shape. The detection inspects `rulesCols[0]` only — symmetric with the workflow's resolver, which also tries column 0 only.
  - Guard `wf.resolve(args.cdSubsetCol)` against undefined refs.
  - Stabilize the heatmap pages' `dataStateKey` so navigating away no longer resets the user's filters back to defaults. Behavior change worth flagging: the new key composition is `selectedChain | numerators | denominators`, which intentionally omits `mainRef` / `contrastFactor` (their ref identities flicker during initial mount and re-trigger the reset). One observable consequence: saved heatmap filters now survive when the user changes the contrast factor, where the previous `:data-state-key` invalidated them. The block goes stale on contrast change, so users still see the prompt to re-Run.

  Pre-migration projects that still emit the legacy `Barcode ID` metadata column continue to work unchanged.

## 1.2.1

### Patch Changes

- Updated dependencies [c41f0b3]
  - @platforma-open/milaboratories.run-tcrdisco-enrichment.software@1.2.1

## 1.2.0

### Minor Changes

- 7cb8720: Include feature to always show all samples in plots
- abc392c: New changeset

### Patch Changes

- Updated dependencies [7cb8720]
- Updated dependencies [abc392c]
  - @platforma-open/milaboratories.run-tcrdisco-enrichment.software@1.2.0

## 1.1.1

### Patch Changes

- c4d0ead: Allow empty inputs
- Updated dependencies [c4d0ead]
  - @platforma-open/milaboratories.run-tcrdisco-enrichment.software@1.1.1

## 1.1.0

### Minor Changes

- ede2472: First block version

### Patch Changes

- Updated dependencies [ede2472]
  - @platforma-open/milaboratories.run-tcrdisco-enrichment.software@1.1.0
