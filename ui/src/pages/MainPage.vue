<script setup lang="ts">
import type { ColumnUniversalId } from "@platforma-sdk/model";
import {
  PlAccordionSection,
  PlAgDataTableV2,
  PlAlert,
  PlBlockPage,
  PlBtnGhost,
  PlCheckbox,
  PlDropdown,
  PlDropdownMulti,
  PlIcon24,
  PlNumberField,
  PlRow,
  PlSlideModal,
  PlTabs,
  PlTooltip,
  usePlDataTableSettingsV2,
} from "@platforma-sdk/ui-vue";
import { computed, ref, watch } from "vue";
import { useApp } from "../app";

const app = useApp();

const reportContent = computed(
  () => (app.model.outputs as { reportContent?: string })?.reportContent,
);

const settingsAreShown = ref(false);
const showSettings = () => {
  settingsAreShown.value = true;
};

// Instantiate the settings composable once. It tracks the model/sheets getters
// internally. Wrapping it in a `computed(() => …().value)` re-instantiates it on
// every reactive tick, which churns the table settings and drives a
// non-converging recompute↔"Invalid PTable handle" loop on the latest SDK.
const tableSettings = usePlDataTableSettingsV2({
  model: () => app.model.outputs.pt,
  sheets: () => app.model.outputs.sheets,
});

// The main table is per-chain: alpha and beta have different columns, so their
// grid/filter state must not share one object (else filters carry the wrong
// chain's column ids after switching). Route the v-model to the active chain's
// state.
const currentTableState = computed({
  get: () =>
    app.model.data.selectedChain === "beta"
      ? app.model.data.tableStateBeta
      : app.model.data.tableState,
  set: (value) => {
    if (app.model.data.selectedChain === "beta") app.model.data.tableStateBeta = value;
    else app.model.data.tableState = value;
  },
});

// Update page title by dataset
function setInput(inputRef?: ColumnUniversalId) {
  app.model.data.mainRef = inputRef;
  if (inputRef) {
    const mainLabel = app.model.outputs.inputOptions?.find((o) => o.value === inputRef)?.label;
    if (mainLabel) app.model.data.title = "TCRdisco - " + mainLabel;
  }
}

const metadataOptions = computed(() => app.model.outputs.metadataOptions ?? []);

// CD4/8 dropdown: same options as main, but exclude the main dataset
const cdRefInputOptions = computed(() => {
  const opts = app.model.outputs.inputOptions ?? [];
  const main = app.model.data.mainRef;
  if (!main) return opts;
  return opts.filter((o) => o.value !== main);
});

const contrastFactorOptions = computed(() => {
  return app.model.data.covariateRefs.map((id) => ({
    value: id,
    label: metadataOptions.value.find((m) => m.value === id)?.label ?? "",
  }));
});

/**
 * Values of the contrast factor column, while they describe the contrast factor picked now. The
 * model output follows the pick with a lag; until it catches up the pickers show as loading.
 * A picked value missing from them stays picked and is shown as not available.
 */
const numeratorOptions = computed(() => {
  const output = app.model.outputs.contrastValueOptions;
  const contrastFactor = app.model.data.contrastFactor;
  if (output === undefined || contrastFactor === undefined) return undefined;
  return output.computedFor === contrastFactor ? output.options : undefined;
});

// The model's CD4/8 check of the values of the selected subset column, while it
// describes the column picked now. `undefined` while the values are still loading
// or cannot be read. Read-only derivation (output -> local reactive state), NOT a
// write back to data, so it is not a hairpin — it drives the live UI warning
// below. The authoritative gate value (data.cdSubsetColValid) is snapshotted
// separately, only on user gesture.
const cdSubsetCheck = computed(() => {
  const output = app.model.outputs.cdSubsetCheck;
  const cdSubsetCol = app.model.data.cdSubsetCol;
  if (output === undefined || cdSubsetCol === undefined) return undefined;
  if (output.computedFor !== cdSubsetCol || output.result.type !== "read") return undefined;
  return output.result;
});

// Snapshot the CD4/8 validity into data only in response to the user's column
// selection. Validity comes from the model's check of the column values, which
// lags the selection, so it can't be written synchronously in the gesture
// handler; instead the handler arms `awaitingCdValidation` (per-client, never
// synced) and the watcher below writes once the check for the new column
// arrives. Because the flag is local, only the client that made the selection
// writes — no multi-client write race.
const awaitingCdValidation = ref(false);

function onCdSubsetColChange(id?: ColumnUniversalId) {
  app.model.data.cdSubsetCol = id;
  app.model.data.cdSubsetColValid = false; // close the run gate until re-verified
  awaitingCdValidation.value = id !== undefined;
}

watch(cdSubsetCheck, (check) => {
  if (!awaitingCdValidation.value) return; // only the client that just selected
  if (check === undefined) return; // still loading
  app.model.data.cdSubsetColValid = check.hasSubsets;
  awaitingCdValidation.value = false;
});

// Reset numerator/denominator only when the contrast factor genuinely changes.
// Watch the id directly, NOT a fresh `[...]` wrapper: the array wrapper makes
// Vue's Object.is comparison always report a change, so the callback fired on
// every `data` reconcile/replacement (which V3 does on each sync) — wiping the
// user's selection even when the contrast factor was untouched or undefined.
watch(
  () => app.model.data.contrastFactor,
  () => {
    app.model.data.numerators = [];
    app.model.data.denominators = [];
  },
);

// Clear CD4/8 selection if user sets main dataset to the same as CD4/8
watch(
  () => app.model.data.mainRef,
  (mainRef) => {
    const cdRef = app.model.data.cdRef;
    if (cdRef && mainRef && cdRef === mainRef) {
      app.model.data.cdRef = undefined;
    }
  },
);

const requiredError = (v: number | undefined) =>
  v === undefined ? "Value is required" : undefined;
</script>

<template>
  <PlBlockPage>
    <template #title>{{ app.model.data.title }}</template>
    <template #append>
      <PlBtnGhost @click.stop="showSettings">
        Settings
        <template #append>
          <PlIcon24 name="settings" />
        </template>
      </PlBtnGhost>
    </template>

    <PlAlert v-if="reportContent" type="warn" class="report-warning">
      <span style="white-space: pre-line">{{ reportContent }}</span>
    </PlAlert>
    <!-- Remount the table on chain switch: `currentTableState` swaps
         synchronously but `outputs.pt` (with its chain-specific default filters)
         recomputes async, so reconciling in place leaves stale default-filter
         column ids ("Inconsistent value"). Keying re-inits cleanly, as reopening
         the page does. `selectedChain` is a plain string — no flicker. -->
    <PlAgDataTableV2
      :key="app.model.data.selectedChain ?? 'alpha'"
      v-model="currentTableState"
      :settings="tableSettings"
      not-ready-text="Data is not computed"
      show-columns-panel
      show-export-button
    >
      <template #before-sheets>
        <PlTabs
          v-model="app.model.data.selectedChain"
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
    <PlDropdown
      v-model="app.model.data.mainRef"
      :options="app.model.outputs.inputOptions"
      label="Select main dataset"
      clearable
      required
      @update:model-value="setInput"
    >
      <template #tooltip>
        Select the main dataset containing TCR alpha and beta chain clonotype counts for
        differential abundance analysis.
      </template>
    </PlDropdown>
    <PlDropdownMulti
      v-model="app.model.data.covariateRefs"
      :options="metadataOptions"
      label="Design"
      required
    >
      <template #tooltip>
        Select the metadata columns that describe your experimental design. These columns will be
        used to build the statistical model for differential abundance analysis. Examples include:
        Condition, Treatment, Replicate, Batch, or any other experimental variables that may affect
        clonotype abundance.
      </template>
    </PlDropdownMulti>
    <PlDropdown
      v-model="app.model.data.contrastFactor"
      :options="contrastFactorOptions"
      label="Contrast factor"
      required
    >
      <template #tooltip>
        Select the metadata column that defines the experimental groups you want to compare. The
        analysis will identify clonotypes that are differentially abundant between groups defined by
        this column.
      </template>
    </PlDropdown>
    <PlDropdownMulti
      v-model="app.model.data.numerators"
      :options="numeratorOptions"
      label="Numerator"
      required
    >
      <template #tooltip>
        Select one or more experimental conditions to compare against the baseline (denominator).
      </template>
    </PlDropdownMulti>
    <PlDropdownMulti
      v-model="app.model.data.denominators"
      :options="numeratorOptions"
      label="Denominator/s"
      required
    >
      <template #tooltip>
        Select the control or baseline condition that will serve as the reference for comparison. If
        multiple denominators are selected, only clonotypes that are differentially enriched for
        each numerator when compared individually against all selected denominators (excluding cases
        where the numerator matches the denominator) will be considered as enriched.
      </template>
    </PlDropdownMulti>
    <!-- Content hidden until you click THRESHOLD PARAMETERS -->
    <PlAccordionSection label="THRESHOLD PARAMETERS">
      <PlRow>
        <PlNumberField
          v-model="app.model.data.log2FcThreshold"
          label="Log2(FC)"
          :errorMessage="requiredError(app.model.data.log2FcThreshold)"
          :minValue="0"
          :step="0.1"
        >
          <template #tooltip>
            Set the minimum log2 fold change threshold (keep ≥ log2(FC)) and the maximum adjusted
            p-value threshold (keep ≤ adjusted p-value) for identifying significantly enriched or
            depleted clonotypes.
          </template>
        </PlNumberField>
        <PlNumberField
          v-model="app.model.data.pAdjThreshold"
          label="Adjusted p-value"
          :errorMessage="requiredError(app.model.data.pAdjThreshold)"
          :minValue="0"
          :maxValue="1"
          :step="0.01"
        />
      </PlRow>
      <PlRow>
        <PlNumberField
          v-model="app.model.data.thresholdCounts"
          label="Min UMI counts"
          :errorMessage="requiredError(app.model.data.thresholdCounts)"
          :minValue="0"
          :step="1"
          placeholder="0"
        >
          <template #tooltip>
            A clonotype must have at least "Min counts" in at least "Min (numerator) replicates" to
            be accepted as significantly enriched.
          </template>
        </PlNumberField>
        <PlNumberField
          v-model="app.model.data.thresholdSamples"
          label="Min replicates"
          :errorMessage="requiredError(app.model.data.thresholdSamples)"
          :minValue="0"
          :step="1"
          placeholder="0"
        />
      </PlRow>
    </PlAccordionSection>
    <PlCheckbox v-model="app.model.data.findTcrAbPairs">
      Find TCR A/B pairs
      <PlTooltip class="info">
        <template #tooltip>
          When enabled, the analysis will identify paired TCR alpha and beta chains by correlating
          the frequencies of differentially enriched clonotypes across matching samples. Only
          clonotypes that show positive correlation in their enrichment patterns will be considered
        </template>
      </PlTooltip>
    </PlCheckbox>
    <PlDropdown
      v-if="!app.model.outputs.barcodeColPresent && app.model.data.findTcrAbPairs"
      v-model="app.model.data.pairingMetadataCol"
      :options="metadataOptions"
      label="Pairing metadata column"
      clearable
    >
      <template #tooltip>
        Select the metadata column that will be used to match samples between alpha and beta chains
        for pairing analysis. This column should contain values that uniquely identify matching
        samples across both chains.
      </template>
    </PlDropdown>
    <!-- Content hidden until you click -->
    <PlAccordionSection label="CD4/8 subset assignment">
      <PlDropdown
        v-model="app.model.data.cdRef"
        :options="cdRefInputOptions"
        label="Select CD4/8 dataset (optional)"
        clearable
      >
        <template #tooltip>
          Optionally select a dataset that contains CD4/CD8 cell subset information. If provided,
          clonotypes from the main dataset will be assigned to either CD4+ or CD8+ T cell subsets
          based on this dataset.
        </template>
      </PlDropdown>
      <PlDropdown
        v-if="app.model.data.cdRef"
        :model-value="app.model.data.cdSubsetCol"
        :options="metadataOptions"
        label="CD4/8 metadata column"
        clearable
        @update:model-value="onCdSubsetColChange"
      >
        <template #tooltip>
          Select the metadata column from the CD4/8 dataset that contains the cell subset labels.
          This column must contain values that include "CD4" or "CD8" (case-insensitive) to identify
          CD4+ and CD8+ T cell subsets. The analysis will use this information to assign clonotypes
          from the main dataset to the appropriate T cell subset based on matching clonotypes.
        </template>
      </PlDropdown>
      <PlAlert
        v-if="
          app.model.data.cdRef && app.model.data.cdSubsetCol && cdSubsetCheck?.hasSubsets === false
        "
        type="warn"
      >
        {{
          "Warning: The selected column doen't have any CD4 or CD8 values. please choose a column that has.\
        First 5 values are: " + cdSubsetCheck.firstValues.join(", ")
        }}
      </PlAlert>
    </PlAccordionSection>
  </PlSlideModal>
</template>
