import type { GraphMakerState } from '@milaboratories/graph-maker';
import type {
  InferOutputsType,
  PColumn,
  PColumnDataUniversal,
  PColumnIdAndSpec,
  PFrameHandle,
  PlDataTableStateV2,
  PlMultiSequenceAlignmentModel,
  PlRef,
  TreeNodeAccessor,
} from '@platforma-sdk/model';
import {
  BlockModel,
  createPFrameForGraphs,
  createPlDataTableSheet,
  createPlDataTableStateV2,
  createPlDataTableV2,
  getUniquePartitionKeys,
  isPColumnSpec,
} from '@platforma-sdk/model';

export type UiState = {
  tableState: PlDataTableStateV2;
  pairsTableState: PlDataTableStateV2;
  title?: string;
  selectedChain?: 'alpha' | 'beta';
  cdSubsetColValid: boolean;
  graphState: GraphMakerState;
  pairsHeatmapState: GraphMakerState;
  frequenciesHeatmapState: GraphMakerState;
  alignmentModel: PlMultiSequenceAlignmentModel;
};

export type BlockArgs = {
  name?: string;
  mainRef?: PlRef;
  cdRef?: PlRef;
  cdSubsetCol?: PlRef;
  covariateRefs: PlRef[];
  contrastFactor?: PlRef;
  numerators: string[];
  denominator?: string;
  findTcrAbPairs: boolean;
  thresholdCounts: number;
  thresholdSamples: number;
  log2FcThreshold: number;
  pAdjThreshold: number;
};

// Filter columns for volcano plot
function filterPCols(
  pCols: PColumn<TreeNodeAccessor>[]):
  PColumn<TreeNodeAccessor>[] {
  // Allow only log2 FC and -log10 Padjust as options for volcano axis
  pCols = pCols.filter(
    (col) => col.spec.name === 'pl7.app/differentialTCRAbundance/log2foldchange'
      || col.spec.name === 'pl7.app/differentialTCRAbundance/minlog10padj'
      || col.spec.name === 'pl7.app/differentialTCRAbundance/regulationDirection'
      || col.spec.name === 'pl7.app/differentialTCRAbundance/contrastGroup'
      || col.spec.name === 'pl7.app/differentialTCRAbundance/chain',
  );
  return pCols;
}

export const model = BlockModel.create()

  .withArgs<BlockArgs>({
    covariateRefs: [],
    numerators: [],
    findTcrAbPairs: false,
    thresholdCounts: 10,
    thresholdSamples: 3,
    log2FcThreshold: 0,
    pAdjThreshold: 0.05,
  })

  .withUiState<UiState>({
    title: 'TCR Disco Enrichment',
    tableState: createPlDataTableStateV2(),
    pairsTableState: createPlDataTableStateV2(),
    selectedChain: 'alpha',
    cdSubsetColValid: false,
    graphState: {
      title: 'Volcano plot',
      template: 'dots',
      currentTab: null,
    },
    pairsHeatmapState: {
      title: 'TCR A/B pairs correlation heatmap',
      template: 'heatmapClustered',
      layersSettings: {
        heatmapClustered: {
          normalizationDirection: 'column',
          normalizationMethod: 'standardScaling',
          dendrogramX: false,
          dendrogramY: false,
        },
      },
    },
    frequenciesHeatmapState: {
      title: 'Enriched clonotypes heatmap',
      template: 'heatmapClustered',
      layersSettings: {
        heatmapClustered: {
          normalizationDirection: 'row',
          normalizationMethod: 'standardScaling',
          dendrogramX: false,
          dendrogramY: false,
        },
      },
    },
    alignmentModel: {},
  })

  .argsValid((ctx) => (
    ((ctx.args.mainRef !== undefined)
      && (ctx.args.covariateRefs !== undefined)
      && (ctx.args.contrastFactor !== undefined)
      && (ctx.args.numerators.length > 0)
      && (ctx.args.denominator !== undefined)
      && (ctx.args.log2FcThreshold !== undefined)
      && (ctx.args.pAdjThreshold !== undefined)
      && (ctx.args.thresholdCounts !== undefined)
      && (ctx.args.thresholdSamples !== undefined)
      && (!ctx.args.cdRef || (ctx.args.cdSubsetCol !== undefined && ctx.uiState?.cdSubsetColValid)))
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
    ], { label: { includeNativeLabel: false, addLabelAsSuffix: true,
      forceTraceElements: [],
    },
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

  .output('cdSubsetOptions', (ctx) => {
    if (!ctx.args.cdSubsetCol) return undefined;

    const pColumn = ctx.resultPool.getPColumnByRef(ctx.args.cdSubsetCol);
    if (!pColumn) return undefined;

    return ctx.createPFrame([pColumn]);
  })

  .output('pt', (ctx) => {
    const selectedChain = ctx.uiState?.selectedChain ?? 'alpha';
    const outputName = selectedChain === 'alpha' ? 'topDegPFAlpha' : 'topDegPFBeta';
    const pCols = ctx.outputs?.resolve(outputName)?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPlDataTableV2(ctx, pCols, ctx.uiState?.tableState);
  })

  .output('sheets', (ctx) => {
    const selectedChain = ctx.uiState?.selectedChain ?? 'alpha';
    const outputName = selectedChain === 'alpha' ? 'topDegPFAlpha' : 'topDegPFBeta';
    const pCols = ctx.outputs?.resolve(outputName)?.getPColumns();
    if (pCols === undefined || pCols.length === 0) {
      return undefined;
    }

    // Get unique partition keys if available
    const partitionKeys = getUniquePartitionKeys(pCols[0].data)?.[0];
    if (!partitionKeys) return undefined;

    return [createPlDataTableSheet(ctx, pCols[0].spec.axesSpec[0], partitionKeys)];
  })

  .output('pairsPt', (ctx) => {
    const pCols = ctx.outputs?.resolve({ field: 'pairsPF', allowPermanentAbsence: true })?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPlDataTableV2(ctx, pCols, ctx.uiState?.pairsTableState);
  })

  .output('pairsSheets', (ctx) => {
    const pCols = ctx.outputs?.resolve({ field: 'pairsPF', allowPermanentAbsence: true })?.getPColumns();
    if (pCols === undefined || pCols.length === 0) {
      return undefined;
    }

    // Get unique partition keys if available
    const partitionKeys = getUniquePartitionKeys(pCols[0].data)?.[0];
    if (!partitionKeys) return undefined;

    return [createPlDataTableSheet(ctx, pCols[0].spec.axesSpec[0], partitionKeys)];
  })

  .output('topTablePf', (ctx): PFrameHandle | undefined => {
    const selectedChain = ctx.uiState?.selectedChain ?? 'alpha';
    const outputName = selectedChain === 'alpha' ? 'topDegPFAlpha' : 'topDegPFBeta';
    let pCols = ctx.outputs?.resolve(outputName)?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    pCols = filterPCols(pCols);

    return createPFrameForGraphs(ctx, pCols);
  })

  .output('topTablePcols', (ctx) => {
    const selectedChain = ctx.uiState?.selectedChain ?? 'alpha';
    const outputName = selectedChain === 'alpha' ? 'topDegPFAlpha' : 'topDegPFBeta';
    const pCols = ctx.outputs?.resolve(outputName)?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return pCols.map(
      (c) =>
        ({
          columnId: c.id,
          spec: c.spec,
        } satisfies PColumnIdAndSpec),
    );
  })

  .output('pairsHeatmapPf', (ctx): PFrameHandle | undefined => {
    const pCols = ctx.outputs?.resolve({ field: 'pairsPF', allowPermanentAbsence: true })?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    const clonotypeIds = ctx.resultPool.selectColumns(
      (spec) => spec.name === 'pl7.app/label'
        && spec.axesSpec?.some((axis) => axis.name === 'pl7.app/vdj/clonotypeKey' || axis.name === 'pl7.app/vdj/scClonotypeKey'),
    ) as PColumn<PColumnDataUniversal>[];

    const allPcols = [...pCols, ...clonotypeIds];

    return ctx.createPFrame(allPcols);
  })

  .output('pairsHeatmapPcols', (ctx) => {
    const pCols = ctx.outputs?.resolve({ field: 'pairsPF', allowPermanentAbsence: true })?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }
    return pCols.map(
      (c) =>
        ({
          columnId: c.id,
          spec: c.spec,
        } satisfies PColumnIdAndSpec),
    );
  })

  .output('frequenciesHeatmapPf', (ctx): PFrameHandle | undefined => {
    const selectedChain = ctx.uiState?.selectedChain ?? 'alpha';
    const outputName = selectedChain === 'alpha' ? 'mainAlphaFrequenciesPF' : 'mainBetaFrequenciesPF';
    let allPcols = ctx.outputs?.resolve(outputName)?.getPColumns();
    if (allPcols === undefined) {
      return undefined;
    }

    // Get all metadata columns that are compatible with the Sample axis
    // const sampleIds = ctx.resultPool.selectColumns(
    //   (spec) => spec.name === 'pl7.app/label'
    //     && spec.axesSpec?.some((axis) => axis.name === 'pl7.app/sampleId'
    //       || axis.name === 'pl7.app/vdj/clonotypeKey'
    //       || axis.name === 'pl7.app/vdj/scClonotypeKey'
    //       || axis.name === 'pl7.app/metadata'),
    // ) as PColumn<PColumnDataUniversal>[];

    // let allPcols = [...pCols, ...sampleIds];
    // let allPcols = pCols;

    const subtypeLabel = selectedChain === 'alpha' ? 'clonotypeToSubsetAlpha' : 'clonotypeToSubsetBeta';
    const clonotypeToSubsetPcols = ctx.outputs?.resolve({ field: subtypeLabel, allowPermanentAbsence: true })?.getPColumns();
    if (clonotypeToSubsetPcols !== undefined) {
      allPcols = [...allPcols, ...clonotypeToSubsetPcols];
    }

    // return ctx.createPFrame([...pCols, ...metadataCols]);
    // return ctx.createPFrame(allPcols);
    return createPFrameForGraphs(ctx, allPcols);
  })

  .output('frequenciesHeatmapPcols', (ctx) => {
    const selectedChain = ctx.uiState?.selectedChain ?? 'alpha';
    const outputName = selectedChain === 'alpha' ? 'mainAlphaFrequenciesPF' : 'mainBetaFrequenciesPF';
    const pCols = ctx.outputs?.resolve(outputName)?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    const subtypeLabel = selectedChain === 'alpha' ? 'clonotypeToSubsetAlpha' : 'clonotypeToSubsetBeta';
    const clonotypeToSubsetPcols = ctx.outputs?.resolve({ field: subtypeLabel, allowPermanentAbsence: true })?.getPColumns();

    // Get all metadata columns that are compatible with the Sample axis
    const metadataCols = ctx.resultPool.selectColumns(
      (spec) => spec.name === 'pl7.app/metadata',
    );

    // Get the sequence column for the sleected chain
    const chain = selectedChain === 'alpha' ? 'TCRAlpha' : 'TCRBeta';
    const sequenceCol = ctx.resultPool.selectColumns(
      (spec) => spec.name === 'pl7.app/vdj/sequence'
        && spec.domain?.['pl7.app/alphabet'] === 'aminoacid'
        && spec.domain?.['pl7.app/vdj/feature'] === 'CDR3'
        && spec.axesSpec[0].domain?.['pl7.app/vdj/chain'] === chain,
    );

    let allCols = [...pCols, ...metadataCols];
    if (clonotypeToSubsetPcols !== undefined) {
      allCols = [...allCols, ...clonotypeToSubsetPcols];
    }
    if (sequenceCol !== undefined) {
      allCols = [...allCols, ...sequenceCol];
    }

    return allCols.map(
      (c) =>
        ({
          columnId: c.id,
          spec: c.spec,
        } satisfies PColumnIdAndSpec),
    );
  })

  .output('msaPf', (ctx) => {
    const selectedChain = ctx.uiState?.selectedChain ?? 'alpha';
    const outputName = selectedChain === 'alpha' ? 'topDegPFAlpha' : 'topDegPFBeta';
    const msaCols = ctx.outputs?.resolve(outputName)?.getPColumns();
    if (!msaCols) return undefined;

    const datasetRef = ctx.args.mainRef;
    if (datasetRef === undefined)
      return undefined;

    return createPFrameForGraphs(ctx, msaCols);
  })

  .title((ctx) => ctx.uiState?.title ?? 'TCR Disco Enrichment')

  .sections((ctx) => {
    const sections: Array<{ type: 'link'; href: `/${string}`; label: string }> = [
      { type: 'link' as const, href: '/' as const, label: 'Main' },
      { type: 'link' as const, href: '/graph' as const, label: 'Volcano plot' },
      { type: 'link' as const, href: '/freq-heatmap' as const, label: 'Enriched clonotypes heatmap' },
    ];

    if (ctx.args.findTcrAbPairs) {
      sections.push({ type: 'link' as const, href: '/pairs' as const, label: 'TCR AB Pairs' });
      sections.push({ type: 'link' as const, href: '/pairs-heatmap' as const, label: 'Pairs correlation heatmap' });
    }

    return sections;
  })

  .done(2);

export type BlockOutputs = InferOutputsType<typeof model>;
