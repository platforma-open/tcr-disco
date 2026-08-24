import { kind } from "@platforma-open/milaboratories.tcrdisco-enrichment.kind";
import type {
  InferOutputsType,
  PColumn,
  PColumnDataUniversal,
  PColumnIdAndSpec,
  PFrameHandle,
  PlDataTableFilters,
  PlDataTableFilterSpecLeaf,
  PTableColumnId,
  RenderCtxBase,
  TreeNodeAccessor,
} from "@platforma-sdk/model";
import {
  BlockModelV3,
  createPFrameForGraphs,
  createPlDataTableSheet,
  createPlDataTableV3,
  getUniquePartitionKeys,
  isPColumnSpec,
  toColumnProvider,
} from "@platforma-sdk/model";
import { blockDataModel } from "./dataModel";
import type { BlockArgs, BlockData } from "./types";

export { blockDataModel } from "./dataModel";
export * from "./types";

// Builds the enriched-clonotypes-heatmap pFrame for one chain. The chain is an
// explicit arg (not read from `ctx.data.selectedChain`), so the two outputs below
// don't depend on the selected chain: both are built once and cached, and a chain
// switch in the UI never recomputes them — the UI just picks the active handle.
function buildFreqHeatmapPf(
  ctx: RenderCtxBase<BlockArgs, BlockData>,
  chain: "alpha" | "beta",
): PFrameHandle | undefined {
  const outputName = chain === "alpha" ? "mainAlphaFrequenciesPF" : "mainBetaFrequenciesPF";
  let allPcols = ctx.outputs?.resolve(outputName)?.getPColumns();
  if (allPcols === undefined) {
    return undefined;
  }

  const subtypeLabel = chain === "alpha" ? "clonotypeToSubsetAlpha" : "clonotypeToSubsetBeta";
  const clonotypeToSubsetPcols = ctx.outputs
    ?.resolve({ field: subtypeLabel, allowPermanentAbsence: true })
    ?.getPColumns();
  if (clonotypeToSubsetPcols !== undefined) {
    allPcols = [...allPcols, ...clonotypeToSubsetPcols];
  }

  const robustAnyLabel = chain === "alpha" ? "robustAnyAlpha" : "robustAnyBeta";
  const robustAnyPcols = ctx.outputs
    ?.resolve({ field: robustAnyLabel, allowPermanentAbsence: true })
    ?.getPColumns();
  if (robustAnyPcols !== undefined) {
    allPcols = [...allPcols, ...robustAnyPcols];
  }

  // Y sort key. Added explicitly (like robustAny); it is a value column, so
  // createPFrameForGraphs does not auto-discover it (no dup).
  const meanNumeratorFreqLabel =
    chain === "alpha" ? "meanNumeratorFreqAlpha" : "meanNumeratorFreqBeta";
  const meanNumeratorFreqPcols = ctx.outputs
    ?.resolve({ field: meanNumeratorFreqLabel, allowPermanentAbsence: true })
    ?.getPColumns();
  if (meanNumeratorFreqPcols !== undefined) {
    allPcols = [...allPcols, ...meanNumeratorFreqPcols];
  }

  // NB: do NOT add the per-clonotype V gene / CDR3 columns explicitly here —
  // createPFrameForGraphs auto-discovers them as related columns of the clonotype
  // axis (adding them again throws "Duplicate column id"). They are listed in
  // frequenciesHeatmapPcols only so the UI can find their index for the Y-label
  // default-options.
  return createPFrameForGraphs(ctx, allPcols);
}

// Builds the volcano-plot pFrame for one chain. Chain is an explicit arg (not
// read from selectedChain), so the two outputs below are cached and a chain
// switch never recomputes them — the UI just picks the active handle.
function buildTopTablePf(
  ctx: RenderCtxBase<BlockArgs, BlockData>,
  chain: "alpha" | "beta",
): PFrameHandle | undefined {
  const outputName = chain === "alpha" ? "topDegPFAlpha" : "topDegPFBeta";
  const pCols = ctx.outputs?.resolve(outputName)?.getPColumns();
  if (pCols === undefined) {
    return undefined;
  }
  return createPFrameForGraphs(ctx, filterPCols(pCols));
}

// Filter columns for volcano plot
function filterPCols(pCols: PColumn<TreeNodeAccessor>[]): PColumn<TreeNodeAccessor>[] {
  // Allow only log2 FC and -log10 Padjust as options for volcano axis
  pCols = pCols.filter(
    (col) =>
      col.spec.name === "pl7.app/differentialTCRAbundance/log2foldchange" ||
      col.spec.name === "pl7.app/differentialTCRAbundance/minlog10padj" ||
      col.spec.name === "pl7.app/differentialTCRAbundance/regulationDirection" ||
      col.spec.name === "pl7.app/differentialTCRAbundance/contrastGroup" ||
      col.spec.name === "pl7.app/differentialTCRAbundance/chain" ||
      col.spec.name === "pl7.app/differentialTCRAbundance/cdsubset" ||
      col.spec.name === "pl7.app/differentialTCRAbundance/robustEnrichment",
  );
  return pCols;
}

// Resolve a table column id (for default-filter leaves) by its p-column spec
// name, within the columns being shown in a given table. Returns undefined when
// the column is absent so the corresponding default filter is simply skipped.
function tableColumnId(
  pCols: PColumn<PColumnDataUniversal>[],
  name: string,
): PTableColumnId | undefined {
  const col = pCols.find((c) => c.spec.name === name);
  // SDK 1.80: filter-leaf `column` is the PTableColumnId object, not a
  // canonicalized-JSON string.
  return col ? { type: "column", id: col.id } : undefined;
}

// Build the default-filter tree passed to createPlDataTable as `options.filters`.
// V3 concatenates these with the user's filters and applies them to the table data
// (V2 only surfaced them for display). Unfilled leaves are dropped; an empty set
// yields undefined.
function defaultTableFilters(
  leaves: (PlDataTableFilterSpecLeaf | undefined)[],
): PlDataTableFilters | undefined {
  const present = leaves.filter((l): l is PlDataTableFilterSpecLeaf => l !== undefined);
  if (present.length === 0) return undefined;
  return { type: "and", filters: present };
}

// Wrap already-resolved p-columns as ColumnLazy recipes for the V3 table's
// `primaryColumns`. They form the table's join backbone; the SDK auto-discovers
// and left-joins the matching label columns (discoverLabelColumns). SDK 1.80
// replaced `toColumnSnapshotProvider(...).getAllColumns()` + `{column,isPrimary}`
// with the column-provider recipe model.
function toPrimaryColumns(pCols: PColumn<PColumnDataUniversal>[]) {
  return toColumnProvider({ columns: pCols, isFinal: true }).getColumns();
}

export const platforma = BlockModelV3.create({ dataModel: blockDataModel, kind })

  // The reverse of the kind's `init`: project the analysis back out so a project
  // can be exported as a template and re-applied. Only what the contract carries
  // — view state and the CD4/CD8 pair are deliberately not restorable this way
  // (see the kind's `BlockParams`).
  .templateParams((data) => ({
    title: data.title,
    mainRef: data.mainRef,
    contrastFactor: data.contrastFactor,
    numerators: data.numerators,
    denominators: data.denominators,
    covariateRefs: data.covariateRefs,
    findTcrAbPairs: data.findTcrAbPairs,
    pairingMetadataCol: data.pairingMetadataCol,
    thresholdCounts: data.thresholdCounts,
    thresholdSamples: data.thresholdSamples,
    log2FcThreshold: data.log2FcThreshold,
    pAdjThreshold: data.pAdjThreshold,
  }))

  // Project the unified data into the workflow's args shape. Validation lives
  // here (replaces V1 `.argsValid`): throwing marks args invalid and disables
  // Run. Pure function of `data` only.
  .args<BlockArgs>((data) => {
    if (data.mainRef === undefined) throw new Error("Main dataset is required");
    if (data.contrastFactor === undefined) throw new Error("Contrast factor is required");
    if (data.numerators.length === 0) throw new Error("Select at least one numerator");
    if (data.denominators.length === 0) throw new Error("Select at least one denominator");
    // CD4/CD8 dataset is optional; when set, its subset column must be chosen and
    // must actually contain CD4/CD8 values (verified by the UI, snapshotted into
    // data.cdSubsetColValid on the user's column selection).
    if (data.cdRef && (data.cdSubsetCol === undefined || !data.cdSubsetColValid))
      throw new Error("Selected CD4/CD8 subset column must contain CD4 or CD8 values");
    // Thresholds have defaults, so an empty one means the user cleared the field.
    // Throwing keeps the run gated until a number is back in it.
    if (data.thresholdCounts === undefined) throw new Error("Min UMI counts is required");
    if (data.thresholdSamples === undefined) throw new Error("Min replicates is required");
    if (data.log2FcThreshold === undefined) throw new Error("Log2(FC) threshold is required");
    if (data.pAdjThreshold === undefined) throw new Error("Adjusted p-value threshold is required");

    return {
      mainRef: data.mainRef,
      cdRef: data.cdRef,
      cdSubsetCol: data.cdSubsetCol,
      pairingMetadataCol: data.pairingMetadataCol,
      covariateRefs: data.covariateRefs,
      contrastFactor: data.contrastFactor,
      numerators: data.numerators,
      denominators: data.denominators,
      findTcrAbPairs: data.findTcrAbPairs,
      thresholdCounts: data.thresholdCounts,
      thresholdSamples: data.thresholdSamples,
      log2FcThreshold: data.log2FcThreshold,
      pAdjThreshold: data.pAdjThreshold,
    };
  })

  // Allow user to choose Alpha chain, will pick beta if available
  // @TODO: Should we allow single analysis of beta chain?
  .output("inputOptions", (ctx) => {
    return ctx.resultPool.getOptions(
      [
        {
          axes: [
            { name: "pl7.app/sampleId" },
            {
              domain: {
                "pl7.app/vdj/chain": "TCRAlpha",
              },
            },
          ],
          annotations: {
            "pl7.app/isAbundance": "true",
            "pl7.app/abundance/normalized": "false",
            "pl7.app/abundance/isPrimary": "true",
          },
        },
      ],
      {
        label: { includeNativeLabel: false, addLabelAsSuffix: true, forceTraceElements: [] },
        refsWithEnrichments: false,
      },
    );
  })

  .output("metadataOptions", (ctx) =>
    ctx.resultPool.getOptions((spec) => isPColumnSpec(spec) && spec.name === "pl7.app/metadata"),
  )

  .output("denominatorOptions", (ctx) => {
    if (!ctx.data.contrastFactor) return undefined;

    const pColumn = ctx.resultPool.getPColumnByRef(ctx.data.contrastFactor);
    if (!pColumn) return undefined;

    return ctx.createPFrame([pColumn]);
  })

  .output("cdSubsetOptions", (ctx) => {
    if (!ctx.data.cdSubsetCol) return undefined;

    const pColumn = ctx.resultPool.getPColumnByRef(ctx.data.cdSubsetCol);
    if (!pColumn) return undefined;

    return ctx.createPFrame([pColumn]);
  })

  // Check if "Barcode ID" column is present in metadata, otherwise return false
  // This column will be present in demultiplexed data and will relate same
  // samples from different chains
  .output("barcodeColPresent", (ctx) => {
    const metadataCols = ctx.resultPool.selectColumns((spec) => spec.name === "pl7.app/metadata");
    const hasLegacyBarcodeCol =
      metadataCols?.some((col) => col.spec.annotations?.["pl7.app/label"] === "Barcode ID") ??
      false;
    if (hasLegacyBarcodeCol) return true;

    // S&D 2.7.0+ emits per-sample barcodes as a multiplexingRules column
    // instead of a Barcode ID metadata column. The workflow synthesizes a
    // Barcode ID from it, so hide the pairing dropdown when only this
    // shape is present.
    //
    // Inspect only rulesCols[0] — must stay symmetric with the workflow's
    // multiplexingSource.resolve() in multiplexing-source.lib.tengo, which
    // attempts column 0 only. Using `.some()` here would lie when column 0
    // is multi-tag but a later column is single-tag: the model would hide
    // the dropdown and the workflow would log the multi-tag rejection and
    // skip synthesis, leaving the user with broken pairs and no manual
    // recovery path. If the workflow grows multi-column selection (v2),
    // update both sites together.
    //
    // Only single-tag rules count as usable: multiplexingSource.resolve()
    // rejects multi-tag (v1 limit). Returning true on a multi-tag column
    // would hide the dropdown AND skip synthesis — pairs would silently
    // fail. Falling through to false keeps the dropdown reachable for
    // manual recovery.
    //
    // Axis names go unchecked here. The
    // `pl7.app/sequencing/multiplexingRules` column-name contract requires
    // `[sampleGroupId, sampleId]` axes by S&D spec; the workflow selector
    // enforces the match. A non-conforming upstream would fail the
    // selector and skip synthesis there too.
    const rulesCols = ctx.resultPool.selectColumns(
      (spec) => spec.name === "pl7.app/sequencing/multiplexingRules",
    );
    const firstRulesCol = rulesCols?.[0];
    if (!firstRulesCol) return false;
    const tagsJson = firstRulesCol.spec.annotations?.["pl7.app/sequencing/barcodeTags"];
    if (typeof tagsJson !== "string") return false;
    try {
      const tags = JSON.parse(tagsJson) as unknown;
      return Array.isArray(tags) && tags.length === 1;
    } catch {
      return false;
    }
  })

  // Run report from workflow (report.txt): empty input or threshold filter warnings.
  .output("reportContent", (ctx): string | undefined => {
    const content = ctx.outputs?.resolve("reportContent")?.getDataAsString();
    return typeof content === "string" && content.trim().length > 0 ? content.trim() : undefined;
  })

  .outputWithStatus("pt", (ctx) => {
    const selectedChain = ctx.data.selectedChain ?? "alpha";
    const outputName = selectedChain === "alpha" ? "topDegPFAlpha" : "topDegPFBeta";
    const pCols = ctx.outputs?.resolve(outputName)?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    const log2fcId = tableColumnId(pCols, "pl7.app/differentialTCRAbundance/log2foldchange");
    const padjId = tableColumnId(pCols, "pl7.app/differentialTCRAbundance/padj");
    const robustEnrichmentId = tableColumnId(
      pCols,
      "pl7.app/differentialTCRAbundance/robustEnrichment",
    );
    const filters = defaultTableFilters([
      // Filter for log2foldchange columns (>= log2FcThreshold)
      log2fcId !== undefined && ctx.data.log2FcThreshold !== undefined
        ? { type: "greaterThanOrEqual", column: log2fcId, x: ctx.data.log2FcThreshold }
        : undefined,
      // Filter for adjusted p-value columns (<= pAdjThreshold)
      padjId !== undefined && ctx.data.pAdjThreshold !== undefined
        ? { type: "lessThanOrEqual", column: padjId, x: ctx.data.pAdjThreshold }
        : undefined,
      robustEnrichmentId !== undefined
        ? { type: "patternEquals", column: robustEnrichmentId, value: "Robust" }
        : undefined,
    ]);

    const tableState = selectedChain === "alpha" ? ctx.data.tableState : ctx.data.tableStateBeta;

    return createPlDataTableV3(ctx, {
      primaryColumns: toPrimaryColumns(pCols),
      columns: [],
      tableState,
      filters,
    });
  })

  .output("sheets", (ctx) => {
    const selectedChain = ctx.data.selectedChain ?? "alpha";
    const outputName = selectedChain === "alpha" ? "topDegPFAlpha" : "topDegPFBeta";
    const pCols = ctx.outputs?.resolve(outputName)?.getPColumns();
    if (pCols === undefined || pCols.length === 0) {
      return undefined;
    }

    // Get unique partition keys if available
    const partitionKeys = getUniquePartitionKeys(pCols[0].data)?.[0];
    if (!partitionKeys) return undefined;

    return [createPlDataTableSheet(ctx, pCols[0].spec.axesSpec[0], partitionKeys)];
  })

  .outputWithStatus("pairsPt", (ctx) => {
    const pCols = ctx.outputs
      ?.resolve({ field: "pairsPF", allowPermanentAbsence: true })
      ?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    const padjId = tableColumnId(pCols, "pl7.app/differentialTCRAbundance/padj");
    const filters = defaultTableFilters([
      // if (columnName === 'pl7.app/differentialTCRAbundance/max_cc_info') {
      //   return { default: { type: 'string_equals', reference: 'max' } };
      // }

      // Filter for adjusted p-value columns (<= pAdjThreshold)
      padjId !== undefined && ctx.data.pAdjThreshold !== undefined
        ? { type: "lessThanOrEqual", column: padjId, x: ctx.data.pAdjThreshold }
        : undefined,
    ]);

    return createPlDataTableV3(ctx, {
      primaryColumns: toPrimaryColumns(pCols),
      columns: [],
      tableState: ctx.data.pairsTableState,
      filters,
    });
  })

  .output("pairsSheets", (ctx) => {
    const pCols = ctx.outputs
      ?.resolve({ field: "pairsPF", allowPermanentAbsence: true })
      ?.getPColumns();
    if (pCols === undefined || pCols.length === 0) {
      return undefined;
    }

    // Get unique partition keys if available
    const partitionKeys = getUniquePartitionKeys(pCols[0].data)?.[0];
    if (!partitionKeys) return undefined;

    return [createPlDataTableSheet(ctx, pCols[0].spec.axesSpec[0], partitionKeys)];
  })

  // Two chain-scoped volcano pFrames, each independent of selectedChain so a
  // chain switch never recomputes them (see buildTopTablePf). The UI picks one.
  .outputWithStatus("topTablePfAlpha", (ctx): PFrameHandle | undefined =>
    buildTopTablePf(ctx, "alpha"),
  )
  .outputWithStatus("topTablePfBeta", (ctx): PFrameHandle | undefined =>
    buildTopTablePf(ctx, "beta"),
  )

  .output("topTablePcols", (ctx) => {
    // Both chains' lists, independent of selectedChain, so a switch doesn't
    // recompute them; the UI picks the active chain's list for defaultOptions.
    const forChain = (chain: "alpha" | "beta"): PColumnIdAndSpec[] | undefined => {
      const outputName = chain === "alpha" ? "topDegPFAlpha" : "topDegPFBeta";
      const pCols = ctx.outputs?.resolve(outputName)?.getPColumns();
      if (pCols === undefined) {
        return undefined;
      }
      return pCols.map(
        (c) =>
          ({
            columnId: c.id,
            spec: c.spec,
          }) satisfies PColumnIdAndSpec,
      );
    };
    return { alpha: forChain("alpha"), beta: forChain("beta") };
  })

  .outputWithStatus("pairsHeatmapPf", (ctx): PFrameHandle | undefined => {
    const pCols = ctx.outputs
      ?.resolve({ field: "pairsPF", allowPermanentAbsence: true })
      ?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    // Filter out CDR3 and Vgene columns
    let filteredPcols = pCols.filter(
      (col) =>
        col.spec.name !== "pl7.app/differentialTCRAbundance/tra_CDR3aa" &&
        col.spec.name !== "pl7.app/differentialTCRAbundance/trb_CDR3aa" &&
        col.spec.name !== "pl7.app/differentialTCRAbundance/tra_VGene" &&
        col.spec.name !== "pl7.app/differentialTCRAbundance/trb_VGene",
    );

    // Scope label columns to this block's clonotyping run(s). Multiple runs in a
    // project otherwise yield several identical-spec CDR3 columns, making the X/Y
    // sources ambiguous ("Inconsistent value"). The pairs clonotypeKey axes carry
    // the run id — keep only label columns from the same run(s).
    const pairRunIds = new Set(
      pCols
        .flatMap((c) => c.spec.axesSpec ?? [])
        .filter(
          (a) => a.name === "pl7.app/vdj/clonotypeKey" || a.name === "pl7.app/vdj/scClonotypeKey",
        )
        .map((a) => a.domain?.["pl7.app/vdj/clonotypingRunId"])
        .filter((r): r is string => r !== undefined),
    );

    // Get from the pool CDR3 aa and VGene pcolumns
    const cdr3Pcols = ctx.resultPool.selectColumns(
      (spec) =>
        spec.name === "pl7.app/vdj/sequence" &&
        spec.domain?.["pl7.app/alphabet"] === "aminoacid" &&
        spec.domain?.["pl7.app/vdj/feature"] === "CDR3" &&
        (pairRunIds.size === 0 ||
          pairRunIds.has(spec.axesSpec?.[0]?.domain?.["pl7.app/vdj/clonotypingRunId"] ?? "")),
    );
    const vGenePcols = ctx.resultPool.selectColumns(
      (spec) =>
        spec.name === "pl7.app/vdj/sequence" &&
        spec.domain?.["pl7.app/alphabet"] === "aminoacid" &&
        spec.domain?.["pl7.app/vdj/feature"] === "VGene" &&
        (pairRunIds.size === 0 ||
          pairRunIds.has(spec.axesSpec?.[0]?.domain?.["pl7.app/vdj/clonotypingRunId"] ?? "")),
    );

    if (cdr3Pcols !== undefined && vGenePcols !== undefined) {
      filteredPcols = [
        ...filteredPcols,
        ...cdr3Pcols,
        ...vGenePcols,
      ] as PColumn<TreeNodeAccessor>[];
    }

    // Add sample ID to labels information
    const clonotypeIds = ctx.resultPool.selectColumns(
      (spec) =>
        spec.name === "pl7.app/label" &&
        spec.axesSpec?.some(
          (axis) =>
            axis.name === "pl7.app/vdj/clonotypeKey" || axis.name === "pl7.app/vdj/scClonotypeKey",
        ),
    ) as PColumn<PColumnDataUniversal>[];

    const allPcols = [...filteredPcols, ...clonotypeIds];

    return ctx.createPFrame(allPcols);
  })

  .output("pairsHeatmapPcols", (ctx) => {
    const pCols = ctx.outputs
      ?.resolve({ field: "pairsPF", allowPermanentAbsence: true })
      ?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    // Filter out CDR3 and Vgene columns
    let filteredPcols = pCols.filter(
      (col) =>
        col.spec.name !== "pl7.app/differentialTCRAbundance/tra_CDR3aa" &&
        col.spec.name !== "pl7.app/differentialTCRAbundance/trb_CDR3aa" &&
        col.spec.name !== "pl7.app/differentialTCRAbundance/tra_VGene" &&
        col.spec.name !== "pl7.app/differentialTCRAbundance/trb_VGene",
    );

    // Scope CDR3 labels to THIS block's clonotyping run(s) (see pairsHeatmapPf) —
    // avoids ambiguous X/Y sources when the project has multiple clonotyping runs.
    const pairRunIds = new Set(
      pCols
        .flatMap((c) => c.spec.axesSpec ?? [])
        .filter(
          (a) => a.name === "pl7.app/vdj/clonotypeKey" || a.name === "pl7.app/vdj/scClonotypeKey",
        )
        .map((a) => a.domain?.["pl7.app/vdj/clonotypingRunId"])
        .filter((r): r is string => r !== undefined),
    );

    // Get from the pool CDR3 aa and VGene pcolumns
    const cdr3Pcols = ctx.resultPool.selectColumns(
      (spec) =>
        spec.name === "pl7.app/vdj/sequence" &&
        spec.domain?.["pl7.app/alphabet"] === "aminoacid" &&
        spec.domain?.["pl7.app/vdj/feature"] === "CDR3" &&
        (pairRunIds.size === 0 ||
          pairRunIds.has(spec.axesSpec?.[0]?.domain?.["pl7.app/vdj/clonotypingRunId"] ?? "")),
    );
    if (cdr3Pcols !== undefined) {
      filteredPcols = [...filteredPcols, ...cdr3Pcols] as PColumn<TreeNodeAccessor>[];
    }
    return filteredPcols.map(
      (c) =>
        ({
          columnId: c.id,
          spec: c.spec,
        }) satisfies PColumnIdAndSpec,
    );
  })

  // Two chain-scoped pFrames, each independent of selectedChain so a chain switch
  // never recomputes them (see buildFreqHeatmapPf). The UI picks the active one.
  .outputWithStatus("frequenciesHeatmapPfAlpha", (ctx): PFrameHandle | undefined =>
    buildFreqHeatmapPf(ctx, "alpha"),
  )
  .outputWithStatus("frequenciesHeatmapPfBeta", (ctx): PFrameHandle | undefined =>
    buildFreqHeatmapPf(ctx, "beta"),
  )

  .output("frequenciesHeatmapPcols", (ctx) => {
    // Both chains' column lists are computed here, independent of selectedChain,
    // so switching the chain does NOT recompute them (the pool scans below are
    // the switch-latency cost). The UI picks the active chain's list, and only
    // its default-options recalculate. See FrequenciesHeatmapPage.
    const forChain = (selectedChain: "alpha" | "beta"): PColumnIdAndSpec[] | undefined => {
      const outputName =
        selectedChain === "alpha" ? "mainAlphaFrequenciesPF" : "mainBetaFrequenciesPF";
      const pCols = ctx.outputs?.resolve(outputName)?.getPColumns();
      if (pCols === undefined) {
        return undefined;
      }

      const subtypeLabel =
        selectedChain === "alpha" ? "clonotypeToSubsetAlpha" : "clonotypeToSubsetBeta";
      const clonotypeToSubsetPcols = ctx.outputs
        ?.resolve({ field: subtypeLabel, allowPermanentAbsence: true })
        ?.getPColumns();

      // Get all metadata columns that are compatible with the Sample axis
      const metadataCols = ctx.resultPool.selectColumns((spec) => spec.name === "pl7.app/metadata");

      // Get the sequence column for the selected chain
      const chain = selectedChain === "alpha" ? "TCRAlpha" : "TCRBeta";
      const sequenceCol = ctx.resultPool.selectColumns(
        (spec) =>
          spec.name === "pl7.app/vdj/sequence" &&
          spec.domain?.["pl7.app/alphabet"] === "aminoacid" &&
          spec.domain?.["pl7.app/vdj/feature"] === "CDR3" &&
          spec.axesSpec[0].domain?.["pl7.app/vdj/chain"] === chain,
      );

      // Per-clonotype V gene, to offer as a Y label part.
      const vGeneCol = ctx.resultPool.selectColumns(
        (spec) =>
          spec.name === "pl7.app/vdj/geneHit" &&
          spec.domain?.["pl7.app/vdj/reference"] === "VGene" &&
          spec.axesSpec[0]?.domain?.["pl7.app/vdj/chain"] === chain,
      );

      const robustAnyLabel = selectedChain === "alpha" ? "robustAnyAlpha" : "robustAnyBeta";
      const robustAnyPcols = ctx.outputs
        ?.resolve({ field: robustAnyLabel, allowPermanentAbsence: true })
        ?.getPColumns();

      // Y sort key column.
      const meanNumeratorFreqLabel =
        selectedChain === "alpha" ? "meanNumeratorFreqAlpha" : "meanNumeratorFreqBeta";
      const meanNumeratorFreqPcols = ctx.outputs
        ?.resolve({ field: meanNumeratorFreqLabel, allowPermanentAbsence: true })
        ?.getPColumns();

      let allCols = [...pCols, ...metadataCols];
      if (clonotypeToSubsetPcols !== undefined) {
        allCols = [...allCols, ...clonotypeToSubsetPcols];
      }
      if (robustAnyPcols !== undefined) {
        allCols = [...allCols, ...robustAnyPcols];
      }
      if (meanNumeratorFreqPcols !== undefined) {
        allCols = [...allCols, ...meanNumeratorFreqPcols];
      }
      if (sequenceCol !== undefined) {
        allCols = [...allCols, ...sequenceCol];
      }
      if (vGeneCol !== undefined) {
        allCols = [...allCols, ...vGeneCol];
      }

      return allCols.map(
        (c) =>
          ({
            columnId: c.id,
            spec: c.spec,
          }) satisfies PColumnIdAndSpec,
      );
    };

    return { alpha: forChain("alpha"), beta: forChain("beta") };
  })

  .output("msaPf", (ctx) => {
    const selectedChain = ctx.data.selectedChain ?? "alpha";
    const outputName = selectedChain === "alpha" ? "topDegPFAlpha" : "topDegPFBeta";
    const msaCols = ctx.outputs?.resolve(outputName)?.getPColumns();
    if (!msaCols) return undefined;

    const datasetRef = ctx.data.mainRef;
    if (datasetRef === undefined) return undefined;

    return createPFrameForGraphs(ctx, msaCols);
  })

  .output("isRunning", (ctx): boolean => ctx.outputs?.getIsReadyOrError() === false)

  .title((ctx) => ctx.data.title ?? "TCR Disco")

  .sections((ctx) => {
    const sections: Array<{ type: "link"; href: `/${string}`; label: string }> = [
      { type: "link" as const, href: "/" as const, label: "Main" },
      { type: "link" as const, href: "/graph" as const, label: "Volcano plot" },
      {
        type: "link" as const,
        href: "/freq-heatmap" as const,
        label: "Enriched clonotypes heatmap",
      },
    ];

    if (ctx.data.findTcrAbPairs) {
      sections.push({ type: "link" as const, href: "/pairs" as const, label: "TCR AB Pairs" });
      sections.push({
        type: "link" as const,
        href: "/pairs-heatmap" as const,
        label: "Pairs correlation heatmap",
      });
    }

    return sections;
  })

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
