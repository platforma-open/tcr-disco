# @platforma-open/milaboratories.tcrdisco-enrichment.model

## 1.2.1

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

## 1.2.0

### Minor Changes

- 7cb8720: Include feature to always show all samples in plots
- abc392c: New changeset

## 1.1.1

### Patch Changes

- c4d0ead: Allow empty inputs

## 1.1.0

### Minor Changes

- ede2472: First block version
