import {
  BlockStorageFacadeCallbacks,
  createBlockStorage,
  createColumnValueId,
  createGlobalPObjectId,
  stringifyJson,
} from "@platforma-sdk/model";
import { beforeAll, describe, expect, test } from "vitest";

const callbackRegistry: Record<string, (storageJson: string) => unknown> = {};

beforeAll(async () => {
  Object.assign(globalThis, { cfgRenderCtx: { callbackRegistry } });
  await import("./index");
});

const main = createGlobalPObjectId("mixcr", "abundance.alpha");
const cdDataset = createGlobalPObjectId("mixcr-cd", "abundance.alpha");
const cdSubsetCol = createGlobalPObjectId("samples", "metadata.subset");
const condition = createGlobalPObjectId("samples", "metadata.condition");
const day7 = createColumnValueId({ column: condition, value: "day 7" });
const day0 = createColumnValueId({ column: condition, value: "day 0" });

const configured = {
  mainRef: main,
  covariateRefs: [condition],
  contrastFactor: condition,
  numerators: [day7],
  denominators: [day0],
  findTcrAbPairs: false,
  thresholdCounts: 10,
  thresholdSamples: 3,
  log2FcThreshold: 3,
  pAdjThreshold: 0.05,
  cdSubsetColValid: false,
};

describe("args issues", () => {
  test("a configured comparison derives runnable args", () => {
    expect(deriveArgs(configured)).toMatchObject({
      value: { mainRef: main, contrastFactor: condition, numerators: [day7], denominators: [day0] },
      issues: [],
    });
  });

  test("a CD4/CD8 dataset with a subset column holding CD4 or CD8 values is runnable", () => {
    const data = { ...configured, cdRef: cdDataset, cdSubsetCol, cdSubsetColValid: true };
    expect(deriveArgs(data)).toMatchObject({
      value: { cdRef: cdDataset, cdSubsetCol },
      issues: [],
    });
  });

  test.for([
    {
      why: "no main dataset",
      data: { ...configured, mainRef: undefined },
      message: "Main dataset is required",
    },
    {
      why: "no contrast factor",
      data: { ...configured, contrastFactor: undefined },
      message: "Contrast factor is required",
    },
    {
      why: "no numerator",
      data: { ...configured, numerators: [] },
      message: "Select at least one numerator",
    },
    {
      why: "no denominator",
      data: { ...configured, denominators: [] },
      message: "Select at least one denominator",
    },
    {
      why: "a CD4/CD8 dataset without a subset column",
      data: { ...configured, cdRef: cdDataset, cdSubsetColValid: true },
      message: "Selected CD4/CD8 subset column must contain CD4 or CD8 values",
    },
    {
      why: "a CD4/CD8 subset column without CD4 or CD8 values",
      data: { ...configured, cdRef: cdDataset, cdSubsetCol, cdSubsetColValid: false },
      message: "Selected CD4/CD8 subset column must contain CD4 or CD8 values",
    },
    {
      why: "no min UMI counts",
      data: { ...configured, thresholdCounts: undefined },
      message: "Min UMI counts is required",
    },
    {
      why: "no min replicates",
      data: { ...configured, thresholdSamples: undefined },
      message: "Min replicates is required",
    },
    {
      why: "no log2(FC) threshold",
      data: { ...configured, log2FcThreshold: undefined },
      message: "Log2(FC) threshold is required",
    },
    {
      why: "no adjusted p-value threshold",
      data: { ...configured, pAdjThreshold: undefined },
      message: "Adjusted p-value threshold is required",
    },
  ])("$why: the args still derive, and Run is blocked with its message", ({ data, message }) => {
    expect(deriveArgs(data)).toMatchObject({
      error: message,
      args: { findTcrAbPairs: false },
      issues: [{ severity: "error", message }],
    });
  });

  test("a subset column left picked after the CD4/CD8 dataset is removed does not block Run", () => {
    const data = { ...configured, cdSubsetCol, cdSubsetColValid: false };
    expect(deriveArgs(data)).toMatchObject({ issues: [] });
  });

  test("without a pairing metadata column the block is runnable", () => {
    const data = { ...configured, findTcrAbPairs: true };
    expect(deriveArgs(data)).toMatchObject({ value: { findTcrAbPairs: true }, issues: [] });
  });
});

// Internals

function deriveArgs(data: unknown): unknown {
  const derive = callbackRegistry[BlockStorageFacadeCallbacks.ArgsDerive];
  if (derive === undefined) throw new Error("The args derive callback is not registered");
  return derive(stringifyJson(createBlockStorage(data)));
}
