import { kind } from "@platforma-open/milaboratories.tcrdisco-enrichment.kind";
import {
  createColumnValueId,
  createGlobalPObjectId,
  parseColumnValueId,
} from "@platforma-sdk/model";
import { describe, expect, test } from "vitest";
import { blockDataModel } from "./dataModel";

const ref = (blockId: string, name: string) => ({ __isRef: true, blockId, name });

const contrastColumn = createGlobalPObjectId("samples", "metadata.condition");

const storedAtV4 = {
  mainRef: ref("mixcr", "abundance"),
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
  graphState: { title: "Volcano plot", template: "dots" },
  graphStateBeta: { title: "Volcano plot", template: "dots" },
};

describe("v5 migration", () => {
  const { data } = blockDataModel.migrate({ version: "v4", data: storedAtV4 });

  test("refs to upstream outputs become their result-pool ids", () => {
    expect(data.mainRef).toBe(createGlobalPObjectId("mixcr", "abundance"));
    expect(data.covariateRefs).toEqual([createGlobalPObjectId("samples", "metadata.donor")]);
    expect(data.contrastFactor).toBe(contrastColumn);
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
