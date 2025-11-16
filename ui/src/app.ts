import { model } from '@platforma-open/milaboratories.tcrdisco-enrichment.model';
import { defineApp } from '@platforma-sdk/ui-vue';
import MainPage from './pages/MainPage.vue';
import GraphPage from './pages/GraphPage.vue';
import PairsPage from './pages/PairsPage.vue';

export const sdkPlugin = defineApp(model, () => {
  return {
    routes: {
      '/': () => MainPage,
      '/graph': () => GraphPage,
      '/pairs': () => PairsPage,
    },
  };
});

export const useApp = sdkPlugin.useApp;
