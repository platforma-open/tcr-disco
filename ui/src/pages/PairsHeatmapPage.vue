<script setup lang="ts">
import type { PredefinedGraphOption } from '@milaboratories/graph-maker';
import { GraphMaker } from '@milaboratories/graph-maker';
import '@milaboratories/graph-maker/styles';
import type { PColumnIdAndSpec } from '@platforma-sdk/model';
import { computed } from 'vue';
import { useApp } from '../app';

const app = useApp();

function getIndex(name: string, pcols: PColumnIdAndSpec[]): number {
  return pcols.findIndex((p) => p.spec.name === name);
}

const defaultOptions = computed((): PredefinedGraphOption<'heatmap'>[] | undefined => {
  if (!app.model.outputs.pairsHeatmapPcols) {
    return undefined;
  }

  const pcols = app.model.outputs.pairsHeatmapPcols;
  const estimateIndex = getIndex('pl7.app/differentialTCRAbundance/estimate', pcols);
  // const cdr3AlphaIndex = getIndex('pl7.app/differentialTCRAbundance/tra_CDR3aa', pcols);
  // const cdr3BetaIndex = getIndex('pl7.app/differentialTCRAbundance/trb_CDR3aa', pcols);

  if (estimateIndex === -1 || !pcols[estimateIndex]?.spec.axesSpec) {
    return undefined;
  }

  const estimateSpec = pcols[estimateIndex].spec;
  const axesSpec = estimateSpec.axesSpec;

  const defaults: PredefinedGraphOption<'heatmap'>[] = [
    {
      inputName: 'value',
      selectedSource: estimateSpec,
    },
    // { // second X value, CDR3 aa
    //   inputName: 'x',
    //   selectedSource: pcols[cdr3BetaIndex].spec,
    // },
    {
      inputName: 'x',
      selectedSource: axesSpec[1],
    },
    // { // second Y value, CDR3 aa
    //   inputName: 'y',
    //   selectedSource: pcols[cdr3AlphaIndex].spec,
    // },
    {
      inputName: 'y',
      selectedSource: axesSpec[2],
    },
    {
      inputName: 'tabBy',
      selectedSource: axesSpec[0],
    },
  ];

  return defaults;
});

const key = computed(() => (defaultOptions.value ? JSON.stringify(defaultOptions.value) : ''));
</script>

<template>
  <GraphMaker
    :key="key"
    v-model="app.model.ui.pairsHeatmapState"
    chartType="heatmap"
    :p-frame="app.model.outputs.pairsHeatmapPf"
    :default-options="defaultOptions"
  />
</template>
