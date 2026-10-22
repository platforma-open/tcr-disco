import type { ColumnFrame } from "@platforma-open/milaboratories.tcrdisco-enrichment.model";
import type { ColumnUniversalId } from "@platforma-sdk/model";
import { deriveColumnValueOptions, PFrameImpl, pTableValue } from "@platforma-sdk/model";
import type { ShallowRef } from "vue";
import { shallowRef, watch } from "vue";

/** The distinct values of a picked column, as far as they are read. */
export type ColumnValuesState =
  | { readonly type: "loading" }
  /** The column is gone: a stored id may name a column its upstream block no longer produces. */
  | { readonly type: "absent" }
  | { readonly type: "read"; readonly values: string[] }
  | { readonly type: "failed"; readonly message: string };

/**
 * The distinct values of the picked `column`, read through the `source` the model gives for it.
 * `undefined` while no column is picked. Loading while the source is resolving or still describes
 * an earlier pick. Called from `setup`.
 */
export function useColumnValues(params: {
  source: () => ColumnFrame | undefined;
  column: () => ColumnUniversalId | undefined;
}): Readonly<ShallowRef<ColumnValuesState | undefined>> {
  const state = shallowRef<ColumnValuesState | undefined>();
  let request = 0;

  watch(
    // An output recomputed after its producer reruns keeps its object and changes the frame
    // inside it; copying it makes the read follow the frame.
    [params.column, () => copyOf(params.source())],
    ([column, source]) => {
      const current = ++request;
      if (column === undefined) {
        state.value = undefined;
        return;
      }
      if (source === undefined || source.column !== column || source.type === "resolving") {
        state.value = LOADING;
        return;
      }
      if (source.type === "absent") {
        state.value = ABSENT;
        return;
      }
      state.value = LOADING;
      readColumnValues(source).then(
        (values) => {
          if (current === request) state.value = { type: "read", values };
        },
        (error: unknown) => {
          if (current === request) state.value = { type: "failed", message: messageOf(error) };
        },
      );
    },
    { immediate: true },
  );

  return state;
}

/**
 * The distinct values of the column `source` holds, read in the UI through its frame, in natural
 * order ("R2" before "R10"). Missing and empty values are left out. Rejects when the column has
 * more distinct values than are read.
 */
export async function readColumnValues(
  source: Extract<ColumnFrame, { type: "present" }>,
): Promise<string[]> {
  const response = await new PFrameImpl(source.frame).getUniqueValues({
    columnId: source.frameColumn,
    filters: [],
    limit: VALUES_LIMIT,
  });
  if (response.overflow) {
    throw new Error(`The column has more than ${VALUES_LIMIT} distinct values`);
  }

  const values: string[] = [];
  for (let row = 0; row < response.values.data.length; row++) {
    const value = pTableValue(response.values, row, { na: null });
    if (value !== null) values.push(String(value));
  }
  return deriveColumnValueOptions(source.column, values).map((option) => option.label);
}

// Internals

/** More distinct values than a column of labels holds. */
const VALUES_LIMIT = 100_000;

const LOADING: ColumnValuesState = { type: "loading" };

const ABSENT: ColumnValuesState = { type: "absent" };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function copyOf<T extends object>(source: T | undefined): T | undefined {
  return source === undefined ? undefined : { ...source };
}
