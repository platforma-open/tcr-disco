import { isPlRef, type PlRef } from "@milaboratories/pl-model-common";
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
  requireRef("mainRef", mainRef);
  requireRef("contrastFactor", contrastFactor);
  requireStringArray("numerators", numerators);
  requireStringArray("denominators", denominators);
  requireRefArray("covariateRefs", covariateRefs);
  requireBoolean("findTcrAbPairs", findTcrAbPairs);
  requireString("pairingMetadataCol", pairingMetadataCol);
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

function requireStringArray(field: string, v: unknown): asserts v is string[] | undefined {
  if (v === undefined) return;
  if (!isArray(v) || !v.every(isString)) throw new Error(`'${field}' must be an array of strings.`);
}

// `isPlRef` is the SDK's own guard, so a reference is recognized the same way
// here as everywhere else. Ids are placeholders during the pre-flight check that
// runs before any block exists, so shape is all that can be checked.
function requireRef(field: string, v: unknown): asserts v is PlRef | undefined {
  if (v !== undefined && !isPlRef(v))
    throw new Error(`'${field}' must be a reference to a column.`);
}

function requireRefArray(field: string, v: unknown): asserts v is PlRef[] | undefined {
  if (v === undefined) return;
  if (!isArray(v) || !v.every(isPlRef))
    throw new Error(`'${field}' must be an array of references to columns.`);
}
