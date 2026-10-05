import { kind } from "@platforma-open/milaboratories.tcrdisco-enrichment.kind";
import { createPlDataTableStateV2, DataModelBuilder } from "@platforma-sdk/model";
import type { BlockData, LegacyBlockArgs, LegacyUiState } from "./types";

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
  .from<BlockData>("v1")
  // Fires once per project saved under the V1 model. The `name` arg field is
  // intentionally dropped — nothing read it.
  .upgradeLegacy<LegacyBlockArgs, LegacyUiState>(({ args, uiState }) => {
    const d = defaultData();
    return {
      mainRef: args.mainRef,
      cdRef: args.cdRef,
      cdSubsetCol: args.cdSubsetCol,
      pairingMetadataCol: args.pairingMetadataCol,
      covariateRefs: args.covariateRefs ?? d.covariateRefs,
      contrastFactor: args.contrastFactor,
      numerators: args.numerators ?? d.numerators,
      denominators: args.denominators ?? d.denominators,
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
  .migrate<BlockData>("v2", (prev) => ({
    ...prev,
    tableStateBeta: (prev as Partial<BlockData>).tableStateBeta ?? createPlDataTableStateV2(),
  }))
  // v3: split the volcano and enriched-clonotypes-heatmap states per chain.
  // Sharing one state across chains broke when a user's custom data-mapping
  // referenced a column absent in the other chain ("inconsistent" on switch).
  .migrate<BlockData>("v3", (prev) => ({
    ...prev,
    graphStateBeta: (prev as Partial<BlockData>).graphStateBeta ?? defaultGraphState(),
    frequenciesHeatmapStateBeta:
      (prev as Partial<BlockData>).frequenciesHeatmapStateBeta ?? defaultFreqHeatmapState(),
  }))
  // v4: graph-maker 1.9 — let the regulation-direction palette seed both
  // volcanos' grouping colors.
  .migrate<BlockData>("v4", (prev) => ({
    ...prev,
    graphState: withGroupingColorsReseeded(prev.graphState),
    graphStateBeta: withGroupingColorsReseeded(prev.graphStateBeta),
  }))
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
