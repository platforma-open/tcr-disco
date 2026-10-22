import { kind } from "@platforma-open/milaboratories.tcrdisco-enrichment.kind";
import type {
  ColumnRecipe,
  InferOutputsType,
  PColumnIdAndSpec,
  PFrameHandle,
  PlDataTableFilters,
  PlDataTableFilterSpecLeaf,
  PTableColumnId,
  RenderCtxBase,
  ArgsIssue,
  StringMatcher,
} from "@platforma-sdk/model";
import {
  BlockModelV3,
  createColumnValueOptions,
  createPFrameForGraphs,
  createPlDataTableSheet,
  createPlDataTableV3,
  getUniquePartitionKeys,
  hasReachableData,
  TreeNodeAccessor,
} from "@platforma-sdk/model";
import {
  createColumnFrame,
  exact,
  getChainCdr3Columns,
  getChainVGeneColumns,
  getClonotypeLabelColumns,
  getInputOptions,
  getMetadataColumns,
  getMetadataOptions,
  getOutputColumns,
  getRunSequenceColumns,
  hasBarcodeSource,
  toIdsAndSpecs,
  toPColumns,
} from "./columns";
import { blockDataModel } from "./dataModel";
import type { BlockArgs, BlockData } from "./types";

export { blockDataModel } from "./dataModel";
export * from "./types";
export type { ColumnFrame, ColumnPickerOption } from "./columns";

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

  // Project the unified data into the workflow's args shape, even from an incomplete
  // configuration: `argsIssues` decides whether the block may run. Pure function of
  // `data` only.
  .args<BlockArgs>((data) => {
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

  // An error disables Run (replaces V1 `.argsValid`).
  .argsIssues(({ args, data }) => {
    const issues: ArgsIssue[] = [];
    const error = (message: string) => issues.push({ severity: "error", message });
    if (args.mainRef === undefined) error("Main dataset is required");
    if (args.contrastFactor === undefined) error("Contrast factor is required");
    if (args.numerators.length === 0) error("Select at least one numerator");
    if (args.denominators.length === 0) error("Select at least one denominator");
    // CD4/CD8 dataset is optional; when set, its subset column must be chosen and
    // must actually contain CD4/CD8 values (checked by the UI from the column's
    // values, snapshotted into data.cdSubsetColValid on the user's column selection).
    if (args.cdRef && (args.cdSubsetCol === undefined || !data.cdSubsetColValid))
      error("Selected CD4/CD8 subset column must contain CD4 or CD8 values");
    // Thresholds have defaults, so an empty one means the user cleared the field.
    // The run stays gated until a number is back in it.
    if (args.thresholdCounts === undefined) error("Min UMI counts is required");
    if (args.thresholdSamples === undefined) error("Min replicates is required");
    if (args.log2FcThreshold === undefined) error("Log2(FC) threshold is required");
    if (args.pAdjThreshold === undefined) error("Adjusted p-value threshold is required");
    return issues;
  })

  // Allow user to choose Alpha chain, will pick beta if available
  // @TODO: Should we allow single analysis of beta chain?
  .output("inputOptions", (ctx) => getInputOptions(ctx))

  .output("metadataOptions", (ctx) => getMetadataOptions(ctx))

  // The values of the contrast factor column, for the numerator and denominator pickers.
  // `undefined` until a contrast factor is picked.
  .output("contrastValues", (ctx) =>
    ctx.data.contrastFactor === undefined
      ? undefined
      : createColumnValueOptions({ valueColumn: ctx.data.contrastFactor }),
  )

  // Where the UI reads the values of the CD4/CD8 subset column from, to check that it holds
  // CD4 or CD8 labels. `undefined` until a subset column is picked.
  .output("cdSubsetValues", (ctx) =>
    ctx.data.cdSubsetCol === undefined ? undefined : createColumnFrame(ctx, ctx.data.cdSubsetCol),
  )

  // Whether samples of different chains are related by a barcode: a "Barcode ID"
  // metadata column, present in demultiplexed data, or a multiplexing rules column
  // the workflow builds one from. Without either, the user picks the pairing column.
  //
  // Only the first multiplexing rules column is inspected — must stay symmetric
  // with the workflow's multiplexingSource.resolve() in
  // multiplexing-source.lib.tengo, which attempts column 0 only. Using `.some()`
  // here would lie when column 0 is multi-tag but a later column is single-tag:
  // the model would hide the dropdown and the workflow would log the multi-tag
  // rejection and skip synthesis, leaving the user with broken pairs and no manual
  // recovery path. If the workflow grows multi-column selection (v2), update both
  // sites together.
  //
  // Only single-tag rules count as usable: multiplexingSource.resolve() rejects
  // multi-tag (v1 limit). Returning true on a multi-tag column would hide the
  // dropdown AND skip synthesis — pairs would silently fail. Falling through to
  // false keeps the dropdown reachable for manual recovery.
  //
  // Axis names go unchecked here. The `pl7.app/sequencing/multiplexingRules`
  // column-name contract requires `[sampleGroupId, sampleId]` axes by S&D spec;
  // the workflow selector enforces the match. A non-conforming upstream would
  // fail the selector and skip synthesis there too.
  .output("barcodeColPresent", (ctx) => hasBarcodeSource(ctx))

  // Run report from workflow (report.txt): empty input or threshold filter warnings.
  .output("reportContent", (ctx): string | undefined => {
    const content = ctx.outputs?.resolve("reportContent")?.getDataAsString();
    return typeof content === "string" && content.trim().length > 0 ? content.trim() : undefined;
  })

  .outputWithStatus("pt", (ctx) => {
    const selectedChain = ctx.data.selectedChain ?? "alpha";
    const columns = getTopTableColumns(ctx, selectedChain)?.getColumns();
    if (columns === undefined) {
      return undefined;
    }

    const log2fcId = tableColumnId(columns, "pl7.app/differentialTCRAbundance/log2foldchange");
    const padjId = tableColumnId(columns, "pl7.app/differentialTCRAbundance/padj");
    const robustEnrichmentId = tableColumnId(
      columns,
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
      // The block's own result columns, all stored as they are; they form the
      // table's join backbone and the SDK left-joins their label columns.
      primaryColumns: columns,
      columns: [],
      tableState,
      filters,
    });
  })

  // One sheet per contrast: every result column is partitioned by it.
  .output("sheets", (ctx) =>
    partitionSheets(
      ctx,
      getTopTableColumns(ctx, ctx.data.selectedChain ?? "alpha")?.getColumns()[0],
    ),
  )

  .outputWithStatus("pairsPt", (ctx) => {
    const columns = getOptionalPairsOutput(ctx)?.getColumns();
    if (columns === undefined) {
      return undefined;
    }

    const padjId = tableColumnId(columns, "pl7.app/differentialTCRAbundance/padj");
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
      primaryColumns: columns,
      columns: [],
      tableState: ctx.data.pairsTableState,
      filters,
    });
  })

  .output("pairsSheets", (ctx) =>
    partitionSheets(ctx, getOptionalPairsOutput(ctx)?.getColumns()[0]),
  )

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
    const forChain = (chain: Chain): PColumnIdAndSpec[] | undefined => {
      const columns = getTopTableColumns(ctx, chain)?.getColumns();
      return columns === undefined ? undefined : toIdsAndSpecs(columns);
    };
    return { alpha: forChain("alpha"), beta: forChain("beta") };
  })

  .outputWithStatus("pairsHeatmapPf", (ctx): PFrameHandle | undefined => {
    const pairs = getPairColumns(ctx);
    if (pairs === undefined) {
      return undefined;
    }

    // CDR3 aa and V gene sequences of the pairs' clonotyping run(s), and the
    // clonotype labels, which carry the sample ids.
    const columns = [
      ...pairs.columns,
      ...getRunSequenceColumns(ctx, "CDR3", pairs.runIds),
      ...getRunSequenceColumns(ctx, "VGene", pairs.runIds),
      ...getClonotypeLabelColumns(ctx),
    ];

    return ctx.createPFrame(columns.map((column) => column.id));
  })

  .output("pairsHeatmapPcols", (ctx) => {
    const pairs = getPairColumns(ctx);
    if (pairs === undefined) {
      return undefined;
    }

    // Scope CDR3 labels to THIS block's clonotyping run(s) (see getPairColumns) —
    // avoids ambiguous X/Y sources when the project has multiple clonotyping runs.
    return toIdsAndSpecs([...pairs.columns, ...getRunSequenceColumns(ctx, "CDR3", pairs.runIds)]);
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
    const forChain = (selectedChain: Chain): PColumnIdAndSpec[] | undefined => {
      const outputName =
        selectedChain === "alpha" ? "mainAlphaFrequenciesPF" : "mainBetaFrequenciesPF";
      const frequencies = getOutputColumns(ctx, ctx.outputs?.resolve(outputName));
      if (frequencies === undefined) {
        return undefined;
      }

      const chain = selectedChain === "alpha" ? "TCRAlpha" : "TCRBeta";
      return toIdsAndSpecs([
        ...frequencies.getColumns(),
        // Every sample metadata column, to group and annotate the samples by.
        ...getMetadataColumns(ctx),
        ...getOptionalOutputColumns(
          ctx,
          selectedChain === "alpha" ? "clonotypeToSubsetAlpha" : "clonotypeToSubsetBeta",
        ),
        ...getOptionalOutputColumns(
          ctx,
          selectedChain === "alpha" ? "robustAnyAlpha" : "robustAnyBeta",
        ),
        // Y sort key column.
        ...getOptionalOutputColumns(
          ctx,
          selectedChain === "alpha" ? "meanNumeratorFreqAlpha" : "meanNumeratorFreqBeta",
        ),
        // The CDR3 sequence of the selected chain.
        ...getChainCdr3Columns(ctx, chain),
        // Per-clonotype V gene, to offer as a Y label part.
        ...getChainVGeneColumns(ctx, chain),
      ]);
    };

    return { alpha: forChain("alpha"), beta: forChain("beta") };
  })

  .output("msaPf", (ctx) => {
    const selectedChain = ctx.data.selectedChain ?? "alpha";
    const columns = getTopTableColumns(ctx, selectedChain)?.getColumns();
    if (columns === undefined) return undefined;

    const datasetRef = ctx.data.mainRef;
    if (datasetRef === undefined) return undefined;

    return createPFrameForGraphs(ctx, toPColumns(columns));
  })

  .output("isRunning", (ctx): boolean => ctx.outputs?.getIsReadyOrError() === false)

  .title((ctx) => ctx.data.title ?? "TCRdisco")

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

// Internals

type Chain = "alpha" | "beta";

// Builds the enriched-clonotypes-heatmap pFrame for one chain. The chain is an
// explicit arg (not read from `ctx.data.selectedChain`), so the two outputs below
// don't depend on the selected chain: both are built once and cached, and a chain
// switch in the UI never recomputes them — the UI just picks the active handle.
function buildFreqHeatmapPf(
  ctx: RenderCtxBase<BlockArgs, BlockData>,
  chain: Chain,
): PFrameHandle | undefined {
  const outputName = chain === "alpha" ? "mainAlphaFrequenciesPF" : "mainBetaFrequenciesPF";
  const frequencies = getOutputColumns(ctx, ctx.outputs?.resolve(outputName));
  if (frequencies === undefined) {
    return undefined;
  }

  // Y sort key (mean numerator frequency) is added explicitly, like robustAny;
  // it is a value column, so createPFrameForGraphs does not auto-discover it (no dup).
  const allColumns = [
    ...frequencies.getColumns(),
    ...getOptionalOutputColumns(
      ctx,
      chain === "alpha" ? "clonotypeToSubsetAlpha" : "clonotypeToSubsetBeta",
    ),
    ...getOptionalOutputColumns(ctx, chain === "alpha" ? "robustAnyAlpha" : "robustAnyBeta"),
    ...getOptionalOutputColumns(
      ctx,
      chain === "alpha" ? "meanNumeratorFreqAlpha" : "meanNumeratorFreqBeta",
    ),
  ];

  // NB: do NOT add the per-clonotype V gene / CDR3 columns explicitly here —
  // createPFrameForGraphs auto-discovers them as related columns of the clonotype
  // axis (adding them again throws "Duplicate column id"). They are listed in
  // frequenciesHeatmapPcols only so the UI can find their index for the Y-label
  // default-options.
  return createPFrameForGraphs(ctx, toPColumns(allColumns));
}

// Builds the volcano-plot pFrame for one chain. Chain is an explicit arg (not
// read from selectedChain), so the two outputs below are cached and a chain
// switch never recomputes them — the UI just picks the active handle.
function buildTopTablePf(
  ctx: RenderCtxBase<BlockArgs, BlockData>,
  chain: Chain,
): PFrameHandle | undefined {
  const graphColumns = getTopTableColumns(ctx, chain)
    ?.filter({ include: { name: VOLCANO_COLUMN_NAMES } })
    .getColumns();
  if (graphColumns === undefined) {
    return undefined;
  }
  return createPFrameForGraphs(ctx, toPColumns(graphColumns));
}

// Columns allowed as volcano sources: log2 FC and -log10 Padjust for the axes,
// plus what the points can be grouped and filtered by.
const VOLCANO_COLUMN_NAMES: StringMatcher[] = [
  "pl7.app/differentialTCRAbundance/log2foldchange",
  "pl7.app/differentialTCRAbundance/minlog10padj",
  "pl7.app/differentialTCRAbundance/regulationDirection",
  "pl7.app/differentialTCRAbundance/contrastGroup",
  "pl7.app/differentialTCRAbundance/chain",
  "pl7.app/differentialTCRAbundance/cdsubset",
  "pl7.app/differentialTCRAbundance/robustEnrichment",
].map(exact);

// The pairs output carries its own copies of the chains' CDR3 and V genes; the
// heatmap takes them from the clonotyping run instead.
const PAIR_SEQUENCE_COLUMN_NAMES: StringMatcher[] = [
  "pl7.app/differentialTCRAbundance/tra_CDR3aa",
  "pl7.app/differentialTCRAbundance/trb_CDR3aa",
  "pl7.app/differentialTCRAbundance/tra_VGene",
  "pl7.app/differentialTCRAbundance/trb_VGene",
].map(exact);

// Columns of the differential-abundance results of one chain, once all have arrived.
function getTopTableColumns(ctx: RenderCtxBase<BlockArgs, BlockData>, chain: Chain) {
  return getOutputColumns(
    ctx,
    ctx.outputs?.resolve(chain === "alpha" ? "topDegPFAlpha" : "topDegPFBeta"),
  );
}

// Columns of the predicted pairs, written only when pairing was asked for and
// both chains are present; `undefined` while absent or still arriving.
function getOptionalPairsOutput(ctx: RenderCtxBase<BlockArgs, BlockData>) {
  return getOutputColumns(
    ctx,
    ctx.outputs?.resolve({ field: "pairsPF", allowPermanentAbsence: true }),
  );
}

// Columns of an output the workflow writes only for some inputs; none while it is
// absent or still arriving.
function getOptionalOutputColumns(
  ctx: RenderCtxBase<BlockArgs, BlockData>,
  field: string,
): ColumnRecipe[] {
  return (
    getOutputColumns(
      ctx,
      ctx.outputs?.resolve({ field, allowPermanentAbsence: true }),
    )?.getColumns() ?? []
  );
}

// Columns of the predicted alpha/beta pairs, and the clonotyping runs their
// clonotype axes belong to. `undefined` until the pairs output has arrived.
function getPairColumns(
  ctx: RenderCtxBase<BlockArgs, BlockData>,
): { columns: ColumnRecipe[]; runIds: Set<string> } | undefined {
  const pairs = getOptionalPairsOutput(ctx);
  if (pairs === undefined) {
    return undefined;
  }

  // Scope label columns to this block's clonotyping run(s). Multiple runs in a
  // project otherwise yield several identical-spec CDR3 columns, making the X/Y
  // sources ambiguous ("Inconsistent value"). The pairs clonotypeKey axes carry
  // the run id — keep only label columns from the same run(s).
  const runIds = new Set(
    pairs
      .getColumns()
      .flatMap((column) => column.getSpec().axesSpec)
      .filter(
        (axis) =>
          axis.name === "pl7.app/vdj/clonotypeKey" || axis.name === "pl7.app/vdj/scClonotypeKey",
      )
      .map((axis) => axis.domain?.["pl7.app/vdj/clonotypingRunId"])
      .filter((runId): runId is string => runId !== undefined),
  );

  return {
    columns: pairs.filter({ exclude: { name: PAIR_SEQUENCE_COLUMN_NAMES } }).getColumns(),
    runIds,
  };
}

// A one-sheet-per-partition selector over the first axis of a partitioned result
// column; `undefined` while its data is not readable.
function partitionSheets(
  ctx: RenderCtxBase<BlockArgs, BlockData>,
  column: ColumnRecipe | undefined,
) {
  if (column === undefined || !hasReachableData(column)) return undefined;
  const data = column.getData();
  if (!(data instanceof TreeNodeAccessor)) return undefined;

  const partitionKeys = getUniquePartitionKeys(data)?.[0];
  if (!partitionKeys) return undefined;

  return [createPlDataTableSheet(ctx, column.getSpec().axesSpec[0], partitionKeys)];
}

// Resolve a table column id (for default-filter leaves) by its p-column spec
// name, within the columns being shown in a given table. Returns undefined when
// the column is absent so the corresponding default filter is simply skipped.
function tableColumnId(columns: ColumnRecipe[], name: string): PTableColumnId | undefined {
  const column = columns.find((c) => c.getSpec().name === name);
  return column ? { type: "column", id: column.id } : undefined;
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
