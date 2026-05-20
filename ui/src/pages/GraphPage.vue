<script setup lang="ts">
import type { PredefinedGraphOption } from '@milaboratories/graph-maker';
import { GraphMaker } from '@milaboratories/graph-maker';
import { PlMultiSequenceAlignment } from '@milaboratories/multi-sequence-alignment';
import type { PColumnIdAndSpec, PlSelectionModel } from '@platforma-sdk/model';
import { PlBtnGhost, PlSlideModal, PlTabs } from '@platforma-sdk/ui-vue';
import { computed, ref } from 'vue';
import { useApp } from '../app';
import { isSequenceColumn } from '../util';

const app = useApp();

const multipleSequenceAlignmentOpen = ref(false);

function getIndex(name: string, pcols: PColumnIdAndSpec[]): number {
  return pcols.findIndex((p) => p.spec.name === name);
}

// Find out data type - should be differentialTCRAbundance
const dataType = 'differentialTCRAbundance';

function getDefaultOptions(topTablePcols?: PColumnIdAndSpec[]) {
  if (!topTablePcols) {
    return undefined;
  }

  const defaults: PredefinedGraphOption<'scatterplot-umap'>[] = [
    {
      inputName: 'x',
      selectedSource: topTablePcols[getIndex('pl7.app/' + dataType + '/log2foldchange',
        topTablePcols)].spec,
    },
    {
      inputName: 'y',
      selectedSource: topTablePcols[getIndex('pl7.app/' + dataType + '/minlog10padj',
        topTablePcols)].spec,
    },
    {
      inputName: 'grouping',
      selectedSource: topTablePcols[getIndex('pl7.app/' + dataType + '/regulationDirection',
        topTablePcols)].spec,
    },
    // Contrast
    {
      inputName: 'tabBy',
      selectedSource: topTablePcols[getIndex('pl7.app/' + dataType + '/log2foldchange',
        topTablePcols)].spec.axesSpec[0],
    },
    // CDR3 aa
    {
      inputName: 'tooltipContent',
      selectedSource: {
        kind: 'PColumn',
        name: 'pl7.app/vdj/sequence',
        valueType: 'String',
        axesSpec: [],
        annotations: {
          'pl7.app/label': 'CDR3 aa',
          'pl7.app/vdj/isAssemblingFeature': 'true',
          'pl7.app/vdj/isMainSequence': 'true',
        },
      },
    },
  ];

  return defaults;
}

const defaults = computed(() => getDefaultOptions(app.model.outputs.topTablePcols));
const key = computed(() => (defaults.value ? JSON.stringify(defaults.value) : ''));

const selection = ref<PlSelectionModel>({
  axesSpec: [],
  selectedKeys: [],
});

</script>

<template>
  <GraphMaker
    v-model="app.model.data.graphState"
    v-model:selection="selection"
    :data-state-key="key"
    chartType="scatterplot-umap"
    :p-frame="app.model.outputs.topTablePf"
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
      <PlBtnGhost
        icon="dna"
        @click.stop="() => (multipleSequenceAlignmentOpen = true)"
      >
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
