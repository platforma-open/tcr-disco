<script setup lang="ts">
import type { PlRef } from '@platforma-sdk/model';
import { PFrameImpl, plRefsEqual } from '@platforma-sdk/model';
import {
  PlAccordionSection,
  PlAgDataTableV2,
  PlBlockPage,
  PlBtnGhost,
  PlBtnGroup,
  PlCheckbox,
  PlDropdown,
  PlDropdownMulti,
  PlDropdownRef,
  PlMaskIcon24,
  PlNumberField,
  PlRow,
  PlSlideModal,
  usePlDataTableSettingsV2,
  useWatchFetch,
} from '@platforma-sdk/ui-vue';
import { computed, ref, watch } from 'vue';
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
    value: v.ref,
    label: v.label,
  })) ?? [];
});

const metadataLabelOptions = computed(() => {
  return app.model.outputs.metadataOptions?.map((v: { ref: PlRef; label: string }) => ({
    value: v.label,
    label: v.label,
  })) ?? [];
});

const contrastFactorOptions = computed(() => {
  return app.model.args.covariateRefs.map((ref) => ({
    value: ref,
    label: metadataOptions.value.find((m) => m.value.name === ref.name)?.label ?? '',
  }));
});

// Get all possible numerator/denominator values
const numeratorOptions = useWatchFetch(() => app.model.outputs.denominatorOptions, async (pframeHandle) => {
  if (!pframeHandle) {
    return undefined;
  }
  // Get ID of first pcolumn in the pframe (the only one we will access)
  const pFrame = new PFrameImpl(pframeHandle);
  const list = await pFrame.listColumns();
  const id = list?.[0].columnId;
  if (!id) {
    return undefined;
  }
  // Get unique values of that first pcolumn
  const response = await pFrame.getUniqueValues({ columnId: id, filters: [], limit: 1000000 });
  if (!response) {
    return undefined;
  }
  return [...response.values.data].map((v) => ({ value: String(v), label: String(v) }));
});

// Only options not selected as numerators[] are accepted as denominator
const denominatorOptions = computed(() => {
  return numeratorOptions.value?.filter((op) =>
    !app.model.args.numerators.includes(op.value));
});

// Make sure numerator and denominator are reset when contrast factor is changed
watch(() => [app.model.args.contrastFactor], (_) => {
  app.model.args.numerators = [];
  app.model.args.denominator = undefined;
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
    <div style="width: fit-content; margin-left: auto">
      <PlBtnGroup
        v-model="app.model.ui.selectedChain"
        :options="[
          { value: 'alpha', label: 'TCR Alpha Chain' },
          { value: 'beta', label: 'TCR Beta Chain' },
        ]"
      />
    </div>

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

    <PlDropdownMulti
      v-model="app.model.args.covariateRefs"
      :options="metadataOptions"
      label="Design"
      required
    />
    <PlDropdown
      v-model="app.model.args.contrastFactor"
      :options="contrastFactorOptions"
      label="Contrast factor"
      required
    />
    <PlDropdownMulti
      v-model="app.model.args.numerators" :options="numeratorOptions.value"
      label="Numerator" required
    >
      <template #tooltip>
        Calculate a contrast per each one of the selected Numerators versus the selected control/baseline
      </template>
    </PlDropdownMulti>
    <PlDropdown
      v-model="app.model.args.denominator"
      :options="denominatorOptions"
      label="Denominator"
      required
    />
    <!-- Content hidden until you click THRESHOLD PARAMETERS -->
    <PlAccordionSection label="THRESHOLD PARAMETERS">
      <PlRow>
        <PlNumberField
          v-model="app.model.args.log2FcThreshold"
          label="Log2(FC)"
          :minValue="0"
          :step="0.1"
        >
          <template #tooltip>
            Select a valid absolute log2(FC) and p-value threshold for identifying
            significantly enriched clonotypes.
          </template>
        </PlNumberField>
        <PlNumberField
          v-model="app.model.args.pAdjThreshold"
          label="Adjusted p-value"
          :minValue="0"
          :maxValue="1"
          :step="0.01"
        />
      </PlRow>
      <PlRow>
        <PlNumberField
          v-model="app.model.args.thresholdCounts"
          label="Minimum counts"
          :minValue="0"
          :step="1"
          placeholder="0"
        >
          <template #tooltip>
            Select a valid minimum number of counts for a clonotype to be considered significant.
            significantly enriched clonotypes.
          </template>
        </PlNumberField>
        <PlNumberField
          v-model="app.model.args.thresholdSamples"
          label="Minimum samples"
          :minValue="0"
          :step="1"
          placeholder="0"
        />
      </PlRow>
    </PlAccordionSection>
    <PlCheckbox v-model="app.model.args.findTcrAbPairs">
      Find TCR AB pairs
      <template #tooltip>
        Correlate clonotype frequencies across matching samples to identify paired alpha-beta TCR chains.
      </template>
    </PlCheckbox>
    <!-- Content hidden until you click -->
    <PlAccordionSection label="CD4/8 subset assignment">
      <PlDropdownRef
        v-model="app.model.args.cdRef"
        :options="app.model.outputs.inputOptions"
        label="Select CD4/8 dataset (optional)"
        clearable
      />
      <PlDropdown
        v-if="app.model.args.cdRef"
        v-model="app.model.args.cdSubsetCol"
        :options="metadataLabelOptions"
        label="Metadata column with CD4/8 information"
        clearable
      >
        <template #tooltip>
          This column is required to subset the main dataset's clonotypes to CD4/8 cells. The column should contain "CD4" or "CD8" values (case-insensitive).
        </template>
      </PlDropdown>
    </PlAccordionSection>
  </PlSlideModal>
</template>
