import { kind } from "@platforma-open/milaboratories.tcrdisco-enrichment.kind";
import type { ColumnUniversalId, ColumnValueId, PlRef } from "@platforma-sdk/model";
import {
  createColumnValueId,
  createGlobalPObjectId,
  createPlDataTableStateV2,
  DataModelBuilder,
  isColumnValueId,
  isPlRef,
} from "@platforma-sdk/model";
import type {
  BlockData,
  BlockDataV1,
  BlockDataV2,
  BlockDataV3,
  BlockDataV4,
  LegacyBlockArgs,
  LegacyUiState,
} from "./types";

// Fresh enriched-clonotypes heatmap state. The Y label-part default (show
// CDR3-aa + V-gene, hide the clone-key axis) is NOT stored here — it lives on the
// GraphMaker `defaultAxesSettings` prop (see FrequenciesHeatmapPage), so it
// re-resolves against the current chain's sources on every switch.
function defaultFreqHeatmapState(): BlockData["frequenciesHeatmapState"] {
  return {
    title: "Enriched clonotypes heatmap",
    // Plain heatmap layer: ySortBy is dropped while a Y dendrogram exists, so
    // clustering and frequency-sorting can't coexist.
    template: "heatmap",
    layersSettings: {
      heatmap: {
        // Log-normalized frequencies by default (base-10, after row scaling).
        transform: "log",
        normalizationDirection: "row",
        normalizationMethod: "standardScaling",
        NAValueAs: null,
        showEmptyColumns: true,
      },
    },
    axesSettings: {
      axisX: { cellSize: 20 },
      // Label parts come from `defaultAxesSettings` (see the factory comment).
      // sorting "desc" ranks by the ySortBy column (mean numerator frequency, wired
      // in FrequenciesHeatmapPage).
      axisY: { cellSize: 20, sorting: "desc" },
    },
  };
}

// Fresh volcano-plot state. A factory so alpha and beta get independent objects.
function defaultGraphState(): BlockData["graphState"] {
  return {
    title: "Volcano plot",
    template: "dots",
    currentTab: null,
  };
}

// Drops a chart's saved color mappings for the sources bound to its Grouping
// input, so they are seeded afresh. graph-maker (>= 1.9) reads the
// `pl7.app/graph/palette` annotation only when it creates a mapping; a mapping
// already saved in `dataBindAes` wins. A volcano saved before that keeps its own
// colors for the regulation direction and never picks up the Up/Down/NS palette
// the column declares. `dataBindAes` is keyed by the ids graph-maker gives the
// selected sources, so the entries are found through the Grouping selection
// rather than by column name.
function withGroupingColorsReseeded(state: BlockData["graphState"]): BlockData["graphState"] {
  const aes = state.dataBindAes;
  if (aes === undefined) return state;
  const components = state.optionsState?.components as
    | Record<string, { selectorStates?: { selectedSource: string }[] } | undefined>
    | undefined;
  const grouping = new Set(
    (components?.grouping?.selectorStates ?? []).map((s) => s.selectedSource),
  );
  if (grouping.size === 0) return state;
  const kept = Object.fromEntries(Object.entries(aes).filter(([source]) => !grouping.has(source)));
  return { ...state, dataBindAes: kept };
}

// Moves stored data to column ids. A ref to an upstream output becomes the
// result-pool id of that output, which names the same block and column. The
// compared groups were plain values of the contrast factor column, so each becomes
// a value id of that column's new id; without a contrast factor ref they name no
// column and are dropped. The pairing column was the label of a metadata column,
// which names no producing block, so it is dropped, to be picked again.
function toColumnIds(data: BlockDataV4): BlockData {
  const { mainRef, cdRef, cdSubsetCol, contrastFactor } = data;
  const contrastColumn = isPlRef(contrastFactor) ? plRefToColumnId(contrastFactor) : undefined;
  return {
    ...data,
    mainRef: mainRef === undefined ? undefined : plRefToColumnId(mainRef),
    cdRef: cdRef === undefined ? undefined : plRefToColumnId(cdRef),
    cdSubsetCol: cdSubsetCol === undefined ? undefined : plRefToColumnId(cdSubsetCol),
    pairingMetadataCol: undefined,
    covariateRefs: data.covariateRefs.map(plRefToColumnId),
    contrastFactor: contrastFactor === undefined ? undefined : plRefToColumnId(contrastFactor),
    numerators: toColumnValueIds(data.numerators, contrastColumn),
    denominators: toColumnValueIds(data.denominators, contrastColumn),
  };
}

function plRefToColumnId(ref: PlRef): ColumnUniversalId {
  return createGlobalPObjectId(ref.blockId, ref.name);
}

// A pick that already is a value id is kept as is; a plain value becomes a value
// id of `column` holding its text, the form every column value id carries: text
// stays as stored, a number becomes its decimal text. Order and repeats are kept.
function toColumnValueIds(
  picks: readonly unknown[],
  column: ColumnUniversalId | undefined,
): ColumnValueId[] {
  return picks.flatMap((pick) => {
    if (isColumnValueId(pick)) return [pick];
    if (column === undefined) return [];
    if (typeof pick === "string" || (typeof pick === "number" && Number.isFinite(pick)))
      return [createColumnValueId({ column, value: String(pick) })];
    return [];
  });
}

// Single source of truth for fresh-project defaults, reused by both `init`
// (new projects) and `upgradeLegacy` (fallbacks for fields absent in V1 state).
// Mirrors the pre-V3 `.withArgs` / `.withUiState` defaults exactly.
function defaultData(): BlockData {
  return {
    covariateRefs: [],
    numerators: [],
    denominators: [],
    findTcrAbPairs: false,
    thresholdCounts: 10,
    thresholdSamples: 3,
    log2FcThreshold: 3,
    pAdjThreshold: 0.05,
    title: "TCRdisco",
    selectedChain: "alpha",
    cdSubsetColValid: false,
    tableState: createPlDataTableStateV2(),
    tableStateBeta: createPlDataTableStateV2(),
    pairsTableState: createPlDataTableStateV2(),
    graphState: defaultGraphState(),
    graphStateBeta: defaultGraphState(),
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
        axisX: { cellSize: 20 },
        axisY: { cellSize: 20 },
      },
    },
    frequenciesHeatmapState: defaultFreqHeatmapState(),
    frequenciesHeatmapStateBeta: defaultFreqHeatmapState(),
    alignmentModel: {},
  };
}

export const blockDataModel = new DataModelBuilder({ kind })
  .from<BlockDataV1>("v1")
  // Fires once per project saved under the V1 model. The `name` arg field is
  // intentionally dropped — nothing read it.
  .upgradeLegacy<LegacyBlockArgs, LegacyUiState>(({ args, uiState }) => {
    const d = defaultData();
    return {
      mainRef: args.mainRef,
      cdRef: args.cdRef,
      cdSubsetCol: args.cdSubsetCol,
      pairingMetadataCol: args.pairingMetadataCol,
      covariateRefs: args.covariateRefs ?? [],
      contrastFactor: args.contrastFactor,
      numerators: args.numerators ?? [],
      denominators: args.denominators ?? [],
      findTcrAbPairs: args.findTcrAbPairs ?? d.findTcrAbPairs,
      thresholdCounts: args.thresholdCounts ?? d.thresholdCounts,
      thresholdSamples: args.thresholdSamples ?? d.thresholdSamples,
      log2FcThreshold: args.log2FcThreshold ?? d.log2FcThreshold,
      pAdjThreshold: args.pAdjThreshold ?? d.pAdjThreshold,
      title: uiState?.title ?? d.title,
      selectedChain: uiState?.selectedChain ?? d.selectedChain,
      cdSubsetColValid: uiState?.cdSubsetColValid ?? d.cdSubsetColValid,
      tableState: uiState?.tableState ?? d.tableState,
      tableStateBeta: d.tableStateBeta,
      pairsTableState: uiState?.pairsTableState ?? d.pairsTableState,
      graphState: uiState?.graphState ?? d.graphState,
      graphStateBeta: d.graphStateBeta,
      pairsHeatmapState: uiState?.pairsHeatmapState ?? d.pairsHeatmapState,
      frequenciesHeatmapState: uiState?.frequenciesHeatmapState ?? d.frequenciesHeatmapState,
      frequenciesHeatmapStateBeta: d.frequenciesHeatmapStateBeta,
      alignmentModel: uiState?.alignmentModel ?? d.alignmentModel,
    };
  })
  // v2: split the main table's state per chain. Existing data has only
  // `tableState` (shared); give it a fresh `tableStateBeta`.
  .migrate<BlockDataV2>("v2", (prev) => ({
    ...prev,
    tableStateBeta: prev.tableStateBeta ?? createPlDataTableStateV2(),
  }))
  // v3: split the volcano and enriched-clonotypes-heatmap states per chain.
  // Sharing one state across chains broke when a user's custom data-mapping
  // referenced a column absent in the other chain ("inconsistent" on switch).
  .migrate<BlockDataV3>("v3", (prev) => ({
    ...prev,
    graphStateBeta: prev.graphStateBeta ?? defaultGraphState(),
    frequenciesHeatmapStateBeta: prev.frequenciesHeatmapStateBeta ?? defaultFreqHeatmapState(),
  }))
  // v4: graph-maker 1.9 — let the regulation-direction palette seed both
  // volcanos' grouping colors.
  .migrate<BlockDataV4>("v4", (prev) => ({
    ...prev,
    graphState: withGroupingColorsReseeded(prev.graphState),
    graphStateBeta: withGroupingColorsReseeded(prev.graphStateBeta),
  }))
  // v5: columns become result-pool ids, the compared groups column value ids.
  .migrate<BlockData>("v5", toColumnIds)
  // `params` is absent when a block is created by hand rather than from a
  // template, so every field the kind's contract carries falls back to the same
  // default a hand-created block gets. Fields the contract deliberately omits
  // (the CD4/CD8 pair, all view state) are taken from the defaults only.
  .init(({ params }) => {
    const d = defaultData();
    if (params === undefined) return d;
    return {
      ...d,
      title: params.title ?? d.title,
      mainRef: params.mainRef,
      contrastFactor: params.contrastFactor,
      numerators: params.numerators ?? d.numerators,
      denominators: params.denominators ?? d.denominators,
      covariateRefs: params.covariateRefs ?? d.covariateRefs,
      findTcrAbPairs: params.findTcrAbPairs ?? d.findTcrAbPairs,
      pairingMetadataCol: params.pairingMetadataCol,
      thresholdCounts: params.thresholdCounts ?? d.thresholdCounts,
      thresholdSamples: params.thresholdSamples ?? d.thresholdSamples,
      log2FcThreshold: params.log2FcThreshold ?? d.log2FcThreshold,
      pAdjThreshold: params.pAdjThreshold ?? d.pAdjThreshold,
    };
  });
