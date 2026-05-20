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
  BlockModelV3,
  DataModelBuilder,
  createPFrameForGraphs,
  createPlDataTableSheet,
  createPlDataTableStateV2,
  createPlDataTableV2,
  getUniquePartitionKeys,
  isPColumnSpec,
} from '@platforma-sdk/model';

// Legacy types for upgradeLegacy migration path
type OldArgs = {
  name?: string;
  mainRef?: PlRef;
  cdRef?: PlRef;
  cdSubsetCol?: PlRef;
  pairingMetadataCol?: string;
  covariateRefs: PlRef[];
  contrastFactor?: PlRef;
  numerators: string[];
  denominators: string[];
  findTcrAbPairs: boolean;
  thresholdCounts: number;
  thresholdSamples: number;
  log2FcThreshold: number;
  pAdjThreshold: number;
};

type OldUiState = {
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

export type BlockData = {
  // Fields from BlockArgs
  name?: string;
  mainRef?: PlRef;
  cdRef?: PlRef;
  cdSubsetCol?: PlRef;
  pairingMetadataCol?: string;
  covariateRefs: PlRef[];
  contrastFactor?: PlRef;
  numerators: string[];
  denominators: string[];
  findTcrAbPairs: boolean;
  thresholdCounts: number;
  thresholdSamples: number;
  log2FcThreshold: number;
  pAdjThreshold: number;
  // Fields from UiState
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
      || col.spec.name === 'pl7.app/differentialTCRAbundance/chain'
      || col.spec.name === 'pl7.app/differentialTCRAbundance/cdsubset'
      || col.spec.name === 'pl7.app/differentialTCRAbundance/robustEnrichment',
  );
  return pCols;
}

const dataModel = new DataModelBuilder()
  .from<BlockData>('v1')
  .upgradeLegacy<OldArgs, OldUiState>(({ args, uiState }) => ({
    // Args fields
    name: args.name,
    mainRef: args.mainRef,
    cdRef: args.cdRef,
    cdSubsetCol: args.cdSubsetCol,
    pairingMetadataCol: args.pairingMetadataCol,
    covariateRefs: args.covariateRefs,
    contrastFactor: args.contrastFactor,
    numerators: args.numerators,
    denominators: args.denominators,
    findTcrAbPairs: args.findTcrAbPairs,
    thresholdCounts: args.thresholdCounts,
    thresholdSamples: args.thresholdSamples,
    log2FcThreshold: args.log2FcThreshold,
    pAdjThreshold: args.pAdjThreshold,
    // UiState fields
    tableState: uiState.tableState,
    pairsTableState: uiState.pairsTableState,
    title: uiState.title,
    selectedChain: uiState.selectedChain,
    cdSubsetColValid: uiState.cdSubsetColValid,
    graphState: uiState.graphState,
    pairsHeatmapState: uiState.pairsHeatmapState,
    frequenciesHeatmapState: uiState.frequenciesHeatmapState,
    alignmentModel: uiState.alignmentModel,
  }))
  .init(() => ({
    covariateRefs: [],
    numerators: [],
    denominators: [],
    findTcrAbPairs: false,
    thresholdCounts: 10,
    thresholdSamples: 3,
    log2FcThreshold: 0,
    pAdjThreshold: 0.05,
    title: 'TCR Disco',
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
          dendrogramX: false,
          dendrogramY: false,
        },
      },
      axesSettings: {
        axisX: {
          cellSize: 20,
        },
        axisY: {
          cellSize: 20,
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
          NAValueAs: null,
          showEmptyColumns: true,
        },
      },
      axesSettings: {
        axisX: {
          cellSize: 20,
        },
        axisY: {
          cellSize: 20,
        },
      },
    },
    alignmentModel: {},
  }));

export const platforma = BlockModelV3.create(dataModel)

  .args((data) => {
    if (
      data.mainRef === undefined
      || data.covariateRefs === undefined
      || data.contrastFactor === undefined
      || data.numerators.length === 0
      || data.denominators.length === 0
      || data.log2FcThreshold === undefined
      || data.pAdjThreshold === undefined
      || data.thresholdCounts === undefined
      || data.thresholdSamples === undefined
      || (data.cdRef && (data.cdSubsetCol === undefined || !data.cdSubsetColValid))
    ) {
      return undefined;
    }
    return {
      name: data.name,
      mainRef: data.mainRef,
      cdRef: data.cdRef,
      cdSubsetCol: data.cdSubsetCol,
      pairingMetadataCol: data.pairingMetadataCol,
      covariateRefs: data.covariateRefs,
      contrastFactor: data.contrastFactor,
      numerators: data.numerators,
      denominators: data.denominators,
      findTcrAbPairs: data.findTcrAbPairs,
      thresholdCounts: data.thresholdCounts,
      thresholdSamples: data.thresholdSamples,
      log2FcThreshold: data.log2FcThreshold,
      pAdjThreshold: data.pAdjThreshold,
    };
  })

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

  // Check if "Barcode ID" column is present in metadata, otherwise return false
  // This column will be present in demultiplexed data and will relate same
  // samples from different chains
  .output('barcodeColPresent', (ctx) => {
    const metadataCols = ctx.resultPool.selectColumns(
      (spec) => spec.name === 'pl7.app/metadata',
    );
    if (metadataCols === undefined) {
      return false;
    }
    return metadataCols.some((col) => col.spec.annotations?.['pl7.app/label'] === 'Barcode ID');
  })

  // Run report from workflow (report.txt): empty input or threshold filter warnings.
  .output('reportContent', (ctx): string | undefined => {
    const content = ctx.outputs?.resolve('reportContent')?.getDataAsString();
    return typeof content === 'string' && content.trim().length > 0 ? content.trim() : undefined;
  })

  .output('pt', (ctx) => {
    const selectedChain = ctx.data.selectedChain ?? 'alpha';
    const outputName = selectedChain === 'alpha' ? 'topDegPFAlpha' : 'topDegPFBeta';
    const pCols = ctx.outputs?.resolve(outputName)?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    return createPlDataTableV2(ctx, pCols, ctx.data.tableState);
  }, { withStatus: true })

  .output('sheets', (ctx) => {
    const selectedChain = ctx.data.selectedChain ?? 'alpha';
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

    return createPlDataTableV2(ctx, pCols, ctx.data.pairsTableState);
  }, { withStatus: true })

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
    const selectedChain = ctx.data.selectedChain ?? 'alpha';
    const outputName = selectedChain === 'alpha' ? 'topDegPFAlpha' : 'topDegPFBeta';
    let pCols = ctx.outputs?.resolve(outputName)?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    pCols = filterPCols(pCols);

    return createPFrameForGraphs(ctx, pCols);
  }, { withStatus: true })

  .output('topTablePcols', (ctx) => {
    const selectedChain = ctx.data.selectedChain ?? 'alpha';
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

    // Filter out CDR3 and Vgene columns
    let filteredPcols = pCols.filter((col) => col.spec.name !== 'pl7.app/differentialTCRAbundance/tra_CDR3aa'
      && col.spec.name !== 'pl7.app/differentialTCRAbundance/trb_CDR3aa'
      && col.spec.name !== 'pl7.app/differentialTCRAbundance/tra_VGene'
      && col.spec.name !== 'pl7.app/differentialTCRAbundance/trb_VGene');

    // Get from the pool CDR3 aa and VGene pcolumns
    const cdr3Pcols = ctx.resultPool.selectColumns(
      (spec) => spec.name === 'pl7.app/vdj/sequence'
        && spec.domain?.['pl7.app/alphabet'] === 'aminoacid'
        && spec.domain?.['pl7.app/vdj/feature'] === 'CDR3',
    );
    const vGenePcols = ctx.resultPool.selectColumns(
      (spec) => spec.name === 'pl7.app/vdj/sequence'
        && spec.domain?.['pl7.app/alphabet'] === 'aminoacid'
        && spec.domain?.['pl7.app/vdj/feature'] === 'VGene',
    );

    if (cdr3Pcols !== undefined && vGenePcols !== undefined) {
      filteredPcols = [...filteredPcols, ...cdr3Pcols, ...vGenePcols] as PColumn<TreeNodeAccessor>[];
    }

    // Add sample ID to labels information
    const clonotypeIds = ctx.resultPool.selectColumns(
      (spec) => spec.name === 'pl7.app/label'
        && spec.axesSpec?.some((axis) => axis.name === 'pl7.app/vdj/clonotypeKey' || axis.name === 'pl7.app/vdj/scClonotypeKey'),
    ) as PColumn<PColumnDataUniversal>[];

    const allPcols = [...filteredPcols, ...clonotypeIds];

    return ctx.createPFrame(allPcols);
  }, { withStatus: true })

  .output('pairsHeatmapPcols', (ctx) => {
    const pCols = ctx.outputs?.resolve({ field: 'pairsPF', allowPermanentAbsence: true })?.getPColumns();
    if (pCols === undefined) {
      return undefined;
    }

    // Filter out CDR3 and Vgene columns
    let filteredPcols = pCols.filter((col) => col.spec.name !== 'pl7.app/differentialTCRAbundance/tra_CDR3aa'
      && col.spec.name !== 'pl7.app/differentialTCRAbundance/trb_CDR3aa'
      && col.spec.name !== 'pl7.app/differentialTCRAbundance/tra_VGene'
      && col.spec.name !== 'pl7.app/differentialTCRAbundance/trb_VGene');

    // Get from the pool CDR3 aa and VGene pcolumns
    const cdr3Pcols = ctx.resultPool.selectColumns(
      (spec) => spec.name === 'pl7.app/vdj/sequence'
        && spec.domain?.['pl7.app/alphabet'] === 'aminoacid'
        && spec.domain?.['pl7.app/vdj/feature'] === 'CDR3',
    );
    if (cdr3Pcols !== undefined) {
      filteredPcols = [...filteredPcols, ...cdr3Pcols] as PColumn<TreeNodeAccessor>[];
    }
    return filteredPcols.map(
      (c) =>
        ({
          columnId: c.id,
          spec: c.spec,
        } satisfies PColumnIdAndSpec),
    );
  })

  .output('frequenciesHeatmapPf', (ctx): PFrameHandle | undefined => {
    const selectedChain = ctx.data.selectedChain ?? 'alpha';
    const outputName = selectedChain === 'alpha' ? 'mainAlphaFrequenciesPF' : 'mainBetaFrequenciesPF';
    let allPcols = ctx.outputs?.resolve(outputName)?.getPColumns();
    if (allPcols === undefined) {
      return undefined;
    }

    const subtypeLabel = selectedChain === 'alpha' ? 'clonotypeToSubsetAlpha' : 'clonotypeToSubsetBeta';
    const clonotypeToSubsetPcols = ctx.outputs?.resolve({ field: subtypeLabel, allowPermanentAbsence: true })?.getPColumns();
    if (clonotypeToSubsetPcols !== undefined) {
      allPcols = [...allPcols, ...clonotypeToSubsetPcols];
    }

    const robustAnyLabel = selectedChain === 'alpha' ? 'robustAnyAlpha' : 'robustAnyBeta';
    const robustAnyPcols = ctx.outputs?.resolve({ field: robustAnyLabel, allowPermanentAbsence: true })?.getPColumns();
    if (robustAnyPcols !== undefined) {
      allPcols = [...allPcols, ...robustAnyPcols];
    }

    return createPFrameForGraphs(ctx, allPcols);
  }, { withStatus: true })

  .output('frequenciesHeatmapPcols', (ctx) => {
    const selectedChain = ctx.data.selectedChain ?? 'alpha';
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

    const robustAnyLabel = selectedChain === 'alpha' ? 'robustAnyAlpha' : 'robustAnyBeta';
    const robustAnyPcols = ctx.outputs?.resolve({ field: robustAnyLabel, allowPermanentAbsence: true })?.getPColumns();

    let allCols = [...pCols, ...metadataCols];
    if (clonotypeToSubsetPcols !== undefined) {
      allCols = [...allCols, ...clonotypeToSubsetPcols];
    }
    if (robustAnyPcols !== undefined) {
      allCols = [...allCols, ...robustAnyPcols];
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
    const selectedChain = ctx.data.selectedChain ?? 'alpha';
    const outputName = selectedChain === 'alpha' ? 'topDegPFAlpha' : 'topDegPFBeta';
    const msaCols = ctx.outputs?.resolve(outputName)?.getPColumns();
    if (!msaCols) return undefined;

    const datasetRef = ctx.args.mainRef;
    if (datasetRef === undefined)
      return undefined;

    return createPFrameForGraphs(ctx, msaCols);
  })

  .title((ctx) => ctx.data.title ?? 'TCR Disco')

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

  .done();

export type BlockOutputs = InferOutputsType<typeof platforma>;
