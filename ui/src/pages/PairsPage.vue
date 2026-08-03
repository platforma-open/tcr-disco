<script setup lang="ts">
import { PlAgDataTableV2, PlBlockPage, usePlDataTableSettingsV2 } from "@platforma-sdk/ui-vue";
import { useApp } from "../app";

const app = useApp();

// Instantiate the settings composable once (see MainPage for the why): wrapping
// it in `computed(() => …().value)` re-instantiates it every tick and drives the
// non-converging table recompute loop on the latest SDK.
const tableSettings = usePlDataTableSettingsV2({
  model: () => app.model.outputs.pairsPt,
  sheets: () => app.model.outputs.pairsSheets,
});
</script>

<template>
  <PlBlockPage>
    <template #title>TCR AB Pairs</template>
    <PlAgDataTableV2
      v-model="app.model.data.pairsTableState"
      :settings="tableSettings"
      not-ready-text="Data is not computed"
      show-columns-panel
      show-export-button
      no-rows-text="No significant TCR A/B pairs"
    />
  </PlBlockPage>
</template>
