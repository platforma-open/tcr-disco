<script setup lang="ts">
import type { PredefinedGraphOption } from '@milaboratories/graph-maker';
import { GraphMaker } from '@milaboratories/graph-maker';
import '@milaboratories/graph-maker/styles';
import type { PColumnIdAndSpec, PlSelectionModel } from '@platforma-sdk/model';
import { PlBtnGroup, PlMultiSequenceAlignment, PlSlideModal } from '@platforma-sdk/ui-vue';
import { computed, ref, watch } from 'vue';
import { useApp } from '../app';
import {
  isSequenceColumn,
} from '../util';

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
    // // Clonotype ID
    // {
    //   inputName: 'tooltipContent',
    //   selectedSource: topTablePcols[getIndex('pl7.app/' + dataType + '/log2foldchange',
    //     topTablePcols)].spec.axesSpec[1],
    // },
  ];

  return defaults;
}

const defaults = computed(() => getDefaultOptions(app.model.outputs.topTablePcols));
const key = computed(() => (defaults.value ? JSON.stringify(defaults.value) : ''));

// Reset graph maker state when chain selection changes
watch(() => app.model.ui.selectedChain, (_) => {
  delete app.model.ui.graphState.optionsState;
}, { deep: false, immediate: false });

const selection = ref<PlSelectionModel>({
  axesSpec: [],
  selectedKeys: [],
});

</script>

<template>
  <GraphMaker
    :key="key"
    v-model="app.model.ui.graphState"
    v-model:selection="selection"
    :data-state-key="app.model.args.mainRef"
    chartType="scatterplot-umap"
    :p-frame="app.model.outputs.topTablePf"
    :default-options="defaults"
  >
    <template #titleLineSlot>
      <PlBtnGroup
        v-model="app.model.ui.selectedChain"
        :options="[
          { value: 'alpha', label: 'TCR Alpha Chain' },
          { value: 'beta', label: 'TCR Beta Chain' },
        ]"
      />
      <!-- <PlBtnGhost
        icon="dna"
        @click.stop="() => (multipleSequenceAlignmentOpen = true)"
      >
        Multiple Sequence Alignment
      </PlBtnGhost> -->
    </template>
  </GraphMaker>
  <PlSlideModal
    v-model="multipleSequenceAlignmentOpen"
    width="100%"
    :close-on-outside-click="false"
  >
    <template #title>Multiple Sequence Alignment</template>
    <PlMultiSequenceAlignment
      v-model="app.model.ui.alignmentModel"
      :sequence-column-predicate="isSequenceColumn"
      :p-frame="app.model.outputs.msaPf"
      :selection="selection"
    />
  </PlSlideModal>
</template>
