# TCR Disco — Adopt `multiplexingRules` with Legacy Metadata Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore TCR A/B pairing on projects whose `Samples & Data` block emits the new `pl7.app/sequencing/multiplexingRules` column instead of a `Barcode ID` metadata column — while keeping backwards compatibility with legacy projects and keeping the block visually identical to the previous stable release (no new UI, no new settings, default behaviour preserved).

**Architecture:** Add a lean Tengo lib that mirrors Miltenyi's `multiplexing-source.lib.tengo` but only returns the per-sample barcode value (TCR Disco does not need group structure). The workflow injects that map as a synthesized `Barcode ID` column into the existing `metadataTsv` builder, so the R script (`find-pairs.R`) finds the `sample_id_col` it already expects — no R-side changes. The model's `barcodeColPresent` output also returns true when the rules column is present, so the existing fallback dropdown stays hidden in the common path. All changes are internal — operators see the same block as `tcr-disco@1.2.1`.

**Tech Stack:** Tengo (workflow), TypeScript (block model, `@platforma-sdk/model` 1.77.4), R (find-pairs.R — unchanged), pnpm/turbo.

**Backwards-compat complexity assessment (decision input):**

| Aspect | Cost | Conclusion |
|---|---|---|
| Workflow detection branch (`if mx.ok ... else if legacy col already in allMetadata`) | ~5 LOC in `main.tpl.tengo` body | Trivial |
| Resolver lib with two parse paths | ~80 LOC in new `multiplexing-source.lib.tengo` | One file, fully tested by unit test in Task 1 |
| Model `barcodeColPresent` OR-clause | ~6 LOC in `model/src/index.ts` | Trivial |
| Test surface | One Tengo unit test for the rules parser; manual pl-mcp verification covers both real-project flows | Small |

Total dual-path overhead: ~100 LOC and one unit test. **Verdict: keep backwards compat.** Cost is comparable to picking just one path, and it guarantees `OldMiltenyi`-style projects (legacy metadata column only, no rules column yet — observed in our pl-mcp inspection) continue working unchanged.

**Scope guard:** Multi-tag rules (`barcodeTags.length > 1`) and multi-alternative cells (multiple rule entries for the same `(sampleGroupId, sampleId)`) are out of scope for v1. Miltenyi has the same v1 limitation. If encountered, the resolver returns `{ok: false, message}` and the workflow falls back to the user-picker dropdown path (current `pairingMetadataCol` UI), preserving the existing UX exactly.

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `workflow/src/multiplexing-source.lib.tengo` | **Create** | `addSelectors(bundleBuilder)` + `resolve(columns)` returning `{ok, sampleBarcodes: {sampleId → value}, message?}` |
| `workflow/src/main.tpl.tengo` | Modify (lines 119–122, 154–168, 285–296) | Wire the selectors in `wf.prepare`, call `resolve` in `wf.body`, inject synthesized column into `metadataTable` |
| `model/src/index.ts` | Modify (`barcodeColPresent` output) | OR-clause: detect either the legacy metadata col OR a `multiplexingRules` column anchored on the main dataset |
| `workflow/src/test/multiplexing-source.test.tpl.tengo` | **Create** | Tengo unit test rendering parser against synthetic inputs (rules-only, legacy-only, neither, multi-tag, multi-alt) |
| `workflow/src/test/multiplexing-source.test.ts` | **Create** | TypeScript test runner that drives the above tengo test through `blockTest` |
| `.changeset/<random>.md` | **Create** | Patch-level changelog entry |

Files explicitly *not* touched:
- `software/src/tcr-disco/find-pairs.R` — already accepts `--sample_id_col` and uses it correctly when the column exists in metadata.tsv (verified in this plan's research phase).
- `ui/src/pages/MainPage.vue` — pairing dropdown stays as-is (it only renders when `!barcodeColPresent && findTcrAbPairs`, and after Task 4 that condition matches stable's behaviour in both NewMiltenyi-style and OldMiltenyi-style projects).
- `workflow/src/tcr-ab-pairs.tpl.tengo` — `pairingMetadataCol` contract unchanged.

---

## Task 0: Confirm worktree state

**Goal:** Establish a clean starting point in the existing fix/sdk-update worktree; no code changes.

**Files:** none (read-only)

**Acceptance Criteria:**
- [ ] On branch `fix/sdk-update`
- [ ] `git status` shows no uncommitted changes (or only this plan file)
- [ ] `pnpm install` completes cleanly
- [ ] `pnpm -r build` from worktree root succeeds (baseline before changes)

**Verify:** `git -C /Users/paulnewling/Desktop/Code/mictx/worktrees/tcr-disco/fix-sdk-update status -s` → empty or only `?? docs/superpowers/plans/2026-05-22-tcr-disco-multiplexing-rules-adoption.md`

**Steps:**

- [ ] **Step 1: Check branch and remote**

```bash
cd /Users/paulnewling/Desktop/Code/mictx/worktrees/tcr-disco/fix-sdk-update
rtk git status --branch
rtk git log --oneline -n 5
```

Expected: branch shows `fix/sdk-update`, recent commits visible.

- [ ] **Step 2: Verify install + baseline build**

```bash
cd /Users/paulnewling/Desktop/Code/mictx/worktrees/tcr-disco/fix-sdk-update
pnpm install
rtk pnpm run build:dev
```

Expected: build passes. (If it fails, fix the baseline before proceeding — do NOT start Task 1 on a broken baseline.)

- [ ] **Step 3: Commit the plan file**

```bash
cd /Users/paulnewling/Desktop/Code/mictx/worktrees/tcr-disco/fix-sdk-update
git add docs/superpowers/plans/2026-05-22-tcr-disco-multiplexing-rules-adoption.md
git commit -m "MILAB-XXXX: add multiplexingRules adoption plan"
```

Note: Replace `MILAB-XXXX` with the actual Notion ticket ID. If no ticket exists for this work yet, ask the operator before committing — workspace convention is to file a Notion ticket for any non-trivial block change.

---

## Task 1: Create `multiplexing-source.lib.tengo`

**Goal:** A leaner version of Miltenyi's resolver that returns only the per-sample barcode value. Both upstream shapes supported. Failure modes surface explicit messages.

**Files:**
- Create: `workflow/src/multiplexing-source.lib.tengo`
- Create: `workflow/src/test/multiplexing-source.test.tpl.tengo`
- Create: `workflow/src/test/multiplexing-source.test.ts`

**Acceptance Criteria:**
- [ ] `addSelectors(bundleBuilder)` adds three selectors keyed `multiplexingRules`, `legacyLinker`, `legacyBarcodeId`
- [ ] `resolve(bundle)` returns `{ok: true, sampleBarcodes, traceSource}` when rules column resolves with single tag + single alt per cell
- [ ] `resolve(bundle)` returns `{ok: true, sampleBarcodes, traceSource}` when the legacy `Barcode ID` metadata col resolves (no rules col)
- [ ] `resolve(bundle)` returns `{ok: false, message}` for: missing both shapes; multi-alt cells; multi-tag column (v1 limitation)
- [ ] `sampleBarcodes` keys are `pl7.app/sampleId` values; values are plain strings (e.g. `"ID_168"`)
- [ ] Tengo unit test passes for all five cases (rules-single-tag, rules-multi-alt-rejected, rules-multi-tag-rejected, legacy-only, neither)

**Verify:** `cd workflow && rtk pnpm run test` → all `multiplexing-source` tests pass

**Steps:**

- [ ] **Step 1: Write the failing test template**

Create `workflow/src/test/multiplexing-source.test.tpl.tengo`:

```tengo
// multiplexing-source.test
//
// Renders multiplexing-source.resolve(...) against synthetic bundles and
// emits a JSON result the .test.ts driver asserts on.

self := import("@platforma-sdk/workflow-tengo:tpl")
smart := import("@platforma-sdk/workflow-tengo:smart")
json := import("json")

multiplexingSource := import(":multiplexing-source")

self.defineOutputs("result")

// Helper: build a fake bundle that responds to getColumns/getColumn the way
// the workflow-tengo bundle does. The .test.ts driver passes the case name;
// each branch synthesises the bundle shape that case expects.
makeBundle := func(caseName) {
    if caseName == "rules-single-tag" {
        rulesCell := {}
        rulesCell[json.encode(["G1","S1"])] = json.encode([{"BarcodeID": "ID_168"}])
        rulesCell[json.encode(["G1","S2"])] = json.encode([{"BarcodeID": "ID_147"}])
        return {
            getColumns: func(key) {
                if key == "multiplexingRules" {
                    return [{
                        spec: { annotations: { "pl7.app/sequencing/barcodeTags": json.encode(["BarcodeID"]) } },
                        data: { getData: func() { return json.encode(rulesCell) } }
                    }]
                }
                return []
            },
            getColumn: func(_) { return undefined }
        }
    }
    if caseName == "rules-multi-tag" {
        rulesCell := {}
        rulesCell[json.encode(["G1","S1"])] = json.encode([{"P5": "AAAA", "P7": "TTTT"}])
        return {
            getColumns: func(key) {
                if key == "multiplexingRules" {
                    return [{
                        spec: { annotations: { "pl7.app/sequencing/barcodeTags": json.encode(["P5","P7"]) } },
                        data: { getData: func() { return json.encode(rulesCell) } }
                    }]
                }
                return []
            },
            getColumn: func(_) { return undefined }
        }
    }
    if caseName == "rules-multi-alt" {
        rulesCell := {}
        rulesCell[json.encode(["G1","S1"])] = json.encode([{"BarcodeID": "ID_168"}, {"BarcodeID": "ID_169"}])
        return {
            getColumns: func(key) {
                if key == "multiplexingRules" {
                    return [{
                        spec: { annotations: { "pl7.app/sequencing/barcodeTags": json.encode(["BarcodeID"]) } },
                        data: { getData: func() { return json.encode(rulesCell) } }
                    }]
                }
                return []
            },
            getColumn: func(_) { return undefined }
        }
    }
    if caseName == "legacy-only" {
        legacyCell := {}
        legacyCell[json.encode(["S1"])] = "ID_111"
        legacyCell[json.encode(["S2"])] = "ID_125"
        return {
            getColumns: func(_) { return [] },
            getColumn: func(key) {
                if key == "legacyBarcodeId" {
                    return {
                        spec: {},
                        data: { getData: func() { return json.encode(legacyCell) } }
                    }
                }
                return undefined
            }
        }
    }
    // "neither"
    return {
        getColumns: func(_) { return [] },
        getColumn: func(_) { return undefined }
    }
}

self.body(func(inputs) {
    bundle := makeBundle(inputs.caseName)
    result := multiplexingSource.resolve(bundle)
    return { result: smart.createJsonResource(result) }
})
```

- [ ] **Step 2: Write the test driver (`.ts`)**

Create `workflow/src/test/multiplexing-source.test.ts`:

```typescript
import { blockTest } from '@platforma-sdk/test';
import { expect } from 'vitest';

blockTest('multiplexing-source resolve — rules single tag', async ({ pl, helpers }) => {
  const out = await helpers.renderTemplate(':test.multiplexing-source.test', { caseName: 'rules-single-tag' });
  const result = out.computeOutput('result', (r) => r?.getDataAsJson());
  await helpers.awaitStableState(result, 30000);
  const value = result.getValue();
  expect(value.ok).toBe(true);
  expect(value.sampleBarcodes).toEqual({ S1: 'ID_168', S2: 'ID_147' });
});

blockTest('multiplexing-source resolve — rules multi-tag rejected (v1)', async ({ pl, helpers }) => {
  const out = await helpers.renderTemplate(':test.multiplexing-source.test', { caseName: 'rules-multi-tag' });
  const result = out.computeOutput('result', (r) => r?.getDataAsJson());
  await helpers.awaitStableState(result, 30000);
  const value = result.getValue();
  expect(value.ok).toBe(false);
  expect(value.message).toMatch(/multiple barcode tags/i);
});

blockTest('multiplexing-source resolve — rules multi-alt rejected', async ({ pl, helpers }) => {
  const out = await helpers.renderTemplate(':test.multiplexing-source.test', { caseName: 'rules-multi-alt' });
  const result = out.computeOutput('result', (r) => r?.getDataAsJson());
  await helpers.awaitStableState(result, 30000);
  const value = result.getValue();
  expect(value.ok).toBe(false);
  expect(value.message).toMatch(/multiple alternatives/i);
});

blockTest('multiplexing-source resolve — legacy Barcode ID metadata only', async ({ pl, helpers }) => {
  const out = await helpers.renderTemplate(':test.multiplexing-source.test', { caseName: 'legacy-only' });
  const result = out.computeOutput('result', (r) => r?.getDataAsJson());
  await helpers.awaitStableState(result, 30000);
  const value = result.getValue();
  expect(value.ok).toBe(true);
  expect(value.sampleBarcodes).toEqual({ S1: 'ID_111', S2: 'ID_125' });
});

blockTest('multiplexing-source resolve — neither shape present', async ({ pl, helpers }) => {
  const out = await helpers.renderTemplate(':test.multiplexing-source.test', { caseName: 'neither' });
  const result = out.computeOutput('result', (r) => r?.getDataAsJson());
  await helpers.awaitStableState(result, 30000);
  const value = result.getValue();
  expect(value.ok).toBe(false);
  expect(value.message).toMatch(/no .* (rules|barcode)/i);
});
```

Note: If `blockTest` / `helpers.renderTemplate` API differs from this signature in the installed `@platforma-sdk/test` version, mirror the pattern from any existing `.test.ts` in `blocks/miltenyi-tcr-bcr-clonotyping/workflow/src/test/columns.test.ts` — do **not** invent missing APIs.

- [ ] **Step 3: Run tests, confirm they fail with "not found"**

```bash
cd /Users/paulnewling/Desktop/Code/mictx/worktrees/tcr-disco/fix-sdk-update/workflow
rtk pnpm run test
```

Expected: FAIL — either `:multiplexing-source` import fails or `multiplexingSource.resolve` is undefined.

- [ ] **Step 4: Write the lib**

Create `workflow/src/multiplexing-source.lib.tengo`:

```tengo
// multiplexing-source — TCR Disco's lean resolver.
//
// Mirrors Miltenyi's `multiplexing-source.lib.tengo` but only returns the
// per-sample barcode value (TCR Disco has no need for group structure).
//
// Two upstream shapes:
//   - new: `pl7.app/sequencing/multiplexingRules` column with cell value
//     `Array<Record<TagName, Barcode>>`. Source of truth post-S&D-#119.
//   - legacy: `pl7.app/metadata` column labelled "Barcode ID" on the
//     `pl7.app/sampleId` axis. Kept in place by S&D's V20260428 migration
//     for compat with consumers that have not migrated.

text := import("text")
json := import("json")

// Adds the bundle selectors the workflow needs to resolve either shape.
// Encapsulates the column specs so callers don't duplicate them.
addSelectors := func(bundleBuilder) {
    // New shape — multiplexing rules column. Axes [sampleGroupId, sampleId].
    bundleBuilder.addMulti({
        axes: [
            { anchor: "mainAlpha", idx: 0 },
            { name: "pl7.app/sampleId", type: "String" }
        ],
        name: "pl7.app/sequencing/multiplexingRules",
        domain: {
            "pl7.app/block":   { anchor: "mainAlpha" },
            "pl7.app/dataset": { anchor: "mainAlpha" }
        }
    }, "multiplexingRules")

    // Legacy linker (kept for shape parity with Miltenyi; TCR Disco does not
    // actually need it but adding the selector means future plans can lift
    // labels from it the same way Miltenyi does).
    bundleBuilder.addMulti({
        axes: [
            { anchor: "mainAlpha", idx: 0 },
            { name: "pl7.app/sampleId", type: "String" }
        ],
        name: "pl7.app/sequencing/data/sampleGroups",
        domain: {
            "pl7.app/block":   { anchor: "mainAlpha" },
            "pl7.app/dataset": { anchor: "mainAlpha" }
        }
    }, "legacyLinker")

    // Legacy: per-sample `Barcode ID` metadata column.
    bundleBuilder.addSingle({
        axes: [{ name: "pl7.app/sampleId", type: "String" }],
        name: "pl7.app/metadata",
        domain: { "pl7.app/columnId": "Barcode ID" }
    }, "legacyBarcodeId")
}

// Decode a JSON-as-string blob or raw map into the inner map.
// PColumnData/Json shows up as either `{key: value}` or `{keyLength, data: {key: value}}`.
unwrapColumnData := func(rawData) {
    if is_map(rawData) && !is_undefined(rawData["data"]) {
        return rawData["data"]
    }
    return rawData
}

// Strip the `["sampleId"]` JSON-array wrapping a single-axis PColumn key.
unwrapSingleAxisKey := func(rawKey) {
    if text.has_prefix(rawKey, "[") {
        decoded := json.decode(rawKey)
        if is_array(decoded) && len(decoded) == 1 {
            return decoded[0]
        }
    }
    return rawKey
}

// Parse the new multiplexingRules column into `{sampleId → barcodeValue}`.
// Cell key:  JSON `[groupId, sampleId]`
// Cell val:  JSON `Array<Record<TagName, Barcode>>`  (outer OR / alternatives;
//            inner AND / multi-tag combo within one alternative)
// v1 limits: exactly one tag, exactly one alternative per cell.
parseRulesColumn := func(rulesCol) {
    annotations := rulesCol.spec.annotations
    if is_undefined(annotations) || is_undefined(annotations["pl7.app/sequencing/barcodeTags"]) {
        return { ok: false, message: "Multiplexing rules column is missing the barcodeTags annotation." }
    }
    tags := json.decode(annotations["pl7.app/sequencing/barcodeTags"])
    if !is_array(tags) || len(tags) == 0 {
        return { ok: false, message: "Multiplexing rules column declares no barcode tags." }
    }
    if len(tags) > 1 {
        return { ok: false, message: "TCR Disco v1 does not support multiple barcode tags (" + text.join(tags, ", ") + "). Use a single-tag rules column." }
    }
    tag := tags[0]

    cellMap := unwrapColumnData(json.decode(rulesCol.data.getData()))
    sampleBarcodes := {}
    for cellKey, cellVal in cellMap {
        keyArr := json.decode(cellKey)
        if !is_array(keyArr) || len(keyArr) != 2 {
            continue
        }
        sampleId := keyArr[1]
        alts := json.decode(cellVal)
        if !is_array(alts) || len(alts) == 0 {
            return { ok: false, message: "Multiplexing rules cell for sample " + sampleId + " is empty." }
        }
        if len(alts) > 1 {
            return { ok: false, message: "Multiplexing rules cell for sample " + sampleId + " has multiple alternatives — TCR Disco v1 supports one alternative per sample." }
        }
        firstAlt := alts[0]
        if is_undefined(firstAlt[tag]) {
            return { ok: false, message: "Multiplexing rules cell for sample " + sampleId + " is missing tag '" + tag + "'." }
        }
        sampleBarcodes[sampleId] = string(firstAlt[tag])
    }
    return { ok: true, sampleBarcodes: sampleBarcodes, traceSource: rulesCol }
}

// Parse the legacy `Barcode ID` metadata column.
parseLegacyColumn := func(legacyCol) {
    cellMap := unwrapColumnData(json.decode(legacyCol.data.getData()))
    sampleBarcodes := {}
    for cellKey, cellVal in cellMap {
        sampleId := unwrapSingleAxisKey(cellKey)
        sampleBarcodes[sampleId] = string(cellVal)
    }
    return { ok: true, sampleBarcodes: sampleBarcodes, traceSource: legacyCol }
}

// Detect "real" presence vs unmatched-bundle stub. `bundle.getColumn` returns
// a wrapper with undefined spec/data for an unmatched `addSingle` query.
hasRealColumn := func(col) {
    return !is_undefined(col) && !is_undefined(col.spec) && !is_undefined(col.data)
}

resolve := func(bundle) {
    rulesCols := bundle.getColumns("multiplexingRules")
    if !is_undefined(rulesCols) && len(rulesCols) > 0 {
        return parseRulesColumn(rulesCols[0])
    }
    legacyCol := bundle.getColumn("legacyBarcodeId")
    if hasRealColumn(legacyCol) {
        return parseLegacyColumn(legacyCol)
    }
    return {
        ok: false,
        message: "Dataset has no multiplexing rules column and no 'Barcode ID' metadata column. Pick a pairing column manually in block settings, or author rules in Samples & Data."
    }
}

export {
    addSelectors: addSelectors,
    resolve:      resolve
}
```

- [ ] **Step 5: Run tests, confirm they pass**

```bash
cd /Users/paulnewling/Desktop/Code/mictx/worktrees/tcr-disco/fix-sdk-update/workflow
rtk pnpm run test
```

Expected: all five `multiplexing-source resolve` tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/paulnewling/Desktop/Code/mictx/worktrees/tcr-disco/fix-sdk-update
git add workflow/src/multiplexing-source.lib.tengo workflow/src/test/multiplexing-source.test.tpl.tengo workflow/src/test/multiplexing-source.test.ts
git commit -m "MILAB-XXXX: add multiplexing-source resolver lib

Lean version of Miltenyi's resolver — returns only sampleId→barcodeValue.
Handles both pl7.app/sequencing/multiplexingRules (new) and the legacy
pl7.app/metadata 'Barcode ID' column. v1 rejects multi-tag and multi-alt
cells with explicit messages."
```

---

## Task 2: Wire selectors into `wf.prepare()`

**Goal:** The bundle returned by `wf.prepare` includes the three selectors `multiplexing-source.lib.tengo` needs. No behaviour change yet — just makes the data reachable.

**Files:**
- Modify: `workflow/src/main.tpl.tengo` (lines 121–122 area: just after the existing `allMetadata` addMulti)

**Acceptance Criteria:**
- [ ] `import(":multiplexing-source")` at the top
- [ ] `multiplexingSource.addSelectors(bundleBuilder)` called inside `wf.prepare` before `.build()`
- [ ] `pnpm run build:dev` succeeds
- [ ] Existing block functionality unchanged — running the block in OldMiltenyi still produces identical outputs (verify in Task 5)

**Verify:** `cd workflow && rtk pnpm run build:dev` exit 0

**Steps:**

- [ ] **Step 1: Add import**

Edit `workflow/src/main.tpl.tengo`. After the existing imports block (around line 10):

```tengo
json := import("json")
multiplexingSource := import(":multiplexing-source")
```

- [ ] **Step 2: Add the call inside `wf.prepare`**

Edit the same file around line 121–122. After the existing `allMetadata` selector (the `bundleBuilder.addMulti({ name: "pl7.app/metadata", axes: [{anchor: "mainAlpha", idx: 0}] }, "allMetadata");` line), add:

```tengo
    // Adopt the new multiplexingRules column emitted by S&D 2.7.0+; the lib
    // also keeps a selector for the legacy `Barcode ID` metadata column so
    // pre-migration projects continue to work.
    multiplexingSource.addSelectors(bundleBuilder)
```

- [ ] **Step 3: Build**

```bash
cd /Users/paulnewling/Desktop/Code/mictx/worktrees/tcr-disco/fix-sdk-update/workflow
rtk pnpm run build:dev
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/paulnewling/Desktop/Code/mictx/worktrees/tcr-disco/fix-sdk-update
git add workflow/src/main.tpl.tengo
git commit -m "MILAB-XXXX: wire multiplexing-source selectors into wf.prepare"
```

---

## Task 3: Synthesize `Barcode ID` column in `wf.body`

**Goal:** When the resolver succeeds, inject a synthetic `Barcode ID` column into the metadata TSV so `find-pairs.R` finds `sample_id_col = "Barcode ID"` regardless of whether the upstream provided a legacy metadata column or a new rules column. When the resolver fails, the existing fallback dropdown remains the recovery path.

**Files:**
- Modify: `workflow/src/main.tpl.tengo` (around lines 289–296 — the `metadataTable` build region)

**Acceptance Criteria:**
- [ ] If `multiplexingSource.resolve(args.columns)` returns `ok: true`, AND no existing column in `allMetadata` already carries the label `"Barcode ID"`, a synthetic PColumn is added to `metadataTable` with header `"Barcode ID"`
- [ ] If a metadata column labelled `"Barcode ID"` is already present in `allMetadata`, the synthetic is **not** added (avoids duplicate column header)
- [ ] If the resolver returns `ok: false`, `metadataTable` is built unchanged (preserves current fallback UX exactly)
- [ ] Workflow builds; sample run in NewMiltenyi (verified in Task 5) produces a `metadata.tsv` containing a `Barcode ID` column with values matching `barcodeRules`
- [ ] Workflow run in OldMiltenyi produces a `metadata.tsv` identical to the previous stable release (legacy column kept; synthetic NOT added)

**Verify:** `cd workflow && rtk pnpm run build:dev` exit 0, then proceed to Task 5 for behaviour check.

**Steps:**

- [ ] **Step 1: Read current state of the metadata-table region**

Confirm the structure at lines 289–296 of `workflow/src/main.tpl.tengo`. It should look like:

```tengo
    // Load main metadata
    metadataTable := pframes.tsvFileBuilder()
    metadataTable.setAxisHeader("pl7.app/sampleId", "internalSampleId")
    for metadataCol in columns.getColumns("allMetadata") {
        metadataTable.add(metadataCol, {header: metadataCol.spec.annotations["pl7.app/label"]})
    }
    metadataTable.mem(defaultConvMem)
    metadataTable.cpu(defaultConvCpu)
    metadataTsv := metadataTable.build()
```

- [ ] **Step 2: Replace the region with the dual-path version**

Replace lines 289–296 with:

```tengo
    // Load main metadata
    metadataTable := pframes.tsvFileBuilder()
    metadataTable.setAxisHeader("pl7.app/sampleId", "internalSampleId")
    legacyBarcodeColPresent := false
    for metadataCol in columns.getColumns("allMetadata") {
        label := metadataCol.spec.annotations["pl7.app/label"]
        metadataTable.add(metadataCol, {header: label})
        if label == "Barcode ID" {
            legacyBarcodeColPresent = true
        }
    }

    // Synthesize "Barcode ID" column from multiplexingRules (or legacy
    // selector) when allMetadata didn't already include one. This keeps the
    // R script's pairing join working on projects where S&D 2.7.0+ no longer
    // emits the Barcode ID metadata column (NewMiltenyi-style). When a real
    // Barcode ID metadata column is present (OldMiltenyi-style), we skip
    // synthesis to avoid a duplicate column header.
    if !legacyBarcodeColPresent {
        mx := multiplexingSource.resolve(columns)
        if mx.ok {
            // Build a synthetic single-axis PColumn keyed by sampleId.
            syntheticData := {}
            for sampleId, barcodeValue in mx.sampleBarcodes {
                syntheticData[json.encode([sampleId])] = barcodeValue
            }
            syntheticPCol := {
                spec: {
                    kind:       "PColumn",
                    name:       "pl7.app/metadata",
                    valueType:  "String",
                    axesSpec:   [mainAlphaSpec.axesSpec[0]],
                    annotations: {
                        "pl7.app/label":    "Barcode ID",
                        "pl7.app/columnId": "Barcode ID"
                    }
                },
                data: createJsonPColumnData({
                    keyLength: 1,
                    data:      syntheticData
                })
            }
            metadataTable.add(syntheticPCol, {header: "Barcode ID"})
        }
        // If !mx.ok, leave the table as-is — the existing fallback dropdown
        // in MainPage.vue is the recovery path.
    }

    metadataTable.mem(defaultConvMem)
    metadataTable.cpu(defaultConvCpu)
    metadataTsv := metadataTable.build()
```

Notes:
- `createJsonPColumnData` and `json` are already imported/defined at the top of the file (lines 10, 32 — verified during plan research).
- `mainAlphaSpec.axesSpec[0]` is already in scope at this point in the function body (defined earlier when the main TSV was being built around line 215).

- [ ] **Step 3: Build**

```bash
cd /Users/paulnewling/Desktop/Code/mictx/worktrees/tcr-disco/fix-sdk-update/workflow
rtk pnpm run build:dev
```

Expected: PASS. If the tengo type-check rejects `metadataTable.add(syntheticPCol, ...)` because `add` expects a real result-pool PColumn (not an inline stub), fall back to **Step 4** below; otherwise skip it.

- [ ] **Step 4: Fallback — publish the synthetic via pFrameBuilder first (only if Step 3 fails)**

If `tsvFileBuilder.add` rejects the inline stub, replace the synthetic-injection block with:

```tengo
    if !legacyBarcodeColPresent {
        mx := multiplexingSource.resolve(columns)
        if mx.ok {
            syntheticData := {}
            for sampleId, barcodeValue in mx.sampleBarcodes {
                syntheticData[json.encode([sampleId])] = barcodeValue
            }
            syntheticBuilder := pframes.pFrameBuilder()
            syntheticBuilder.add("syntheticBarcodeId", {
                kind:       "PColumn",
                name:       "pl7.app/metadata",
                valueType:  "String",
                axesSpec:   [mainAlphaSpec.axesSpec[0]],
                annotations: {
                    "pl7.app/label":    "Barcode ID",
                    "pl7.app/columnId": "Barcode ID"
                }
            }, createJsonPColumnData({ keyLength: 1, data: syntheticData }))
            syntheticPf := syntheticBuilder.build()
            for _, syntheticCol in syntheticPf {
                metadataTable.add(syntheticCol, {header: "Barcode ID"})
            }
        }
    }
```

Build again — expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/paulnewling/Desktop/Code/mictx/worktrees/tcr-disco/fix-sdk-update
git add workflow/src/main.tpl.tengo
git commit -m "MILAB-XXXX: synthesize Barcode ID column from multiplexingRules

Keeps find-pairs.R's pairing join working on projects whose Samples & Data
block emits the new multiplexingRules column instead of a Barcode ID
metadata column. Falls through to existing fallback (the pairing-column
dropdown) when neither shape resolves. Skips synthesis when a real Barcode
ID metadata column is already present, preserving OldMiltenyi behaviour."
```

---

## Task 4: Update `barcodeColPresent` model output

**Goal:** Hide the pairing-column fallback dropdown in the UI when either source is present, so the block looks identical to stable+OldMiltenyi in both new and legacy projects.

**Files:**
- Modify: `model/src/index.ts` (the `barcodeColPresent` output definition)

**Acceptance Criteria:**
- [ ] `barcodeColPresent` returns `true` if there exists a metadata column labelled `Barcode ID` (current behaviour)
- [ ] `barcodeColPresent` returns `true` if there exists a `pl7.app/sequencing/multiplexingRules` column anchored to the main dataset (new behaviour)
- [ ] `barcodeColPresent` returns `false` otherwise (current fallback path)
- [ ] Type-check passes (`pnpm run type-check`)

**Verify:** `cd model && rtk pnpm run build && rtk pnpm run type-check` exit 0

**Steps:**

- [ ] **Step 1: Locate the existing output**

In `model/src/index.ts`, find the `barcodeColPresent` output. It currently reads:

```typescript
  .output('barcodeColPresent', (ctx) => {
    const metadataCols = ctx.resultPool.selectColumns(
      (spec) => spec.name === 'pl7.app/metadata',
    );
    if (metadataCols === undefined) return false;
    return metadataCols.some((col) => col.spec.annotations?.['pl7.app/label'] === 'Barcode ID');
  })
```

- [ ] **Step 2: Replace with OR-clause**

```typescript
  .output('barcodeColPresent', (ctx) => {
    const metadataCols = ctx.resultPool.selectColumns(
      (spec) => spec.name === 'pl7.app/metadata',
    );
    const hasLegacyBarcodeCol = metadataCols?.some(
      (col) => col.spec.annotations?.['pl7.app/label'] === 'Barcode ID',
    ) ?? false;
    if (hasLegacyBarcodeCol) return true;

    // New shape — S&D 2.7.0+ emits per-sample barcodes as a multiplexingRules
    // column instead of a Barcode ID metadata column. The workflow synthesizes
    // a Barcode ID column from it, so for UI purposes the pairing dropdown
    // should also be hidden when only this shape is present.
    const rulesCols = ctx.resultPool.selectColumns(
      (spec) => spec.name === 'pl7.app/sequencing/multiplexingRules',
    );
    return (rulesCols?.length ?? 0) > 0;
  })
```

Note: This is broader than strictly necessary (matches *any* multiplexingRules column in the result pool, not just one anchored to `mainRef`). That's intentional — TCR Disco's `mainRef` selection already implies a single TCR pipeline, and false positives are harmless (the workflow re-detects per-dataset). If a future change requires per-dataset scoping, narrow the selector to also match `spec.domain['pl7.app/dataset']` against the mainRef's dataset id.

- [ ] **Step 3: Build + type-check**

```bash
cd /Users/paulnewling/Desktop/Code/mictx/worktrees/tcr-disco/fix-sdk-update/model
rtk pnpm run build
rtk pnpm run type-check
```

Expected: both PASS.

- [ ] **Step 4: Commit**

```bash
cd /Users/paulnewling/Desktop/Code/mictx/worktrees/tcr-disco/fix-sdk-update
git add model/src/index.ts
git commit -m "MILAB-XXXX: barcodeColPresent detects multiplexingRules

Returns true when EITHER the legacy 'Barcode ID' metadata column OR a
pl7.app/sequencing/multiplexingRules column is present in the result pool.
Hides the pairing-column fallback dropdown in the new shape so the block
looks identical to stable's behaviour on OldMiltenyi-style projects."
```

---

## Task 5: Manual verification in NewMiltenyi + OldMiltenyi via pl mcp

**Goal:** Ground-truth verification that the change works on the project that motivated it (NewMiltenyi) AND does not regress the working project (OldMiltenyi).

**Files:** none (read-only verification)

**Acceptance Criteria:**
- [ ] In `NewMiltenyi` (project `NG:0xa9db41`): after Update Dev Block + Run, `barcodeColPresent === true`, pairs analysis runs and produces non-empty `pairsPF` output (or surfaces the appropriate R-script warning if data is too sparse — distinguish from "column not found" by checking R log)
- [ ] In `OldMiltenyi` (project `NG:0xaa39b4`): after Update Dev Block + Run, the block runs end-to-end and produces outputs structurally identical to the previous run (same column set, same row counts in `pairsPF`)
- [ ] In `NewMiltenyi`, opening the Settings modal does NOT show the "Pairing metadata column" dropdown (because `barcodeColPresent === true`)
- [ ] No new console errors / Tengo panics visible in pl logs for either project

**Verify:** manual inspection via pl-mcp tools.

**Steps:**

- [ ] **Step 1: Build the dev block**

```bash
cd /Users/paulnewling/Desktop/Code/mictx/worktrees/tcr-disco/fix-sdk-update
rtk pnpm run build:dev
```

- [ ] **Step 2: Update + Run TCR Disco in NewMiltenyi**

Via Desktop or pl-mcp:
- Open project `NG:0xa9db41` (NewMiltenyi)
- Find the TCR Disco block `434c10e8-ae03-4445-8f4a-91f17d61201f`
- Click "Update Dev Block"
- Click Run

- [ ] **Step 3: Inspect outputs**

Via `mcp__pl__get_block_state`:

```javascript
({
  barcodeColPresent: outputs.barcodeColPresent?.value,
  metadataLabels: outputs.metadataOptions?.value?.map(o => o.label),
  pairsPF_present: outputs.pairsPF?.value !== undefined,
  reportContent: outputs.reportContent?.value
})
```

Expected on NewMiltenyi:
- `barcodeColPresent: true`
- `metadataLabels` still `[donor, ag, chain, experiment, replicate]` (synthesized column is workflow-internal, not exposed as a metadata pColumn in the result pool — only injected into metadata.tsv)
- `pairsPF_present: true` after the block completes

If `pairsPF` is undefined or pairs analysis errors:
- Pull R logs via `mcp__pl__get_block_logs`
- Check whether the error is "Error: The sets of samples in the alpha and beta tables are not the same" (would mean synthesis failed — sample IDs in synthesized Barcode ID column don't match alpha/beta sample IDs) or "no rows to aggregate" (data sparsity, not our problem)

- [ ] **Step 4: Confirm OldMiltenyi regression-free**

Repeat Steps 2–3 against project `NG:0xaa39b4` (OldMiltenyi), block `f987ecf5-373f-4e84-a39b-7d4a3ac0b435`.

Expected:
- `barcodeColPresent: true` (unchanged — legacy column still present)
- `metadataLabels` still `[donor, chain, ag, experiment, Barcode ID, replicate]` (unchanged)
- Pairs analysis behaves identically to the previous run (Task 0 baseline)
- Confirm `legacyBarcodeColPresent` short-circuited the synthesis (no double-Barcode-ID column issue) — sanity-check by reading the workflow logs

- [ ] **Step 5: UI smoke check**

In the Desktop app:
- Open both projects
- Click Settings on TCR Disco block in each
- Confirm: "Pairing metadata column" dropdown is NOT visible in either (because `barcodeColPresent === true` in both cases)
- Confirm: no other UI changes vs published 1.2.1

- [ ] **Step 6: No commit** — this task is verification only. If something fails, return to Task 1/2/3/4 to fix.

---

## Task 6: Changeset, build, push

**Goal:** Ship-ready PR state.

**Files:**
- Create: `.changeset/<random>-<slug>.md`

**Acceptance Criteria:**
- [ ] Changeset describes the change in user-facing terms (single-paragraph patch entry, since this is backwards-compatible)
- [ ] Final `pnpm install && pnpm -r build` from worktree root passes
- [ ] All commits pushed to `fix/sdk-update`
- [ ] PR description updated to mention the multiplexingRules adoption alongside the V3 SDK migration

**Verify:** `rtk gh pr view` shows the updated description; CI green.

**Steps:**

- [ ] **Step 1: Add changeset**

```bash
cd /Users/paulnewling/Desktop/Code/mictx/worktrees/tcr-disco/fix-sdk-update
pnpm changeset
```

When prompted:
- Bump type: **patch** (backwards-compatible behaviour change; no user-facing API change)
- Description:

```
Adopt pl7.app/sequencing/multiplexingRules column for TCR A/B pairing.

The block now reads the new multiplexingRules column emitted by Samples & Data
2.7.0+, synthesizing a per-sample Barcode ID for find-pairs.R's join. Projects
that still carry a legacy 'Barcode ID' metadata column (e.g. those upgraded
from pre-2.7.0 Samples & Data) continue to use that column unchanged.
```

- [ ] **Step 2: Final clean build from root**

```bash
cd /Users/paulnewling/Desktop/Code/mictx/worktrees/tcr-disco/fix-sdk-update
pnpm install
rtk pnpm -r build
```

Expected: all packages build successfully.

- [ ] **Step 3: Commit + push**

```bash
cd /Users/paulnewling/Desktop/Code/mictx/worktrees/tcr-disco/fix-sdk-update
rtk git status -s
git add .changeset
git commit -m "MILAB-XXXX: changeset for multiplexingRules adoption"
rtk git push
```

- [ ] **Step 4: Update PR description**

```bash
cd /Users/paulnewling/Desktop/Code/mictx/worktrees/tcr-disco/fix-sdk-update
rtk gh pr view
```

If a PR is already open for `fix/sdk-update`, edit its description to add a new section:

```markdown
### multiplexingRules adoption

This PR also adds support for the new `pl7.app/sequencing/multiplexingRules`
column emitted by Samples & Data 2.7.0+. TCR Disco synthesizes a per-sample
`Barcode ID` column from the rules so `find-pairs.R` joins alpha and beta
samples by the correct key, restoring pairing on projects where Samples & Data
no longer emits a legacy metadata column.

Backwards compatibility preserved: projects carrying a legacy `Barcode ID`
metadata column continue to use it; synthesis is skipped to avoid duplicate
column headers. The pairing-column fallback dropdown in block Settings is
hidden whenever either source is present, matching stable's behaviour.

No UI changes, no new settings, no default-behaviour changes.
```

Use `gh pr edit <number> --body-file -` with a HEREDOC if scripting.

- [ ] **Step 5: Confirm CI green**

```bash
rtk gh pr checks
```

Expected: all checks pass.

---

## Self-Review

**Spec coverage check:**
- "Adopt multiplexingRules" → Tasks 1, 2, 3 ✓
- "Investigate backwards compatibility" → Plan header (decision recorded as keep), Tasks 1 (legacy parser), 3 (skip-if-present guard), 4 (OR-clause), 5 (regression check) ✓
- "If complexity too high, drop it" → Header table documents the cost (~100 LOC + one unit test); judged low. Decision: keep. ✓
- "Look as similar as possible to previous versions" → Task 3 skip-if-legacy-col-present guard preserves OldMiltenyi exactly; Task 4 hides the fallback dropdown in NewMiltenyi the same way it's been hidden in OldMiltenyi; no UI changes ✓

**Placeholder scan:** `MILAB-XXXX` appears in commit messages as a deliberate placeholder — replace at execution time with the ticket ID (or `fix/multiplexing-rules-adoption` if no ticket is filed). No other placeholders.

**Type consistency check:**
- `multiplexingSource.resolve(...)` is called in `wf.body` (Task 3) with `columns` — matches the lib's `resolve(bundle)` signature (Task 1) since `columns` IS the bundle in workflow-tengo.
- `mx.sampleBarcodes` keys are sampleId strings (Task 1 promises); used as keys in `syntheticData` map (Task 3) — consistent.
- `createJsonPColumnData` and `json.encode` exist at the top of `main.tpl.tengo` (verified at lines 10, 32 in research) — Task 3's use of both is valid.
- `mainAlphaSpec` is in scope at the metadata-table region (defined earlier in `wf.body` around line 215) — Task 3's reference is valid.

No issues found.
