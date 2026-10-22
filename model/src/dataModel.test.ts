import { kind } from "@platforma-open/milaboratories.tcrdisco-enrichment.kind";
import {
  createColumnValueId,
  createGlobalPObjectId,
  createPlDataTableStateV2,
  parseColumnValueId,
} from "@platforma-sdk/model";
import { describe, expect, test } from "vitest";
import { blockDataModel } from "./dataModel";

const ref = (blockId: string, name: string) => ({ __isRef: true, blockId, name });

const contrastColumn = createGlobalPObjectId("samples", "metadata.condition");

const storedAtV4 = {
  mainRef: ref("mixcr", "abundance"),
  cdRef: ref("annotation", "cd.score"),
  cdSubsetCol: ref("annotation", "cd.subset"),
  covariateRefs: [ref("samples", "metadata.donor")],
  contrastFactor: ref("samples", "metadata.condition"),
  pairingMetadataCol: "Pairing",
  numerators: ["day 7", "day 14", "day 7"],
  denominators: ["day 0", "1"],
  findTcrAbPairs: false,
  thresholdCounts: 10,
  thresholdSamples: 3,
  log2FcThreshold: 3,
  pAdjThreshold: 0.05,
  title: "Day 7 vs day 0",
  selectedChain: "beta",
  cdSubsetColValid: true,
  tableState: createPlDataTableStateV2(),
  graphState: { title: "Volcano plot", template: "dots" },
  graphStateBeta: { title: "Volcano plot", template: "dots" },
};

describe("v5 migration", () => {
  const { data } = blockDataModel.migrate({ version: "v4", data: storedAtV4 });

  test("refs to upstream outputs become their result-pool ids", () => {
    expect(data.mainRef).toBe(createGlobalPObjectId("mixcr", "abundance"));
    expect(data.covariateRefs).toEqual([createGlobalPObjectId("samples", "metadata.donor")]);
    expect(data.contrastFactor).toBe(contrastColumn);
    expect(data.cdRef).toBe(createGlobalPObjectId("annotation", "cd.score"));
    expect(data.cdSubsetCol).toBe(createGlobalPObjectId("annotation", "cd.subset"));
  });

  test("thresholds and view state are carried over unchanged", () => {
    const {
      mainRef: _mainRef,
      cdRef: _cdRef,
      cdSubsetCol: _cdSubsetCol,
      covariateRefs: _covariateRefs,
      contrastFactor: _contrastFactor,
      pairingMetadataCol: _pairingMetadataCol,
      numerators: _numerators,
      denominators: _denominators,
      ...unchanged
    } = storedAtV4;
    expect(data).toMatchObject(unchanged);
  });

  test("plain picks become value ids of the converted contrast factor, in order, repeats kept", () => {
    expect(data.numerators.map(parseColumnValueId)).toEqual([
      { __isColumnValue: true, column: contrastColumn, value: "day 7" },
      { __isColumnValue: true, column: contrastColumn, value: "day 14" },
      { __isColumnValue: true, column: contrastColumn, value: "day 7" },
    ]);
  });

  test("a number in text stays text", () => {
    expect(data.denominators.map((id) => parseColumnValueId(id).value)).toEqual(["day 0", "1"]);
  });

  test("a pick stored as a number becomes its decimal text", () => {
    const migrated = blockDataModel.migrate({
      version: "v4",
      data: { ...storedAtV4, numerators: [7, 0.5], denominators: [0] },
    }).data;
    expect(migrated.numerators.map((id) => parseColumnValueId(id).value)).toEqual(["7", "0.5"]);
    expect(migrated.denominators.map((id) => parseColumnValueId(id).value)).toEqual(["0"]);
  });

  test("the pairing column, a label, is dropped", () => {
    expect(data.pairingMetadataCol).toBeUndefined();
  });

  test("the migrated picks are what the kind accepts", () => {
    const { mainRef, contrastFactor, numerators, denominators, covariateRefs } = data;
    expect(() =>
      kind.parseInitializationParams({
        mainRef,
        contrastFactor,
        numerators,
        denominators,
        covariateRefs,
      }),
    ).not.toThrow();
  });

  test("a pick already stored as a value id is kept as is", () => {
    const picked = createColumnValueId({ column: contrastColumn, value: "day 7" });
    const migrated = blockDataModel.migrate({
      version: "v4",
      data: { ...storedAtV4, numerators: [picked, "day 14"] },
    }).data;
    expect(migrated.numerators).toEqual([
      picked,
      createColumnValueId({ column: contrastColumn, value: "day 14" }),
    ]);
  });

  test("without a contrast factor the plain picks are dropped", () => {
    const { contrastFactor: _, ...withoutColumn } = storedAtV4;
    const migrated = blockDataModel.migrate({ version: "v4", data: withoutColumn }).data;
    expect(migrated.contrastFactor).toBeUndefined();
    expect(migrated.numerators).toEqual([]);
    expect(migrated.denominators).toEqual([]);
  });
});

describe("data saved before v4", () => {
  test("reaches the column ids through the v5 migration", () => {
    const { data } = blockDataModel.migrate({ version: "v3", data: storedAtV4 });
    expect(data.mainRef).toBe(createGlobalPObjectId("mixcr", "abundance"));
    expect(data.contrastFactor).toBe(contrastColumn);
    expect(data.numerators.map((id) => parseColumnValueId(id).value)).toEqual([
      "day 7",
      "day 14",
      "day 7",
    ]);
    expect(data.pairingMetadataCol).toBeUndefined();
  });
});
