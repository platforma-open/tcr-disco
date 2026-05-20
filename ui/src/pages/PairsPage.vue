<script setup lang="ts">
import { PlAgDataTableV2, PlBlockPage, usePlDataTableSettingsV2 } from '@platforma-sdk/ui-vue';
import { computed } from 'vue';
import { useApp } from '../app';

const app = useApp();

const tableSettings = computed(() => usePlDataTableSettingsV2({
  model: () => app.model.outputs.pairsPt,
  sheets: () => app.model.outputs.pairsSheets,
}).value);

</script>

<template>
  <PlBlockPage>
    <template #title>TCR AB Pairs</template>
    <PlAgDataTableV2
      v-model="app.model.ui.pairsTableState"
      :settings="tableSettings"
      not-ready-text="Data is not computed"
      show-columns-panel
      show-export-button
      no-rows-text="No significant TCR A/B pairs"
    />
  </PlBlockPage>
</template>
