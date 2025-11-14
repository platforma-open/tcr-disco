import type {
  InferOutputsType,
  PlDataTableStateV2,
  PlRef,
} from '@platforma-sdk/model';
import {
  BlockModel,
  createPlDataTableSheet,
  createPlDataTableStateV2,
  createPlDataTableV2,
  getUniquePartitionKeys,
  isPColumnSpec,
} from '@platforma-sdk/model';

export type UiState = {
  tableState: PlDataTableStateV2;
  title?: string;
};

export type BlockArgs = {
  name?: string;
  mainRef?: PlRef;
  cdRef?: PlRef;
  cdSubsetCol?: string;
  covariateRefs: PlRef[];
  contrastFactor?: PlRef;
  numerators: string[];
  denominator?: string;
  thresholdCounts: number;
  thresholdSamples: number;
};

export const model = BlockModel.create()

  .withArgs<BlockArgs>({
    covariateRefs: [],
    numerators: [],
    thresholdCounts: 0,
    thresholdSamples: 0,
  })

  .withUiState<UiState>({
    title: 'TCR Disco Enrichment',
    tableState: createPlDataTableStateV2(),
  })

  .argsValid((ctx) => (
    ctx.args.mainRef !== undefined
  ))

  // Allow user to choose Alpha chain, will pick beta if available
  // @TODO: Should we allow single analysis of beta chain?
  .output('inputOptions', (ctx) => {
    return ctx.resultPool.getOptions([{
      axes: [
        { name: 'pl7.app/sampleId' },
        { domain: {
          'pl7.app/vdj/chain': 'TCRAlpha',
        },
        },
      ],
      annotations: { 'pl7.app/isAbundance': 'true',
        'pl7.app/abundance/normalized': 'false',
        'pl7.app/abundance/isPrimary': 'true',
      },
    },
    ], { label: { includeNativeLabel: true, addLabelAsSuffix: true },
      refsWithEnrichments: false });
  })

  .output('metadataOptions', (ctx) =>
    ctx.resultPool.getOptions((spec) => isPColumnSpec(spec) && spec.name === 'pl7.app/metadata'),
  )

  .output('denominatorOptions', (ctx) => {
    if (!ctx.args.contrastFactor) return undefined;

    const pColumn = ctx.resultPool.getPColumnByRef(ctx.args.contrastFactor);
    if (!pColumn) return undefined;

    return ctx.createPFrame([pColumn]);
  })

  .output('pt', (ctx) => {
    const pCols = ctx.outputs?.resolve('resultsPf')?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPlDataTableV2(ctx, pCols, ctx.uiState?.tableState);
  })

  .output('sheets', (ctx) => {
    const pCols = ctx.outputs?.resolve('resultsPf')?.getPColumns();
    if (pCols === undefined || pCols.length === 0) {
      return undefined;
    }

    // Get unique partition keys if available
    const partitionKeys = getUniquePartitionKeys(pCols[0].data)?.[0];
    if (!partitionKeys) return undefined;

    return [createPlDataTableSheet(ctx, pCols[0].spec.axesSpec[0], partitionKeys)];
  })

  .output('resultsFile', (ctx) => {
    const resultsFile = ctx.outputs?.resolve('tcrAnalysisResult');
    if (resultsFile === undefined) {
      return undefined;
    }
    return resultsFile;
  })

  .title((ctx) => ctx.uiState?.title ?? 'TCR Disco Enrichment')

  .sections((_ctx) => [{ type: 'link', href: '/', label: 'Main' }])

  .done(2);

export type BlockOutputs = InferOutputsType<typeof model>;
