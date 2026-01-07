<script setup lang="ts">
import type { PlRef } from '@platforma-sdk/model';
import { PFrameImpl, plRefsEqual } from '@platforma-sdk/model';
import {
  PlAccordionSection,
  PlAgDataTableV2,
  PlAlert,
  PlBlockPage,
  PlBtnGhost,
  PlCheckbox,
  PlDropdown,
  PlDropdownMulti,
  PlDropdownRef,
  PlMaskIcon24,
  PlNumberField,
  PlRow,
  PlSlideModal,
  PlTabs,
  PlTooltip,
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

const tableSettings = computed(() => usePlDataTableSettingsV2({
  model: () => app.model.outputs.pt,
  sheets: () => app.model.outputs.sheets,
  filtersConfig: ({ column }) => {
    const columnName = column.spec.name;

    // Filter for log2foldchange columns (>= log2FcThreshold or)
    if (columnName === 'pl7.app/differentialTCRAbundance/log2foldchange') {
      return {
        default: {
          type: 'number_greaterThanOrEqualTo',
          reference: app.model.args.log2FcThreshold,
        },
      };
    }

    // Filter for adjusted p-value columns (<= pAdjThreshold)
    if (columnName === 'pl7.app/differentialTCRAbundance/padj') {
      return {
        default: {
          type: 'number_lessThanOrEqualTo',
          reference: app.model.args.pAdjThreshold,
        },
      };
    }

    if (columnName === 'pl7.app/differentialTCRAbundance/robustEnrichment') {
      return {
        default: {
          type: 'string_equals',
          reference: 'Robust',
        },
      };
    }

    return {};
  },
}).value);

// Update page title by dataset
function setInput(inputRef?: PlRef) {
  app.model.args.mainRef = inputRef;
  if (inputRef) {
    const mainLabel = app.model.outputs.inputOptions?.find((o) => plRefsEqual(o.ref, inputRef))?.label;
    if (mainLabel)
      app.model.ui.title = 'TCR Disco - ' + mainLabel;
  }
}

const metadataOptions = computed(() => {
  return app.model.outputs.metadataOptions?.map((v: { ref: PlRef; label: string }) => ({
    value: v.ref,
    label: v.label,
  })) ?? [];
});

const metadataLabels = computed(() => {
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

// Check CD4/CD8 column selection
// Get all possible numerator/denominator values
const cdValues = useWatchFetch(() => app.model.outputs.cdSubsetOptions, async (pframeHandle) => {
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

  const vals = [...response.values.data].map((v) => ({ value: String(v), label: String(v) }));

  // Check if any of the values are 'CD4' or 'CD8'
  const lowerLabels = vals.map((v) => v.label.toLowerCase());
  app.model.ui.cdSubsetColValid = lowerLabels.some((label) => label == 'cd4' || label == 'cd8');

  // Return all distinct values
  return vals;
});

// Make sure numerator and denominator are reset when contrast factor is changed
watch(() => [app.model.args.contrastFactor], (_) => {
  app.model.args.numerators = [];
  app.model.args.denominators = [];
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
    >
      <template #before-sheets>
        <PlTabs
          v-model="app.model.ui.selectedChain"
          :options="[
            { value: 'alpha', label: 'TCR Alpha Chain' },
            { value: 'beta', label: 'TCR Beta Chain' },
          ]"
          :top-line="false"
        />
      </template>
    </PlAgDataTableV2>
  </PlBlockPage>

  <PlSlideModal v-model="settingsAreShown">
    <template #title>Settings</template>
    <PlDropdownRef
      v-model="app.model.args.mainRef"
      :options="app.model.outputs.inputOptions"
      label="Select main dataset" clearable required
      @update:model-value="setInput"
    >
      <template #tooltip>
        Select the main dataset containing TCR alpha and beta chain clonotype counts for differential abundance analysis.
      </template>
    </PlDropdownRef>
    <PlDropdownMulti
      v-model="app.model.args.covariateRefs"
      :options="metadataOptions"
      label="Design"
      required
    >
      <template #tooltip>
        Select the metadata columns that describe your experimental design. These columns will be used to build the statistical model for differential abundance analysis. Examples include: Condition, Treatment, Replicate, Batch, or any other experimental variables that may affect clonotype abundance.
      </template>
    </PlDropdownMulti>
    <PlDropdown
      v-model="app.model.args.contrastFactor"
      :options="contrastFactorOptions"
      label="Contrast factor"
      required
    >
      <template #tooltip>
        Select the metadata column that defines the experimental groups you want to compare. The analysis will identify clonotypes that are differentially abundant between groups defined by this column.
      </template>
    </PlDropdown>
    <PlDropdownMulti
      v-model="app.model.args.numerators" :options="numeratorOptions.value"
      label="Numerator" required
    >
      <template #tooltip>
        Select one or more experimental conditions to compare against the baseline (denominator).
      </template>
    </PlDropdownMulti>
    <PlDropdownMulti
      v-model="app.model.args.denominators"
      :options="numeratorOptions.value"
      label="Denominator/s"
      required
    >
      <template #tooltip>
        Select the control or baseline condition that will serve as the reference for comparison.
        If multiple denominators are selected, only clonotypes that are differentially enriched for each numerator when compared individually against all selected denominators (excluding cases where the numerator matches the denominator) will be considered as enriched.
      </template>
    </PlDropdownMulti>
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
            Set the minimum log2 fold change threshold (keep ≥ log2(FC)) and the maximum adjusted p-value threshold (keep ≤ adjusted p-value) for identifying significantly enriched or depleted clonotypes.
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
          label="Min UMI counts"
          :minValue="0"
          :step="1"
          placeholder="0"
        >
          <template #tooltip>
            A clonotype must have at least "Min counts" in at least "Min (numerator) replicates" to be accepted as significantly enriched.
          </template>
        </PlNumberField>
        <PlNumberField
          v-model="app.model.args.thresholdSamples"
          label="Min replicates"
          :minValue="0"
          :step="1"
          placeholder="0"
        />
      </PlRow>
    </PlAccordionSection>
    <PlCheckbox v-model="app.model.args.findTcrAbPairs">
      Find TCR A/B pairs
      <PlTooltip class="info">
        <template #tooltip>
          When enabled, the analysis will identify paired TCR alpha and beta chains by correlating the frequencies of differentially enriched clonotypes across matching samples. Only clonotypes that show positive correlation in their enrichment patterns will be considered
        </template>
      </PlTooltip>
    </PlCheckbox>
    <PlDropdown
      v-if="!app.model.outputs.barcodeColPresent && app.model.args.findTcrAbPairs"
      v-model="app.model.args.pairingMetadataCol"
      :options="metadataLabels"
      label="Pairing metadata column"
      clearable
    >
      <template #tooltip>
        Select the metadata column that will be used to match samples between alpha and beta chains for pairing analysis. This column should contain values that uniquely identify matching samples across both chains.
      </template>
    </PlDropdown>
    <!-- Content hidden until you click -->
    <PlAccordionSection label="CD4/8 subset assignment">
      <PlDropdownRef
        v-model="app.model.args.cdRef"
        :options="app.model.outputs.inputOptions"
        label="Select CD4/8 dataset (optional)"
        clearable
      >
        <template #tooltip>
          Optionally select a dataset that contains CD4/CD8 cell subset information. If provided, clonotypes from the main dataset will be assigned to either CD4+ or CD8+ T cell subsets based on this dataset.
        </template>
      </PlDropdownRef>
      <PlDropdown
        v-if="app.model.args.cdRef"
        v-model="app.model.args.cdSubsetCol"
        :options="metadataOptions"
        label="CD4/8 metadata column"
        clearable
      >
        <template #tooltip>
          Select the metadata column from the CD4/8 dataset that contains the cell subset labels. This column must contain values that include "CD4" or "CD8" (case-insensitive) to identify CD4+ and CD8+ T cell subsets. The analysis will use this information to assign clonotypes from the main dataset to the appropriate T cell subset based on matching clonotypes.
        </template>
      </PlDropdown>
      <PlAlert v-if="!app.model.ui.cdSubsetColValid && app.model.args.cdRef && app.model.args.cdSubsetCol && cdValues.value" type="warn">
        {{ "Warning: The selected column doen't have any CD4 or CD8 values. please choose a column that has.\
        First 5 values are: " + cdValues.value?.slice(0, 5).map((v) => v.label).join(', ') }}
      </PlAlert>
    </PlAccordionSection>
  </PlSlideModal>
</template>
