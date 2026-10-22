import type {
  ColumnUniversalId,
  PColumn,
  PColumnDataUniversal,
  PColumnIdAndSpec,
  PFrameHandle,
  PObjectId,
  RelaxedColumnSelector,
  RenderCtxBase,
  StringMatcher,
  TreeNodeAccessor,
} from "@platforma-sdk/model";
import {
  ColumnRecipe,
  ColumnsCollection,
  deriveColumnOptions,
  extractPObjectId,
  isDataColumn,
} from "@platforma-sdk/model";

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
export function getInputOptions(): ColumnPickerOption[] {
  const columns = resultPool().filter({ include: TCR_ALPHA_ABUNDANCE });
  return toPickerOptions(
    deriveColumnOptions(columns, {
      includeNativeLabel: false,
      addLabelAsSuffix: true,
      forceTraceElements: [],
    }),
  );
}

/** Sample metadata columns of upstream blocks. */
export function getMetadataOptions(): ColumnPickerOption[] {
  return toPickerOptions(deriveColumnOptions(getMetadataCollection()));
}

/** Sample metadata columns of upstream blocks, as recipes. */
export function getMetadataColumns(): ColumnRecipe[] {
  return getMetadataCollection().getColumns();
}

/**
 * Columns of one of this block's outputs. `undefined` until the output is there and every column
 * of it has arrived.
 */
export function getOutputColumns(
  accessor: TreeNodeAccessor | undefined,
): ColumnsCollection | undefined {
  if (accessor === undefined) return undefined;
  const collection = ColumnsCollection([accessor]);
  return collection.isFinal() ? collection : undefined;
}

/** Upstream CDR3 amino-acid sequence columns keyed by a clonotype of the given chain at their first axis. */
export function getChainCdr3Columns(chain: "TCRAlpha" | "TCRBeta"): ColumnRecipe[] {
  return getAminoAcidSequenceColumns("CDR3").filter(
    (column) => column.getSpec().axesSpec[0]?.domain?.["pl7.app/vdj/chain"] === chain,
  );
}

/** Upstream V gene hit columns keyed by a clonotype of the given chain at their first axis. */
export function getChainVGeneColumns(chain: "TCRAlpha" | "TCRBeta"): ColumnRecipe[] {
  return resultPool()
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
  feature: "CDR3" | "VGene",
  runIds: ReadonlySet<string>,
): ColumnRecipe[] {
  const columns = getAminoAcidSequenceColumns(feature);
  if (runIds.size === 0) return columns;
  return columns.filter((column) =>
    runIds.has(column.getSpec().axesSpec[0]?.domain?.["pl7.app/vdj/clonotypingRunId"] ?? ""),
  );
}

/** Upstream label columns of bulk or single-cell clonotypes. */
export function getClonotypeLabelColumns(): ColumnRecipe[] {
  return resultPool()
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
export function hasBarcodeSource(): boolean {
  const legacyBarcodeColumns = resultPool().filter({
    include: {
      name: [exact(METADATA_COLUMN_NAME)],
      annotations: { "pl7.app/label": [exact("Barcode ID")] },
    },
  });
  if (!legacyBarcodeColumns.isEmpty()) return true;

  const firstRulesColumn = resultPool()
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

/**
 * Where the UI reads the values of a picked column from: a frame of the column alone, while the
 * column is there. `column` is the pick the frame was made for, so the UI can tell one that still
 * describes an earlier pick; `frameColumn` is the column as the frame holds it.
 */
export type ColumnFrame =
  | { readonly type: "resolving"; readonly column: ColumnUniversalId }
  /** The column is gone: a stored id may name a column its upstream block no longer produces. */
  | { readonly type: "absent"; readonly column: ColumnUniversalId }
  | {
      readonly type: "present";
      readonly column: ColumnUniversalId;
      readonly frame: PFrameHandle;
      readonly frameColumn: PObjectId;
    };

/** A frame of `column` alone, while the column and its frame are there. */
export function createColumnFrame(ctx: RenderCtxBase, column: ColumnUniversalId): ColumnFrame {
  const status = ColumnRecipe.getStatus(column);
  if (status !== "present") return { type: status, column };
  const frame = ctx.createPFrame([column]);
  if (frame === undefined) return { type: "resolving", column };
  // The frame holds a column by the bare id of its leaf.
  return { type: "present", column, frame, frameColumn: extractPObjectId(column) };
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

function resultPool(): ColumnsCollection {
  return ColumnsCollection(["result_pool"]);
}

function getMetadataCollection(): ColumnsCollection {
  return resultPool().filter({ include: { name: [exact(METADATA_COLUMN_NAME)] } });
}

function getAminoAcidSequenceColumns(feature: "CDR3" | "VGene"): ColumnRecipe[] {
  return resultPool()
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
