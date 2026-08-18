<script setup lang="ts">
import type { PredefinedGraphOption } from "@milaboratories/graph-maker";
import { GraphMaker } from "@milaboratories/graph-maker";
import type { PColumnIdAndSpec, PColumnSpec } from "@platforma-sdk/model";
import { plRefsEqual } from "@platforma-sdk/model";
import { PlTabs } from "@platforma-sdk/ui-vue";
import { computed } from "vue";
import { useApp } from "../app";

const app = useApp();

const defaultAxesSettings = { axisY: { labelParts: { defaultOrder: [0, 1] } } };

// Both chains' pFrames are precomputed in the model; pick the active one so a
// chain switch swaps a cached handle with no model recompute.
const pFrame = computed(() =>
  app.model.data.selectedChain === "beta"
    ? app.model.outputs.frequenciesHeatmapPfBeta
    : app.model.outputs.frequenciesHeatmapPfAlpha,
);

// Per-chain chart state: alpha and beta keep independent objects so a custom
// data-mapping on one chain can't reference the other chain's columns. The chart
// is remounted on chain switch (`:key` below) so its store re-reads this state.
const currentState = computed({
  get: () =>
    app.model.data.selectedChain === "beta"
      ? app.model.data.frequenciesHeatmapStateBeta
      : app.model.data.frequenciesHeatmapState,
  set: (value) => {
    if (app.model.data.selectedChain === "beta") app.model.data.frequenciesHeatmapStateBeta = value;
    else app.model.data.frequenciesHeatmapState = value;
  },
});

function getIndex(name: string, pcols: PColumnIdAndSpec[]): number {
  return pcols.findIndex((p) => p.spec.name === name);
}

// graph-maker's findColumnBy requires the pFrame column to carry EVERY passed
// annotation; our pool spec carries `pl7.app/trace` + `pl7.app/table/*` that the
// pFrame copy lacks, so a whole spec matches nothing and the source is dropped.
// Match on identity only; the label still comes from the column's `pl7.app/label`.
function labelSourceSpec(spec: PColumnSpec): PColumnSpec {
  return {
    kind: "PColumn",
    name: spec.name,
    valueType: spec.valueType,
    domain: spec.domain,
    axesSpec: spec.axesSpec,
    annotations: {},
  };
}

const defaultOptions = computed((): PredefinedGraphOption<"heatmap">[] | undefined => {
  // Both chains' lists are precomputed in the model; pick the active one so a
  // chain switch only re-derives options here (no model column recompute).
  const pcols =
    app.model.outputs.frequenciesHeatmapPcols?.[app.model.data.selectedChain ?? "alpha"];
  if (!pcols) {
    return undefined;
  }

  const fractionIndex = getIndex("pl7.app/differentialTCRAbundance/countFraction", pcols);

  // Get the label from the contrastFactor PlRef
  const contrastFactorLabel = app.model.data.contrastFactor
    ? app.model.outputs.metadataOptions?.find((opt) =>
        plRefsEqual(opt.ref, app.model.data.contrastFactor!),
      )?.label
    : undefined;

  const contrastIndex = pcols.findIndex(
    (p) =>
      p.spec.name === "pl7.app/metadata" &&
      p.spec.annotations?.["pl7.app/label"] === contrastFactorLabel,
  );
  const subsetIndex = getIndex("pl7.app/differentialTCRAbundance/subset", pcols);
  const cdr3Index = getIndex("pl7.app/vdj/sequence", pcols);
  // Per-clonotype V gene (name shared across V/D/J/C hits, so match on the
  // reference domain).
  const vGeneIndex = pcols.findIndex(
    (p) =>
      p.spec.name === "pl7.app/vdj/geneHit" && p.spec.domain?.["pl7.app/vdj/reference"] === "VGene",
  );
  // Per-clonotype mean numerator frequency (Y sort key).
  const meanNumeratorFreqIndex = getIndex(
    "pl7.app/differentialTCRAbundance/meanNumeratorFrequency",
    pcols,
  );

  if (
    fractionIndex === -1 ||
    cdr3Index === -1 ||
    !contrastFactorLabel ||
    contrastIndex === -1 ||
    !pcols[fractionIndex]?.spec.axesSpec
  ) {
    return undefined;
  }

  const fractionSpec = pcols[fractionIndex].spec;
  const axesSpec = fractionSpec.axesSpec;

  const defaults: PredefinedGraphOption<"heatmap">[] = [
    {
      inputName: "value",
      selectedSource: fractionSpec,
    },
    {
      inputName: "x",
      selectedSource: axesSpec[0], // internalSampleId
    },
    {
      // first Y value, clonotypeKey
      inputName: "y",
      selectedSource: axesSpec[1],
    },
    {
      // second Y value, CDR3 aa
      inputName: "y",
      selectedSource: labelSourceSpec(pcols[cdr3Index].spec),
    },
    {
      inputName: "xGroupBy",
      selectedSource: pcols[contrastIndex].spec,
    },
    {
      inputName: "annotationsX",
      selectedSource: pcols[contrastIndex].spec,
    },
  ];

  // V gene as a Y label source. loadDefaultSources resolves column `y` sources
  // before the axis, so the applied Y order is [CDR3aa, VGene, clonotypeKey]
  // regardless of the order listed here — the labelParts seed relies on that.
  if (vGeneIndex !== -1) {
    defaults.push({
      inputName: "y",
      selectedSource: labelSourceSpec(pcols[vGeneIndex].spec),
    });
  }

  // Sort Y by mean numerator-replicate frequency (direction set via axisY.sorting).
  // Minimal spec so findColumnBy resolves it (full annotations wouldn't match).
  if (meanNumeratorFreqIndex !== -1) {
    defaults.push({
      inputName: "ySortBy",
      selectedSource: labelSourceSpec(pcols[meanNumeratorFreqIndex].spec),
    });
  }

  if (subsetIndex !== -1) {
    defaults.push({
      inputName: "annotationsY",
      selectedSource: pcols[subsetIndex].spec,
    });
  }

  // Add filters for the contrast values that have been selected
  const contrastValues = [...app.model.data.numerators, ...app.model.data.denominators];
  if (contrastValues.length > 0) {
    defaults.push({
      inputName: "filters",
      selectedSource: pcols[contrastIndex].spec,
      filterType: "equals",
      selectedFilterValues: contrastValues,
    });
  }

  const robustAnyIndex = getIndex("pl7.app/differentialTCRAbundance/robustEnrichment", pcols);
  if (robustAnyIndex !== -1) {
    defaults.push({
      inputName: "filters",
      selectedSource: pcols[robustAnyIndex].spec,
      filterType: "equals",
      selectedFilterValues: ["Robust"],
    });
  }

  return defaults;
});
</script>

<template>
  <GraphMaker
    :key="app.model.data.selectedChain ?? 'alpha'"
    v-model="currentState"
    chartType="heatmap"
    :p-frame="pFrame"
    :default-options="defaultOptions"
    :default-axes-settings="defaultAxesSettings"
    :default-palette="{ continuous: 'blue_red' }"
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
    </template>
  </GraphMaker>
</template>
