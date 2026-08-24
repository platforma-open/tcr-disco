<script setup lang="ts">
import type { PredefinedGraphOption } from "@milaboratories/graph-maker";
import { GraphMaker } from "@milaboratories/graph-maker";
import { PlMultiSequenceAlignment } from "@milaboratories/multi-sequence-alignment";
import type { PColumnIdAndSpec, PlSelectionModel } from "@platforma-sdk/model";
import { PlBtnGhost, PlSlideModal, PlTabs } from "@platforma-sdk/ui-vue";
import { computed, ref } from "vue";
import { useApp } from "../app";
import { isSequenceColumn } from "../util";

const app = useApp();

const multipleSequenceAlignmentOpen = ref(false);

function getIndex(name: string, pcols: PColumnIdAndSpec[]): number {
  return pcols.findIndex((p) => p.spec.name === name);
}

// Find out data type - should be differentialTCRAbundance
const dataType = "differentialTCRAbundance";

function getDefaultOptions(topTablePcols?: PColumnIdAndSpec[]) {
  if (!topTablePcols) {
    return undefined;
  }

  const defaults: PredefinedGraphOption<"scatterplot-umap">[] = [
    {
      inputName: "x",
      selectedSource:
        topTablePcols[getIndex("pl7.app/" + dataType + "/log2foldchange", topTablePcols)].spec,
    },
    {
      inputName: "y",
      selectedSource:
        topTablePcols[getIndex("pl7.app/" + dataType + "/minlog10padj", topTablePcols)].spec,
    },
    {
      inputName: "grouping",
      selectedSource:
        topTablePcols[getIndex("pl7.app/" + dataType + "/regulationDirection", topTablePcols)].spec,
    },
    // Contrast
    {
      inputName: "tabBy",
      selectedSource:
        topTablePcols[getIndex("pl7.app/" + dataType + "/log2foldchange", topTablePcols)].spec
          .axesSpec[0],
    },
    // CDR3 aa
    {
      inputName: "tooltipContent",
      selectedSource: {
        kind: "PColumn",
        name: "pl7.app/vdj/sequence",
        valueType: "String",
        axesSpec: [],
        annotations: {
          "pl7.app/label": "CDR3 aa",
          "pl7.app/vdj/isAssemblingFeature": "true",
          "pl7.app/vdj/isMainSequence": "true",
        },
      },
    },
  ];

  return defaults;
}

// Both chains' pcols/pFrames are precomputed in the model; pick the active ones
// so a chain switch reads cached, chain-consistent data (no async recompute that
// would briefly leave the remounted chart with the other chain's default options).
const chain = computed(() => app.model.data.selectedChain ?? "alpha");
const topTablePcols = computed(() => app.model.outputs.topTablePcols?.[chain.value]);
const topTablePf = computed(() =>
  chain.value === "beta" ? app.model.outputs.topTablePfBeta : app.model.outputs.topTablePfAlpha,
);
const defaults = computed(() => getDefaultOptions(topTablePcols.value));

// Per-chain chart state: alpha and beta keep independent objects so a custom
// data-mapping on one chain can't reference the other chain's columns. The chart
// is remounted on chain switch (`:key` below) so its store re-reads this state.
const currentGraphState = computed({
  get: () =>
    app.model.data.selectedChain === "beta"
      ? app.model.data.graphStateBeta
      : app.model.data.graphState,
  set: (value) => {
    if (app.model.data.selectedChain === "beta") app.model.data.graphStateBeta = value;
    else app.model.data.graphState = value;
  },
});

const selection = ref<PlSelectionModel>({
  axesSpec: [],
  selectedKeys: [],
});
</script>

<template>
  <GraphMaker
    :key="app.model.data.selectedChain ?? 'alpha'"
    v-model="currentGraphState"
    v-model:selection="selection"
    chartType="scatterplot-umap"
    :p-frame="topTablePf"
    :default-options="defaults"
  >
    <template #titleLineSlot>
      <PlTabs
        v-model="app.model.data.selectedChain"
        :options="[
          { value: 'alpha', label: 'TCR Alpha Chain' },
          { value: 'beta', label: 'TCR Beta Chain' },
        ]"
        :top-line="false"
      />
      <PlBtnGhost icon="dna" @click.stop="() => (multipleSequenceAlignmentOpen = true)">
        Multiple Sequence Alignment
      </PlBtnGhost>
    </template>
  </GraphMaker>
  <PlSlideModal
    v-model="multipleSequenceAlignmentOpen"
    width="100%"
    :close-on-outside-click="false"
  >
    <template #title>Multiple Sequence Alignment</template>
    <PlMultiSequenceAlignment
      v-model="app.model.data.alignmentModel"
      :sequence-column-predicate="isSequenceColumn"
      :p-frame="app.model.outputs.msaPf"
      :selection="selection"
    />
  </PlSlideModal>
</template>
