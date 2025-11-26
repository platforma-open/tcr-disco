<script setup lang="ts">
import type { PredefinedGraphOption } from '@milaboratories/graph-maker';
import { GraphMaker } from '@milaboratories/graph-maker';
import '@milaboratories/graph-maker/styles';
import type { PColumnIdAndSpec } from '@platforma-sdk/model';
import { plRefsEqual } from '@platforma-sdk/model';
import { PlTabs } from '@platforma-sdk/ui-vue';
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

  // Get the label from the contrastFactor PlRef
  const contrastFactorLabel = app.model.args.contrastFactor
    ? app.model.outputs.metadataOptions?.find((opt) =>
      plRefsEqual(opt.ref, app.model.args.contrastFactor!),
    )?.label
    : undefined;

  const contrastIndex = pcols.findIndex((p) => p.spec.name === 'pl7.app/metadata'
    && p.spec.annotations?.['pl7.app/label'] === contrastFactorLabel);
  const subsetIndex = getIndex('pl7.app/differentialTCRAbundance/subset', pcols);
  const cdr3Index = getIndex('pl7.app/vdj/sequence', pcols);

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
    { // first Y value, clonotypeKey
      inputName: 'y',
      selectedSource: axesSpec[1],
    },
    { // second Y value, CDR3 aa
      inputName: 'y',
      selectedSource: pcols[cdr3Index].spec,
    },
    {
      inputName: 'xGroupBy',
      selectedSource: pcols[contrastIndex].spec,
    },
    {
      inputName: 'annotationsX',
      selectedSource: pcols[contrastIndex].spec,
    },
  ];

  if (subsetIndex !== -1) {
    defaults.push({
      inputName: 'annotationsY',
      selectedSource: pcols[subsetIndex].spec,
    });
  }

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
      <PlTabs
        v-model="app.model.ui.selectedChain"
        :options="[
          { value: 'alpha', label: 'TCR Alpha Chain' },
          { value: 'beta', label: 'TCR Beta Chain' },
        ]"
        :top-line="false"
      />
    </template>
  </GraphMaker>
</template>
