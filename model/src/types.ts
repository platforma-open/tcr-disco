import type { GraphMakerState } from "@milaboratories/graph-maker";
import type {
  ColumnUniversalId,
  ColumnValueId,
  PlDataTableStateV2,
  PlMultiSequenceAlignmentModel,
  PlRef,
} from "@platforma-sdk/model";

// Unified V3 block data: everything the user can edit, shaped on the UI's terms.
// Analysis fields are projected into `args` (index.ts); UI state below stays
// unprojected in `data`. Columns are result-pool column ids; the compared groups
// (`numerators`, `denominators`) are column value ids of the contrast factor column.
export type BlockData = {
  // --- analysis decisions (projected into args) ---
  mainRef?: ColumnUniversalId;
  cdRef?: ColumnUniversalId;
  cdSubsetCol?: ColumnUniversalId;
  pairingMetadataCol?: ColumnUniversalId;
  covariateRefs: ColumnUniversalId[];
  contrastFactor?: ColumnUniversalId;
  numerators: ColumnValueId[];
  denominators: ColumnValueId[];
  findTcrAbPairs: boolean;
  // A cleared PlNumberField writes `undefined`, so these hold no value mid-edit.
  // The args lambda refuses that (Run disabled); the workflow only ever sees numbers.
  thresholdCounts: number | undefined;
  thresholdSamples: number | undefined;
  log2FcThreshold: number | undefined;
  pAdjThreshold: number | undefined;

  // --- UI-only state (never projected) ---
  title?: string;
  selectedChain?: "alpha" | "beta";
  // Whether the chosen cdSubsetCol contains CD4/CD8 values. Snapshotted by the
  // UI on the user's cdSubsetCol selection from the model's check of the column's
  // values, then read by the args validation. See ui/src/pages/MainPage.vue.
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
  mainRef?: ColumnUniversalId;
  cdRef?: ColumnUniversalId;
  cdSubsetCol?: ColumnUniversalId;
  pairingMetadataCol?: ColumnUniversalId;
  covariateRefs: ColumnUniversalId[];
  contrastFactor?: ColumnUniversalId;
  numerators: ColumnValueId[];
  denominators: ColumnValueId[];
  findTcrAbPairs: boolean;
  thresholdCounts: number;
  thresholdSamples: number;
  log2FcThreshold: number;
  pAdjThreshold: number;
};

// Data as stored at version "v1", frozen snapshot: columns as refs to upstream
// outputs, compared groups as plain values of the contrast factor column, the
// pairing column as the label of a metadata column. The per-chain states of
// later versions are present only when `upgradeLegacy` wrote them.
export type BlockDataV1 = {
  mainRef?: PlRef;
  cdRef?: PlRef;
  cdSubsetCol?: PlRef;
  pairingMetadataCol?: string;
  covariateRefs: PlRef[];
  contrastFactor?: PlRef;
  numerators: string[];
  denominators: string[];
  findTcrAbPairs: boolean;
  thresholdCounts: number | undefined;
  thresholdSamples: number | undefined;
  log2FcThreshold: number | undefined;
  pAdjThreshold: number | undefined;
  title?: string;
  selectedChain?: "alpha" | "beta";
  cdSubsetColValid: boolean;
  tableState: PlDataTableStateV2;
  tableStateBeta?: PlDataTableStateV2;
  pairsTableState: PlDataTableStateV2;
  graphState: GraphMakerState;
  graphStateBeta?: GraphMakerState;
  pairsHeatmapState: GraphMakerState;
  frequenciesHeatmapState: GraphMakerState;
  frequenciesHeatmapStateBeta?: GraphMakerState;
  alignmentModel: PlMultiSequenceAlignmentModel;
};

// Data as stored at version "v2": the main table's state is split per chain.
export type BlockDataV2 = Omit<BlockDataV1, "tableStateBeta"> & {
  tableStateBeta: PlDataTableStateV2;
};

// Data as stored at version "v3": the volcano and heatmap states are split per chain.
export type BlockDataV3 = Omit<BlockDataV2, "graphStateBeta" | "frequenciesHeatmapStateBeta"> & {
  graphStateBeta: GraphMakerState;
  frequenciesHeatmapStateBeta: GraphMakerState;
};

// Data as stored at version "v4": the same shape, with the volcano colors reseeded.
export type BlockDataV4 = BlockDataV3;

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
