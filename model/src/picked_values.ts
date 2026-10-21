import type { ColumnUniversalId, ColumnValueOption, RenderCtxBase } from "@platforma-sdk/model";
import { deriveColumnValueOptions, readColumnValues } from "@platforma-sdk/model";
import { findColumn } from "./columns";

/** Options of the numerator and denominator pickers: the values of the contrast factor column. */
export type ContrastValueOptions = {
  /**
   * The contrast factor the options were built for: they describe the picks only while it stays
   * picked.
   */
  computedFor: ColumnUniversalId;
  options: ColumnValueOption[];
};

/** Whether the CD4/CD8 subset column holds CD4 or CD8 labels, read from its values. */
export type CdSubsetCheck = {
  /** The subset column the check was made for: it describes the pick only while it stays picked. */
  computedFor: ColumnUniversalId;
  result: CdSubsetCheckResult;
};

/**
 * The outcome of reading the subset column's values. A column whose values cannot be read now —
 * still resolving, not computed, gone, or not stored inline — leaves the check open.
 */
export type CdSubsetCheckResult =
  | { type: "unreadable" }
  | {
      type: "read";
      /** Whether any value is "CD4" or "CD8", in any letter case. */
      hasSubsets: boolean;
      /** The first values of the column, in natural order, to show when it has no subsets. */
      firstValues: string[];
    };

/**
 * Values of the contrast factor column as options of the numerator and denominator pickers, each
 * a column value id naming the contrast factor column, and through it the block that produced
 * the value. `undefined` until a contrast factor is picked. A column whose values cannot be read
 * now — still resolving, not computed, gone, or not stored inline — offers no values, so its
 * picks show as not available.
 */
export function getContrastValueOptions(
  ctx: RenderCtxBase,
  contrastFactor: ColumnUniversalId | undefined,
): ContrastValueOptions | undefined {
  if (contrastFactor === undefined) return undefined;
  return { computedFor: contrastFactor, options: readValueOptions(ctx, contrastFactor) ?? [] };
}

/** The CD4/CD8 check of the subset column. `undefined` until a subset column is picked. */
export function getCdSubsetCheck(
  ctx: RenderCtxBase,
  cdSubsetCol: ColumnUniversalId | undefined,
): CdSubsetCheck | undefined {
  if (cdSubsetCol === undefined) return undefined;
  const options = readValueOptions(ctx, cdSubsetCol);
  if (options === undefined) return { computedFor: cdSubsetCol, result: { type: "unreadable" } };
  const values = options.map((option) => option.label);
  return {
    computedFor: cdSubsetCol,
    result: {
      type: "read",
      hasSubsets: values.some((value) => SUBSET_LABELS.has(value.toLowerCase())),
      firstValues: values.slice(0, FIRST_VALUES_SHOWN),
    },
  };
}

// Internals

const SUBSET_LABELS = new Set(["cd4", "cd8"]);

const FIRST_VALUES_SHOWN = 5;

function readValueOptions(
  ctx: RenderCtxBase,
  columnId: ColumnUniversalId,
): ColumnValueOption[] | undefined {
  const column = findColumn(ctx, columnId);
  const entries = column === undefined ? undefined : readColumnValues(column);
  return entries === undefined ? undefined : deriveColumnValueOptions(entries);
}
