import type { ColumnUniversalId, ColumnValueOptionsModel } from "@platforma-sdk/model";
import { readColumnValueOptions } from "@platforma-sdk/model";
import type { ShallowRef } from "vue";
import { shallowRef, watch } from "vue";

/** The distinct values of a picked column, as far as they are read. */
export type ColumnValuesState =
  | { readonly type: "loading" }
  | { readonly type: "read"; readonly values: string[] }
  | { readonly type: "failed"; readonly message: string };

/**
 * The distinct values of the picked `column`, read through the `source` the model gives for it,
 * in natural order ("R2" before "R10"). `undefined` while no column is picked or once it is gone:
 * its picker shows a gone column as not available. Loading while the source is resolving or still
 * describes an earlier pick. Called from `setup`.
 */
export function useColumnValues(params: {
  source: () => ColumnValueOptionsModel | undefined;
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
      if (source === undefined || source.valueColumn !== column || source.type === "resolving") {
        state.value = LOADING;
        return;
      }
      if (source.type === "absent") {
        state.value = undefined;
        return;
      }
      state.value = LOADING;
      readColumnValueOptions(source).then(
        (options) => {
          if (current === request) {
            state.value = { type: "read", values: options.map((option) => option.label) };
          }
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

// Internals

const LOADING: ColumnValuesState = { type: "loading" };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function copyOf<T extends object>(source: T | undefined): T | undefined {
  return source === undefined ? undefined : { ...source };
}
