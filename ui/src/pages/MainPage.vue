<script setup lang="ts">
import type { PlRef } from '@platforma-sdk/model';
import { plRefsEqual } from '@platforma-sdk/model';
import {
  PlAgDataTableV2,
  PlBlockPage,
  PlBtnGhost,
  PlDropdown,
  PlDropdownRef,
  PlMaskIcon24,
  PlSlideModal,
  usePlDataTableSettingsV2,
} from '@platforma-sdk/ui-vue';
import { computed, ref } from 'vue';
import { useApp } from '../app';

const app = useApp();

const settingsAreShown = ref(false);
const showSettings = () => {
  settingsAreShown.value = true;
};

const tableSettings = usePlDataTableSettingsV2({
  model: () => app.model.outputs.pt,
  sheets: () => app.model.outputs.sheets,
});

// Update page title by dataset
function setInput(inputRef?: PlRef) {
  app.model.args.mainRef = inputRef;
  if (inputRef) {
    const mainLabel = app.model.outputs.inputOptions?.find((o) => plRefsEqual(o.ref, inputRef))?.label;
    if (mainLabel)
      app.model.ui.title = 'TCR Disco Enrichment - ' + mainLabel;
  }
}

const metadataOptions = computed(() => {
  return app.model.outputs.metadataOptions?.map((v: { ref: PlRef; label: string }) => ({
    value: v.label,
    label: v.label,
  })) ?? [];
});

</script>

<template>
  <PlBlockPage>
    <template #title>{{ app.model.ui.title }}</template>
    <template #append>
      <PlBtnGhost @click.stop="showSettings">
        Settings
        <template #append>
          <PlMaskIcon24 name="settings" />
        </template>
      </PlBtnGhost>
    </template>

    <PlAgDataTableV2
      v-model="app.model.ui.tableState"
      :settings="tableSettings"
      not-ready-text="Data is not computed"
      show-columns-panel
      show-export-button
    />
  </PlBlockPage>

  <PlSlideModal v-model="settingsAreShown">
    <template #title>Settings</template>
    <PlDropdownRef
      v-model="app.model.args.mainRef"
      :options="app.model.outputs.inputOptions"
      label="Select main dataset" clearable required
      @update:model-value="setInput"
    />

    <PlDropdownRef
      v-model="app.model.args.cdRef"
      :options="app.model.outputs.inputOptions"
      label="Select CD4/8 dataset (optional)"
      clearable
    />

    <PlDropdown
      v-if="app.model.args.cdRef"
      v-model="app.model.args.cdSubsetCol"
      :options="metadataOptions"
      label="Metadata column with CD4/8 information"
      clearable
    />
  </PlSlideModal>
</template>
