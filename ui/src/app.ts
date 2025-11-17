import { model } from '@platforma-open/milaboratories.tcrdisco-enrichment.model';
import { defineApp } from '@platforma-sdk/ui-vue';
import MainPage from './pages/MainPage.vue';
import GraphPage from './pages/GraphPage.vue';
import PairsPage from './pages/PairsPage.vue';
import PairsHeatmapPage from './pages/PairsHeatmapPage.vue';

export const sdkPlugin = defineApp(model, () => {
  return {
    routes: {
      '/': () => MainPage,
      '/graph': () => GraphPage,
      '/pairs': () => PairsPage,
      '/pairs-heatmap': () => PairsHeatmapPage,
    },
  };
});

export const useApp = sdkPlugin.useApp;
