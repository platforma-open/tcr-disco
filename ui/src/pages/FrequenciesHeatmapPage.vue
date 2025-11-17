<script setup lang="ts">
import type { PredefinedGraphOption } from '@milaboratories/graph-maker';
import { GraphMaker } from '@milaboratories/graph-maker';
import '@milaboratories/graph-maker/styles';
import type { PColumnIdAndSpec } from '@platforma-sdk/model';
import { PlBtnGroup } from '@platforma-sdk/ui-vue';
import { computed, watch } from 'vue';
import { useApp } from '../app';

const app = useApp();

function getIndex(name: string, pcols: PColumnIdAndSpec[]): number {
  return pcols.findIndex((p) => p.spec.name === name);
}

const defaultOptions = computed((): PredefinedGraphOption<'heatmap'>[] | undefined => {
  if (!app.model.outputs.frequenciesHeatmapPcols) {
    return undefined;
  }

  const pcols = app.model.outputs.frequenciesHeatmapPcols;
  const fractionIndex = getIndex('pl7.app/differentialTCRAbundance/countFraction', pcols);

  if (fractionIndex === -1 || !pcols[fractionIndex]?.spec.axesSpec) {
    return undefined;
  }

  const fractionSpec = pcols[fractionIndex].spec;
  const axesSpec = fractionSpec.axesSpec;

  const defaults: PredefinedGraphOption<'heatmap'>[] = [
    {
      inputName: 'value',
      selectedSource: fractionSpec,
    },
    {
      inputName: 'x',
      selectedSource: axesSpec[0], // internalSampleId
    },
    {
      inputName: 'y',
      selectedSource: axesSpec[1], // clonotypeKey
    },
  ];

  return defaults;
});

const key = computed(() => (defaultOptions.value ? JSON.stringify(defaultOptions.value) : ''));

// Reset graph maker state when chain selection changes
watch(() => app.model.ui.selectedChain, (_) => {
  delete app.model.ui.frequenciesHeatmapState.optionsState;
}, { deep: false, immediate: false });
</script>

<template>
  <GraphMaker
    :key="key"
    v-model="app.model.ui.frequenciesHeatmapState"
    chartType="heatmap"
    :p-frame="app.model.outputs.frequenciesHeatmapPf"
    :default-options="defaultOptions"
  >
    <template #titleLineSlot>
      <PlBtnGroup
        v-model="app.model.ui.selectedChain"
        :options="[
          { value: 'alpha', label: 'TCR Alpha Chain' },
          { value: 'beta', label: 'TCR Beta Chain' },
        ]"
      />
    </template>
  </GraphMaker>
</template>
