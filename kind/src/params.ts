import {
  isColumnUniversalId,
  isColumnValueId,
  type ColumnUniversalId,
  type ColumnValueId,
} from "@milaboratories/pl-model-common";
import { assertParamsObject } from "@platforma-sdk/block-kind";
import { isBoolean, isString } from "es-toolkit";
import { isArray, isNumber } from "es-toolkit/compat";
import type { BlockParams } from "./types";

/**
 * The contract at runtime, for params that arrive from a template file rather
 * than from typed code — the only point that can catch a hand-written entry
 * being wrong.
 *
 * Plain TypeScript, no schema library: the checks are held to the contract by the
 * return type, so a field the contract requires cannot be left unread. Keys the
 * contract does not name need no rejection — they are dropped by never being
 * read, and a params shape from another version of the kind is caught by the
 * version in the entry's `{name}@{selector}` reference instead.
 *
 * Messages are finished sentences: they are reported against the template entry
 * that carried the params, to whoever wrote it.
 */
export function parseInitializationParams(value: unknown): BlockParams {
  assertParamsObject(value);

  const {
    title,
    mainRef,
    contrastFactor,
    numerators,
    denominators,
    covariateRefs,
    findTcrAbPairs,
    pairingMetadataCol,
    thresholdCounts,
    thresholdSamples,
    log2FcThreshold,
    pAdjThreshold,
  } = value;

  requireString("title", title);
  requireColumn("mainRef", mainRef);
  requireColumn("contrastFactor", contrastFactor);
  requireColumnValueArray("numerators", numerators);
  requireColumnValueArray("denominators", denominators);
  requireColumnArray("covariateRefs", covariateRefs);
  requireBoolean("findTcrAbPairs", findTcrAbPairs);
  requireColumn("pairingMetadataCol", pairingMetadataCol);
  requireCount("thresholdCounts", thresholdCounts);
  requireCount("thresholdSamples", thresholdSamples);
  requireNonNegative("log2FcThreshold", log2FcThreshold);
  requireProbability("pAdjThreshold", pAdjThreshold);

  return {
    title,
    mainRef,
    contrastFactor,
    numerators,
    denominators,
    covariateRefs,
    findTcrAbPairs,
    pairingMetadataCol,
    thresholdCounts,
    thresholdSamples,
    log2FcThreshold,
    pAdjThreshold,
  };
}

// An absent field is always allowed — every param is optional, and the block's
// own default takes over. Each guard therefore narrows only what is present.

function requireString(field: string, v: unknown): asserts v is string | undefined {
  if (v !== undefined && !isString(v)) throw new Error(`'${field}' must be a string.`);
}

function requireBoolean(field: string, v: unknown): asserts v is boolean | undefined {
  if (v !== undefined && !isBoolean(v)) throw new Error(`'${field}' must be true or false.`);
}

function requireNumber(field: string, v: unknown): asserts v is number | undefined {
  if (v !== undefined && (!isNumber(v) || !Number.isFinite(v)))
    throw new Error(`'${field}' must be a number.`);
}

function requireNonNegative(field: string, v: unknown): asserts v is number | undefined {
  requireNumber(field, v);
  if (v !== undefined && v < 0) throw new Error(`'${field}' must not be negative.`);
}

/**
 * A sample or read count: whole and not negative.
 */
function requireCount(field: string, v: unknown): asserts v is number | undefined {
  requireNumber(field, v);
  if (v !== undefined && (!Number.isInteger(v) || v < 0))
    throw new Error(`'${field}' must be a whole number of zero or more.`);
}

function requireProbability(field: string, v: unknown): asserts v is number | undefined {
  requireNumber(field, v);
  if (v !== undefined && (v <= 0 || v > 1))
    throw new Error(`'${field}' must be greater than 0 and at most 1.`);
}

// The groups being compared are values of the contrast factor column, so any value
// the user's metadata holds is legal -- only the column value id form is checked. A
// value the column no longer holds stays picked and is shown as not available.
function requireColumnValueArray(
  field: string,
  v: unknown,
): asserts v is ColumnValueId[] | undefined {
  if (v === undefined) return;
  if (!isArray(v) || !v.every(isColumnValueId))
    throw new Error(`'${field}' must be an array of column values, written as column value ids.`);
}

// `isColumnUniversalId` is the SDK's own guard, so a column is recognized the same
// way here as everywhere else. Ids are placeholders during the pre-flight check that
// runs before any block exists, so shape is all that can be checked.
function requireColumn(field: string, v: unknown): asserts v is ColumnUniversalId | undefined {
  if (v !== undefined && !isColumnUniversalId(v))
    throw new Error(`'${field}' must be an upstream column, written as a column id.`);
}

function requireColumnArray(
  field: string,
  v: unknown,
): asserts v is ColumnUniversalId[] | undefined {
  if (v === undefined) return;
  if (!isArray(v) || !v.every(isColumnUniversalId))
    throw new Error(`'${field}' must be an array of upstream columns, written as column ids.`);
}
