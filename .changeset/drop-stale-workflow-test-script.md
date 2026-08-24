---
"@platforma-open/milaboratories.tcrdisco-enrichment.workflow": patch
"@platforma-open/milaboratories.tcrdisco-enrichment": patch
---

Drop the stale `test` script from the workflow package, which failed CI with `sh: 1: vitest: not found`.

The script survived the structurer migration, but `vitest` is centralized in the `test` package and is not a workflow dependency. The workflow has no test files, so the canonical end-state for it is no `test` script at all; the `test` package keeps running `vitest run --passWithNoTests`.
