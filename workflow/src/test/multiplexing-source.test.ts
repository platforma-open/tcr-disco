import { awaitStableState, tplTest } from '@platforma-sdk/test';

tplTest(
  'multiplexing-source resolve — rules single tag',
  { timeout: 30000 },
  async ({ helper, expect }) => {
    const resultC = (
      await helper.renderTemplate(true, 'test.multiplexing-source.test', ['result'], (tx) => ({
        caseName: tx.createJsonValue('rules-single-tag')
      }))
    ).computeOutput('result', (c) => c?.getDataAsJson());
    const result = await awaitStableState(resultC, 25000);
    expect(result.ok).toBe(true);
    expect(result.sampleBarcodes).toEqual({ S1: 'ID_168', S2: 'ID_147' });
  }
);

tplTest(
  'multiplexing-source resolve — rules multi-tag rejected',
  { timeout: 30000 },
  async ({ helper, expect }) => {
    const resultC = (
      await helper.renderTemplate(true, 'test.multiplexing-source.test', ['result'], (tx) => ({
        caseName: tx.createJsonValue('rules-multi-tag')
      }))
    ).computeOutput('result', (c) => c?.getDataAsJson());
    const result = await awaitStableState(resultC, 25000);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/multiple barcode tags/i);
  }
);

tplTest(
  'multiplexing-source resolve — rules multi-alt rejected',
  { timeout: 30000 },
  async ({ helper, expect }) => {
    const resultC = (
      await helper.renderTemplate(true, 'test.multiplexing-source.test', ['result'], (tx) => ({
        caseName: tx.createJsonValue('rules-multi-alt')
      }))
    ).computeOutput('result', (c) => c?.getDataAsJson());
    const result = await awaitStableState(resultC, 25000);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/multiple alternatives/i);
  }
);

tplTest(
  'multiplexing-source resolve — legacy only',
  { timeout: 30000 },
  async ({ helper, expect }) => {
    const resultC = (
      await helper.renderTemplate(true, 'test.multiplexing-source.test', ['result'], (tx) => ({
        caseName: tx.createJsonValue('legacy-only')
      }))
    ).computeOutput('result', (c) => c?.getDataAsJson());
    const result = await awaitStableState(resultC, 25000);
    expect(result.ok).toBe(true);
    expect(result.sampleBarcodes).toEqual({ S1: 'ID_111', S2: 'ID_125' });
  }
);

tplTest(
  'multiplexing-source resolve — rules empty value rejected',
  { timeout: 30000 },
  async ({ helper, expect }) => {
    const resultC = (
      await helper.renderTemplate(true, 'test.multiplexing-source.test', ['result'], (tx) => ({
        caseName: tx.createJsonValue('rules-empty-value')
      }))
    ).computeOutput('result', (c) => c?.getDataAsJson());
    const result = await awaitStableState(resultC, 25000);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/no value for tag/i);
  }
);

tplTest(
  'multiplexing-source resolve — neither shape present',
  { timeout: 30000 },
  async ({ helper, expect }) => {
    const resultC = (
      await helper.renderTemplate(true, 'test.multiplexing-source.test', ['result'], (tx) => ({
        caseName: tx.createJsonValue('neither')
      }))
    ).computeOutput('result', (c) => c?.getDataAsJson());
    const result = await awaitStableState(resultC, 25000);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/no multiplexing rules.*barcode id/i);
  }
);
