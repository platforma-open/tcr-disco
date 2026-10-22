import type {
  ColumnRecipe,
  ColumnUniversalId,
  PColumn,
  PColumnDataUniversal,
  PColumnIdAndSpec,
  RelaxedColumnSelector,
  RenderCtxBase,
  StringMatcher,
  TreeNodeAccessor,
} from "@platforma-sdk/model";
import { ColumnsCollection, deriveColumnOptions, isDataColumn } from "@platforma-sdk/model";

/** A column offered in a column picker, by its result-pool id. */
export type ColumnPickerOption = {
  value: ColumnUniversalId;
  label: string;
};

/**
 * TCR alpha abundance columns of upstream blocks the analysis can take: raw counts per sample
 * (the first of exactly two axes) and alpha-chain clonotype. The beta chain of the same
 * clonotyping run is found by the workflow.
 */
export function getInputOptions(ctx: RenderCtxBase): ColumnPickerOption[] {
  const columns = resultPool(ctx).filter({ include: TCR_ALPHA_ABUNDANCE });
  return toPickerOptions(
    deriveColumnOptions(columns, {
      includeNativeLabel: false,
      addLabelAsSuffix: true,
      forceTraceElements: [],
    }),
  );
}

/** Sample metadata columns of upstream blocks. */
export function getMetadataOptions(ctx: RenderCtxBase): ColumnPickerOption[] {
  return toPickerOptions(deriveColumnOptions(getMetadataCollection(ctx)));
}

/** Sample metadata columns of upstream blocks, as recipes. */
export function getMetadataColumns(ctx: RenderCtxBase): ColumnRecipe[] {
  return getMetadataCollection(ctx).getColumns();
}

/**
 * Columns of one of this block's outputs. `undefined` until the output is there and every column
 * of it has arrived.
 */
export function getOutputColumns(
  ctx: RenderCtxBase,
  accessor: TreeNodeAccessor | undefined,
): ColumnsCollection | undefined {
  if (accessor === undefined) return undefined;
  const collection = ColumnsCollection([accessor], { ctx: ctx.ctx });
  return collection.isFinal() ? collection : undefined;
}

/** Upstream CDR3 amino-acid sequence columns keyed by a clonotype of the given chain at their first axis. */
export function getChainCdr3Columns(
  ctx: RenderCtxBase,
  chain: "TCRAlpha" | "TCRBeta",
): ColumnRecipe[] {
  return getAminoAcidSequenceColumns(ctx, "CDR3").filter(
    (column) => column.getSpec().axesSpec[0]?.domain?.["pl7.app/vdj/chain"] === chain,
  );
}

/** Upstream V gene hit columns keyed by a clonotype of the given chain at their first axis. */
export function getChainVGeneColumns(
  ctx: RenderCtxBase,
  chain: "TCRAlpha" | "TCRBeta",
): ColumnRecipe[] {
  return resultPool(ctx)
    .filter({
      include: {
        name: [exact("pl7.app/vdj/geneHit")],
        domain: { "pl7.app/vdj/reference": [exact("VGene")] },
      },
    })
    .getColumns()
    .filter((column) => column.getSpec().axesSpec[0]?.domain?.["pl7.app/vdj/chain"] === chain);
}

/**
 * Upstream amino-acid sequence columns of one feature whose first axis belongs to one of the
 * given clonotyping runs; of every run when none is given.
 */
export function getRunSequenceColumns(
  ctx: RenderCtxBase,
  feature: "CDR3" | "VGene",
  runIds: ReadonlySet<string>,
): ColumnRecipe[] {
  const columns = getAminoAcidSequenceColumns(ctx, feature);
  if (runIds.size === 0) return columns;
  return columns.filter((column) =>
    runIds.has(column.getSpec().axesSpec[0]?.domain?.["pl7.app/vdj/clonotypingRunId"] ?? ""),
  );
}

/** Upstream label columns of bulk or single-cell clonotypes. */
export function getClonotypeLabelColumns(ctx: RenderCtxBase): ColumnRecipe[] {
  return resultPool(ctx)
    .filter({
      include: {
        name: [exact("pl7.app/label")],
        axes: [{ name: [exact(CLONOTYPE_KEY), exact(SC_CLONOTYPE_KEY)] }],
        partialAxesMatch: true,
      },
    })
    .getColumns();
}

/**
 * Whether a legacy "Barcode ID" metadata column relates the samples of different chains, or
 * the first multiplexing rules column carries a single barcode tag the workflow can build one
 * from.
 */
export function hasBarcodeSource(ctx: RenderCtxBase): boolean {
  const legacyBarcodeColumns = resultPool(ctx).filter({
    include: {
      name: [exact(METADATA_COLUMN_NAME)],
      annotations: { "pl7.app/label": [exact("Barcode ID")] },
    },
  });
  if (!legacyBarcodeColumns.isEmpty()) return true;

  const firstRulesColumn = resultPool(ctx)
    .filter({ include: { name: [exact("pl7.app/sequencing/multiplexingRules")] } })
    .getColumns()[0];
  if (firstRulesColumn === undefined) return false;
  const tagsJson = firstRulesColumn.getSpec().annotations?.["pl7.app/sequencing/barcodeTags"];
  if (typeof tagsJson !== "string") return false;
  try {
    const tags: unknown = JSON.parse(tagsJson);
    return Array.isArray(tags) && tags.length === 1;
  } catch {
    return false;
  }
}

/**
 * Columns as the `PColumn`s graph frames are built from. Only plain stored columns have that
 * form; data still on its way stays `undefined`.
 */
export function toPColumns(columns: ColumnRecipe[]): PColumn<undefined | PColumnDataUniversal>[] {
  return columns
    .filter(isDataColumn)
    .map((column) => ({ id: column.id, spec: column.getSpec(), data: column.getData() }));
}

/** Ids and specs of plain stored columns, as the graph default options are picked from. */
export function toIdsAndSpecs(columns: ColumnRecipe[]): PColumnIdAndSpec[] {
  return columns
    .filter(isDataColumn)
    .map((column) => ({ columnId: column.id, spec: column.getSpec() }));
}

/** An exact string matcher for a selector. */
export function exact(value: string): StringMatcher {
  return { type: "exact", value };
}

// Internals

const METADATA_COLUMN_NAME = "pl7.app/metadata";

const CLONOTYPE_KEY = "pl7.app/vdj/clonotypeKey";

const SC_CLONOTYPE_KEY = "pl7.app/vdj/scClonotypeKey";

const TCR_ALPHA_ABUNDANCE: RelaxedColumnSelector = {
  axes: [
    { name: [exact("pl7.app/sampleId")] },
    { domain: { "pl7.app/vdj/chain": [exact("TCRAlpha")] } },
  ],
  partialAxesMatch: false,
  annotations: {
    "pl7.app/isAbundance": [exact("true")],
    "pl7.app/abundance/normalized": [exact("false")],
    "pl7.app/abundance/isPrimary": [exact("true")],
  },
};

function resultPool(ctx: RenderCtxBase): ColumnsCollection {
  return ColumnsCollection(["result_pool"], { ctx: ctx.ctx });
}

function getMetadataCollection(ctx: RenderCtxBase): ColumnsCollection {
  return resultPool(ctx).filter({ include: { name: [exact(METADATA_COLUMN_NAME)] } });
}

function getAminoAcidSequenceColumns(
  ctx: RenderCtxBase,
  feature: "CDR3" | "VGene",
): ColumnRecipe[] {
  return resultPool(ctx)
    .filter({
      include: {
        name: [exact("pl7.app/vdj/sequence")],
        domain: {
          "pl7.app/alphabet": [exact("aminoacid")],
          "pl7.app/vdj/feature": [exact(feature)],
        },
      },
    })
    .getColumns();
}

function toPickerOptions(
  options: { id: ColumnUniversalId; label: string }[],
): ColumnPickerOption[] {
  return options.map(({ id, label }) => ({ value: id, label }));
}
