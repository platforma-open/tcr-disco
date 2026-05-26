<script setup lang="ts">
import type { PredefinedGraphOption } from '@milaboratories/graph-maker';
import { GraphMaker } from '@milaboratories/graph-maker';
import type { PColumnIdAndSpec } from '@platforma-sdk/model';
import { plRefsEqual } from '@platforma-sdk/model';
import { PlTabs } from '@platforma-sdk/ui-vue';
import { computed } from 'vue';
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

  if (fractionIndex === -1 || cdr3Index === -1 || !contrastFactorLabel || contrastIndex === -1 || !pcols[fractionIndex]?.spec.axesSpec) {
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

  // Add filters for the contrast values that have been selected
  const contrastValues = [...app.model.args.numerators, ...app.model.args.denominators];
  if (contrastValues.length > 0) {
    defaults.push({
      inputName: 'filters',
      selectedSource: pcols[contrastIndex].spec,
      filterType: 'equals',
      selectedFilterValues: contrastValues,
    });
  }

  const robustAnyIndex = getIndex('pl7.app/differentialTCRAbundance/robustEnrichment', pcols);
  if (robustAnyIndex !== -1) {
    defaults.push({
      inputName: 'filters',
      selectedSource: pcols[robustAnyIndex].spec,
      filterType: 'equals',
      selectedFilterValues: ['Robust'],
    });
  }

  return defaults;
});

// Stable across remounts: changes only when block args change the default
// filters. The previous `JSON.stringify(defaultOptions)` key flickered
// between renders (PColumn spec key ordering isn't guaranteed in JSON), so
// GraphMaker treated every nav as a data-identity change and reset the
// saved filters in uiState back to defaults.
const key = computed(() => [
  app.model.ui.selectedChain ?? 'alpha',
  (app.model.args.numerators ?? []).join(','),
  (app.model.args.denominators ?? []).join(','),
].join('|'));

</script>

<template>
  <GraphMaker
    v-model="app.model.ui.frequenciesHeatmapState"
    chartType="heatmap"
    :data-state-key="key"
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
