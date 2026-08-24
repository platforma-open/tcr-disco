import { platforma } from "@platforma-open/milaboratories.tcrdisco-enrichment.model";
import { defineAppV3 } from "@platforma-sdk/ui-vue";
import FrequenciesHeatmapPage from "./pages/FrequenciesHeatmapPage.vue";
import GraphPage from "./pages/GraphPage.vue";
import MainPage from "./pages/MainPage.vue";
import PairsHeatmapPage from "./pages/PairsHeatmapPage.vue";
import PairsPage from "./pages/PairsPage.vue";

export const sdkPlugin = defineAppV3(platforma, (app) => {
  return {
    // Loader line across the top of the block page while the workflow computes.
    progress: () => app.model.outputs.isRunning,
    routes: {
      "/": () => MainPage,
      "/graph": () => GraphPage,
      "/pairs": () => PairsPage,
      "/pairs-heatmap": () => PairsHeatmapPage,
      "/freq-heatmap": () => FrequenciesHeatmapPage,
    },
  };
});

export const useApp = sdkPlugin.useApp;
