<script setup lang="ts">
import type { PredefinedGraphOption } from '@milaboratories/graph-maker';
import { GraphMaker } from '@milaboratories/graph-maker';
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
  const cdr3AlphaIndex = pcols.findIndex((p) => p.spec.domain?.['pl7.app/vdj/feature'] === 'CDR3'
    && p.spec.axesSpec[0].domain?.['pl7.app/vdj/chain'] === 'TCRAlpha');
  const cdr3BetaIndex = pcols.findIndex((p) => p.spec.domain?.['pl7.app/vdj/feature'] === 'CDR3'
    && p.spec.axesSpec[0].domain?.['pl7.app/vdj/chain'] === 'TCRBeta');
  const padjustedIndex = getIndex('pl7.app/differentialTCRAbundance/padj', pcols);

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
    {
      inputName: 'x',
      selectedSource: axesSpec[1],
    },
    { // second X value, CDR3 aa
      inputName: 'x',
      selectedSource: pcols[cdr3AlphaIndex].spec,
    },
    {
      inputName: 'y',
      selectedSource: axesSpec[2],
    },
    { // second Y value, CDR3 aa
      inputName: 'y',
      selectedSource: pcols[cdr3BetaIndex].spec,
    },
    {
      inputName: 'tabBy',
      selectedSource: axesSpec[0],
    },
    {
      inputName: 'filters',
      selectedSource: pcols[padjustedIndex].spec,
      selectedFilterRange: {
        max: 0.05,
      },
    },
  ];

  return defaults;
});

// PairsHeatmap binds the stable key to Vue's `:key` attribute, not
// GraphMaker's `:data-state-key` prop. Tested both: `:data-state-key`
// here resets the saved filters in uiState to defaults on every nav;
// `:key` preserves them. Same pattern in FrequenciesHeatmapPage. Don't
// switch back without re-testing the nav flow manually.
//
// Mechanism. `:data-state-key` is GraphMaker's invalidation signal —
// when the prop differs from what GraphMaker stored, it overwrites
// v-model with defaults. Vue's `:key` only controls component
// identity — when it changes, Vue creates a new GraphMaker which
// reads from v-model and inherits the saved filters. When the key
// can't be made perfectly stable across mount cycles, recreate is
// safer than invalidate.
//
// Key composed from primitives only. Adding ref identities
// (mainRef/contrastFactor) made the key flicker during initial mount
// when args briefly resolve from undefined to their real values,
// which re-triggers the reset.
const key = computed(() => [
  (app.model.args.numerators ?? []).join(','),
  (app.model.args.denominators ?? []).join(','),
].join('|'));
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
