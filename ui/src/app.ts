import { model } from '@platforma-open/milaboratories.tcrdisco-enrichment.model';
import { defineApp } from '@platforma-sdk/ui-vue';
import FrequenciesHeatmapPage from './pages/FrequenciesHeatmapPage.vue';
import GraphPage from './pages/GraphPage.vue';
import MainPage from './pages/MainPage.vue';
import PairsPage from './pages/PairsPage.vue';

export const sdkPlugin = defineApp(model, () => {
  return {
    routes: {
      '/': () => MainPage,
      '/graph': () => GraphPage,
      '/pairs': () => PairsPage,
      '/freq-heatmap': () => FrequenciesHeatmapPage,
    },
  };
});

export const useApp = sdkPlugin.useApp;
