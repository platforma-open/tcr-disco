<script setup lang="ts">
import type { PlRef } from "@platforma-sdk/model";
import { PFrameImpl, plRefsEqual } from "@platforma-sdk/model";
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
function setInput(inputRef?: PlRef) {
  app.model.data.mainRef = inputRef;
  if (inputRef) {
    const mainLabel = app.model.outputs.inputOptions?.find((o) =>
      plRefsEqual(o.ref, inputRef),
    )?.label;
    if (mainLabel) app.model.data.title = "TCR Disco - " + mainLabel;
  }
}

const metadataOptions = computed(() => {
  return (
    app.model.outputs.metadataOptions?.map((v: { ref: PlRef; label: string }) => ({
      value: v.ref,
      label: v.label,
    })) ?? []
  );
});

const metadataLabels = computed(() => {
  return (
    app.model.outputs.metadataOptions?.map((v: { ref: PlRef; label: string }) => ({
      value: v.label,
      label: v.label,
    })) ?? []
  );
});

// CD4/8 dropdown: same options as main, but exclude the main dataset
const cdRefInputOptions = computed(() => {
  const opts = app.model.outputs.inputOptions ?? [];
  const main = app.model.data.mainRef;
  if (!main) return opts;
  return opts.filter((o) => !plRefsEqual(o.ref, main));
});

const contrastFactorOptions = computed(() => {
  return app.model.data.covariateRefs.map((ref) => ({
    value: ref,
    label: metadataOptions.value.find((m) => m.value.name === ref.name)?.label ?? "",
  }));
});

// Get all possible numerator/denominator values
const numeratorOptions = useWatchFetch(
  () => app.model.outputs.denominatorOptions,
  async (pframeHandle) => {
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
  },
);

// Distinct values of the selected CD4/8 column. This is a read-only derivation
// (output -> local reactive state), NOT a write back to data, so it is not a
// hairpin — it drives the live UI warning below. The authoritative gate value
// (data.cdSubsetColValid) is snapshotted separately, only on user gesture.
const cdValues = useWatchFetch(
  () => app.model.outputs.cdSubsetOptions,
  async (pframeHandle) => {
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
  },
);

// Whether the loaded CD4/8 column values include a CD4/CD8 label. `undefined`
// while the values are still loading. Live, local — for the UX warning only.
const cdColHasSubsets = computed<boolean | undefined>(() => {
  const vals = cdValues.value;
  if (!vals) return undefined;
  return vals.some((v) => {
    const label = v.label.toLowerCase();
    return label === "cd4" || label === "cd8";
  });
});

// Snapshot the CD4/8 validity into data only in response to the user's column
// selection. Validity requires an async unique-values fetch, so it can't be
// written synchronously in the gesture handler; instead the handler arms
// `awaitingCdValidation` (per-client, never synced) and the watcher below writes
// once the fetch settles. Because the flag is local, only the client that made
// the selection writes — no multi-client write race, no output->data watcher.
const awaitingCdValidation = ref(false);

function onCdSubsetColChange(ref?: PlRef) {
  app.model.data.cdSubsetCol = ref;
  app.model.data.cdSubsetColValid = false; // close the run gate until re-verified
  awaitingCdValidation.value = ref !== undefined;
}

watch(cdColHasSubsets, (hasSubsets) => {
  if (!awaitingCdValidation.value) return; // only the client that just selected
  if (hasSubsets === undefined) return; // still loading
  app.model.data.cdSubsetColValid = hasSubsets;
  awaitingCdValidation.value = false;
});

// Reset numerator/denominator only when the contrast factor genuinely changes.
// Watch the ref directly, NOT a fresh `[...]` wrapper: the array wrapper makes
// Vue's Object.is comparison always report a change, so the callback fired on
// every `data` reconcile/replacement (which V3 does on each sync) — wiping the
// user's selection even when the contrast factor was untouched or undefined.
// The plRefsEqual guard additionally covers reconciliation swapping in a
// deep-equal PlRef with a new object identity.
watch(
  () => app.model.data.contrastFactor,
  (newRef, oldRef) => {
    if (newRef && oldRef && plRefsEqual(newRef, oldRef)) return;
    app.model.data.numerators = [];
    app.model.data.denominators = [];
  },
);

// Clear CD4/8 selection if user sets main dataset to the same as CD4/8
watch(
  () => app.model.data.mainRef,
  (mainRef) => {
    const cdRef = app.model.data.cdRef;
    if (cdRef && mainRef && plRefsEqual(cdRef, mainRef)) {
      app.model.data.cdRef = undefined;
    }
  },
);
</script>

<template>
  <PlBlockPage>
    <template #title>{{ app.model.data.title }}</template>
    <template #append>
      <PlBtnGhost @click.stop="showSettings">
        Settings
        <template #append>
          <PlMaskIcon24 name="settings" />
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
    <PlDropdownRef
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
    </PlDropdownRef>
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
      :options="numeratorOptions.value"
      label="Numerator"
      required
    >
      <template #tooltip>
        Select one or more experimental conditions to compare against the baseline (denominator).
      </template>
    </PlDropdownMulti>
    <PlDropdownMulti
      v-model="app.model.data.denominators"
      :options="numeratorOptions.value"
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
          :minValue="0"
          :maxValue="1"
          :step="0.01"
        />
      </PlRow>
      <PlRow>
        <PlNumberField
          v-model="app.model.data.thresholdCounts"
          label="Min UMI counts"
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
      :options="metadataLabels"
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
      <PlDropdownRef
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
      </PlDropdownRef>
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
        v-if="app.model.data.cdRef && app.model.data.cdSubsetCol && cdColHasSubsets === false"
        type="warn"
      >
        {{
          "Warning: The selected column doen't have any CD4 or CD8 values. please choose a column that has.\
        First 5 values are: " +
          cdValues.value
            ?.slice(0, 5)
            .map((v) => v.label)
            .join(", ")
        }}
      </PlAlert>
    </PlAccordionSection>
  </PlSlideModal>
</template>
