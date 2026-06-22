import type { GraphMakerState } from "@milaboratories/graph-maker";
import type {
  CanonicalizedJson,
  InferOutputsType,
  PColumn,
  PColumnDataUniversal,
  PColumnIdAndSpec,
  PFrameHandle,
  PlDataTableFilters,
  PlDataTableFilterSpecLeaf,
  PlDataTableStateV2,
  PlMultiSequenceAlignmentModel,
  PlRef,
  PTableColumnId,
  TreeNodeAccessor,
} from "@platforma-sdk/model";
import {
  BlockModel,
  canonicalizeJson,
  createPFrameForGraphs,
  createPlDataTable,
  createPlDataTableSheet,
  createPlDataTableStateV2,
  getUniquePartitionKeys,
  isPColumnSpec,
  toColumnSnapshotProvider,
} from "@platforma-sdk/model";

export type UiState = {
  tableState: PlDataTableStateV2;
  pairsTableState: PlDataTableStateV2;
  title?: string;
  selectedChain?: "alpha" | "beta";
  cdSubsetColValid: boolean;
  graphState: GraphMakerState;
  pairsHeatmapState: GraphMakerState;
  frequenciesHeatmapState: GraphMakerState;
  alignmentModel: PlMultiSequenceAlignmentModel;
};

export type BlockArgs = {
  name?: string;
  mainRef?: PlRef;
  cdRef?: PlRef;
  cdSubsetCol?: PlRef;
  pairingMetadataCol?: string;
  covariateRefs: PlRef[];
  contrastFactor?: PlRef;
  numerators: string[];
  denominators: string[];
  findTcrAbPairs: boolean;
  thresholdCounts: number;
  thresholdSamples: number;
  log2FcThreshold: number;
  pAdjThreshold: number;
};

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
): CanonicalizedJson<PTableColumnId> | undefined {
  const col = pCols.find((c) => c.spec.name === name);
  return col ? canonicalizeJson<PTableColumnId>({ type: "column", id: col.id }) : undefined;
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

// Wrap already-resolved p-columns as V3 `TableColumnVariant`s. Marked primary so
// they form the table's join backbone (V2's default "all columns are core"); the
// SDK auto-discovers and left-joins the matching label columns. The snapshot
// provider derives each column's real data status from its accessor.
function toTableColumns(pCols: PColumn<PColumnDataUniversal>[]) {
  return toColumnSnapshotProvider(pCols)
    .getAllColumns()
    .map((column) => ({ column, isPrimary: true }));
}

export const model = BlockModel.create()

  .withArgs<BlockArgs>({
    covariateRefs: [],
    numerators: [],
    denominators: [],
    findTcrAbPairs: false,
    thresholdCounts: 10,
    thresholdSamples: 3,
    log2FcThreshold: 0,
    pAdjThreshold: 0.05,
  })

  .withUiState<UiState>({
    title: "TCR Disco",
    tableState: createPlDataTableStateV2(),
    pairsTableState: createPlDataTableStateV2(),
    selectedChain: "alpha",
    cdSubsetColValid: false,
    graphState: {
      title: "Volcano plot",
      template: "dots",
      currentTab: null,
    },
    pairsHeatmapState: {
      title: "TCR A/B pairs correlation heatmap",
      template: "heatmapClustered",
      layersSettings: {
        heatmapClustered: {
          dendrogramX: false,
          dendrogramY: false,
        },
      },
      axesSettings: {
        axisX: {
          cellSize: 20,
        },
        axisY: {
          cellSize: 20,
        },
      },
    },
    frequenciesHeatmapState: {
      title: "Enriched clonotypes heatmap",
      template: "heatmapClustered",
      layersSettings: {
        heatmapClustered: {
          normalizationDirection: "row",
          normalizationMethod: "standardScaling",
          dendrogramX: false,
          dendrogramY: false,
          NAValueAs: null,
          showEmptyColumns: true,
        },
      },
      axesSettings: {
        axisX: {
          cellSize: 20,
        },
        axisY: {
          cellSize: 20,
        },
      },
    },
    alignmentModel: {},
  })

  .argsValid(
    (ctx) =>
      ctx.args.mainRef !== undefined &&
      ctx.args.covariateRefs !== undefined &&
      ctx.args.contrastFactor !== undefined &&
      ctx.args.numerators.length > 0 &&
      ctx.args.denominators.length > 0 &&
      ctx.args.log2FcThreshold !== undefined &&
      ctx.args.pAdjThreshold !== undefined &&
      ctx.args.thresholdCounts !== undefined &&
      ctx.args.thresholdSamples !== undefined &&
      (!ctx.args.cdRef || (ctx.args.cdSubsetCol !== undefined && ctx.uiState?.cdSubsetColValid)),
  )

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
    if (!ctx.args.contrastFactor) return undefined;

    const pColumn = ctx.resultPool.getPColumnByRef(ctx.args.contrastFactor);
    if (!pColumn) return undefined;

    return ctx.createPFrame([pColumn]);
  })

  .output("cdSubsetOptions", (ctx) => {
    if (!ctx.args.cdSubsetCol) return undefined;

    const pColumn = ctx.resultPool.getPColumnByRef(ctx.args.cdSubsetCol);
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
    const selectedChain = ctx.uiState?.selectedChain ?? "alpha";
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
      log2fcId !== undefined
        ? { type: "greaterThanOrEqual", column: log2fcId, x: ctx.args.log2FcThreshold }
        : undefined,
      // Filter for adjusted p-value columns (<= pAdjThreshold)
      padjId !== undefined
        ? { type: "lessThanOrEqual", column: padjId, x: ctx.args.pAdjThreshold }
        : undefined,
      robustEnrichmentId !== undefined
        ? { type: "patternEquals", column: robustEnrichmentId, value: "Robust" }
        : undefined,
    ]);

    return createPlDataTable(ctx, {
      columns: toTableColumns(pCols),
      tableState: ctx.uiState?.tableState,
      filters,
    });
  })

  .output("sheets", (ctx) => {
    const selectedChain = ctx.uiState?.selectedChain ?? "alpha";
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
      padjId !== undefined
        ? { type: "lessThanOrEqual", column: padjId, x: ctx.args.pAdjThreshold }
        : undefined,
    ]);

    return createPlDataTable(ctx, {
      columns: toTableColumns(pCols),
      tableState: ctx.uiState?.pairsTableState,
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

  .outputWithStatus("topTablePf", (ctx): PFrameHandle | undefined => {
    const selectedChain = ctx.uiState?.selectedChain ?? "alpha";
    const outputName = selectedChain === "alpha" ? "topDegPFAlpha" : "topDegPFBeta";
    let pCols = ctx.outputs?.resolve(outputName)?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    pCols = filterPCols(pCols);

    return createPFrameForGraphs(ctx, pCols);
  })

  .output("topTablePcols", (ctx) => {
    const selectedChain = ctx.uiState?.selectedChain ?? "alpha";
    const outputName = selectedChain === "alpha" ? "topDegPFAlpha" : "topDegPFBeta";
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

    // Get from the pool CDR3 aa and VGene pcolumns
    const cdr3Pcols = ctx.resultPool.selectColumns(
      (spec) =>
        spec.name === "pl7.app/vdj/sequence" &&
        spec.domain?.["pl7.app/alphabet"] === "aminoacid" &&
        spec.domain?.["pl7.app/vdj/feature"] === "CDR3",
    );
    const vGenePcols = ctx.resultPool.selectColumns(
      (spec) =>
        spec.name === "pl7.app/vdj/sequence" &&
        spec.domain?.["pl7.app/alphabet"] === "aminoacid" &&
        spec.domain?.["pl7.app/vdj/feature"] === "VGene",
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

    // Get from the pool CDR3 aa and VGene pcolumns
    const cdr3Pcols = ctx.resultPool.selectColumns(
      (spec) =>
        spec.name === "pl7.app/vdj/sequence" &&
        spec.domain?.["pl7.app/alphabet"] === "aminoacid" &&
        spec.domain?.["pl7.app/vdj/feature"] === "CDR3",
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

  .outputWithStatus("frequenciesHeatmapPf", (ctx): PFrameHandle | undefined => {
    const selectedChain = ctx.uiState?.selectedChain ?? "alpha";
    const outputName =
      selectedChain === "alpha" ? "mainAlphaFrequenciesPF" : "mainBetaFrequenciesPF";
    let allPcols = ctx.outputs?.resolve(outputName)?.getPColumns();
    if (allPcols === undefined) {
      return undefined;
    }

    // Get all metadata columns that are compatible with the Sample axis
    // const sampleIds = ctx.resultPool.selectColumns(
    //   (spec) => spec.name === 'pl7.app/label'
    //     && spec.axesSpec?.some((axis) => axis.name === 'pl7.app/sampleId'
    //       || axis.name === 'pl7.app/vdj/clonotypeKey'
    //       || axis.name === 'pl7.app/vdj/scClonotypeKey'
    //       || axis.name === 'pl7.app/metadata'),
    // ) as PColumn<PColumnDataUniversal>[];

    // let allPcols = [...pCols, ...sampleIds];
    // let allPcols = pCols;

    const subtypeLabel =
      selectedChain === "alpha" ? "clonotypeToSubsetAlpha" : "clonotypeToSubsetBeta";
    const clonotypeToSubsetPcols = ctx.outputs
      ?.resolve({ field: subtypeLabel, allowPermanentAbsence: true })
      ?.getPColumns();
    if (clonotypeToSubsetPcols !== undefined) {
      allPcols = [...allPcols, ...clonotypeToSubsetPcols];
    }

    const robustAnyLabel = selectedChain === "alpha" ? "robustAnyAlpha" : "robustAnyBeta";
    const robustAnyPcols = ctx.outputs
      ?.resolve({ field: robustAnyLabel, allowPermanentAbsence: true })
      ?.getPColumns();
    if (robustAnyPcols !== undefined) {
      allPcols = [...allPcols, ...robustAnyPcols];
    }

    return createPFrameForGraphs(ctx, allPcols);
  })

  .output("frequenciesHeatmapPcols", (ctx) => {
    const selectedChain = ctx.uiState?.selectedChain ?? "alpha";
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

    // Get the sequence column for the sleected chain
    const chain = selectedChain === "alpha" ? "TCRAlpha" : "TCRBeta";
    const sequenceCol = ctx.resultPool.selectColumns(
      (spec) =>
        spec.name === "pl7.app/vdj/sequence" &&
        spec.domain?.["pl7.app/alphabet"] === "aminoacid" &&
        spec.domain?.["pl7.app/vdj/feature"] === "CDR3" &&
        spec.axesSpec[0].domain?.["pl7.app/vdj/chain"] === chain,
    );

    const robustAnyLabel = selectedChain === "alpha" ? "robustAnyAlpha" : "robustAnyBeta";
    const robustAnyPcols = ctx.outputs
      ?.resolve({ field: robustAnyLabel, allowPermanentAbsence: true })
      ?.getPColumns();

    let allCols = [...pCols, ...metadataCols];
    if (clonotypeToSubsetPcols !== undefined) {
      allCols = [...allCols, ...clonotypeToSubsetPcols];
    }
    if (robustAnyPcols !== undefined) {
      allCols = [...allCols, ...robustAnyPcols];
    }
    if (sequenceCol !== undefined) {
      allCols = [...allCols, ...sequenceCol];
    }

    return allCols.map(
      (c) =>
        ({
          columnId: c.id,
          spec: c.spec,
        }) satisfies PColumnIdAndSpec,
    );
  })

  .output("msaPf", (ctx) => {
    const selectedChain = ctx.uiState?.selectedChain ?? "alpha";
    const outputName = selectedChain === "alpha" ? "topDegPFAlpha" : "topDegPFBeta";
    const msaCols = ctx.outputs?.resolve(outputName)?.getPColumns();
    if (!msaCols) return undefined;

    const datasetRef = ctx.args.mainRef;
    if (datasetRef === undefined) return undefined;

    return createPFrameForGraphs(ctx, msaCols);
  })

  .title((ctx) => ctx.uiState?.title ?? "TCR Disco")

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

    if (ctx.args.findTcrAbPairs) {
      sections.push({ type: "link" as const, href: "/pairs" as const, label: "TCR AB Pairs" });
      sections.push({
        type: "link" as const,
        href: "/pairs-heatmap" as const,
        label: "Pairs correlation heatmap",
      });
    }

    return sections;
  })

  .done(2);

export type BlockOutputs = InferOutputsType<typeof model>;
