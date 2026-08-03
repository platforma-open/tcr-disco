import type { GraphMakerState } from "@milaboratories/graph-maker";
import type {
  PlDataTableStateV2,
  PlMultiSequenceAlignmentModel,
  PlRef,
} from "@platforma-sdk/model";

// Unified V3 block data: everything the user can edit, shaped on the UI's terms.
// Analysis fields are projected into `args` (index.ts); UI state below stays
// unprojected in `data`.
export type BlockData = {
  // --- analysis decisions (projected into args) ---
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

  // --- UI-only state (never projected) ---
  title?: string;
  selectedChain?: "alpha" | "beta";
  // Whether the chosen cdSubsetCol contains CD4/CD8 values. Snapshotted by the
  // UI on the user's cdSubsetCol selection (async unique-values fetch), then
  // read by the args validation. See ui/src/pages/MainPage.vue.
  cdSubsetColValid: boolean;
  // Per-chain table state. The main table's columns (and thus the default-filter
  // column ids) differ between topDegPFAlpha and topDegPFBeta, so alpha and beta
  // must not share one state — otherwise switching chains leaves a chain's filter
  // ids referencing the other chain's columns ("Inconsistent value").
  tableState: PlDataTableStateV2;
  tableStateBeta: PlDataTableStateV2;
  pairsTableState: PlDataTableStateV2;
  // Per-chain volcano and enriched-clonotypes-heatmap state. alpha and beta must
  // not share one object: a user's custom data-mapping can reference a column
  // present in one chain's pFrame but not the other's, which reads as
  // "inconsistent" after switching. The UI routes v-model by selectedChain and
  // remounts the chart on switch (see GraphPage / FrequenciesHeatmapPage).
  graphState: GraphMakerState;
  graphStateBeta: GraphMakerState;
  pairsHeatmapState: GraphMakerState;
  frequenciesHeatmapState: GraphMakerState;
  frequenciesHeatmapStateBeta: GraphMakerState;
  alignmentModel: PlMultiSequenceAlignmentModel;
};

// The shape the workflow consumes — analysis fields only (no UI state).
export type BlockArgs = {
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

// V1 on-disk shapes, consumed once by `upgradeLegacy` in dataModel.ts. These
// mirror the pre-V3 `.withArgs` / `.withUiState` types verbatim, including the
// now-dropped `name` field so legacy state parses cleanly.
export type LegacyBlockArgs = {
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

export type LegacyUiState = {
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
