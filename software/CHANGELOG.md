# @platforma-open/milaboratories.run-tcrdisco-enrichment.software

## 1.3.0

### Minor Changes

- 66f209d: Enriched-clonotypes heatmap: log-transformed blue-red frequency map with CDR3 + V-gene Y labels, ranked by a per-clonotype "Mean numerator frequency" — the mean of the clonotype's per-replicate fraction over the numerator replicates where it is present.

  Per-chain state for the volcano plot and the enriched-clonotypes heatmap: alpha and beta keep independent chart state, so a custom data-mapping on one chain no longer becomes inconsistent after switching to the other. Both charts also precompute per-chain pFrames/columns, so switching chains does not trigger a model recompute.

### Patch Changes

- 6ae7506: Prune `renv.lock` from 196 packages to the 57-package runtime closure of the three packages the R scripts actually load (`optparse`, `jsonlite`, `DESeq2`).

  The lock was copied in from an upstream project at scaffold time and only ever added to, never pruned. The 139 removed packages were unreachable dev tooling — `devtools`, the tidyverse metapackage, `shiny`, `rmarkdown`, the git clients, and `tcrgrapher` (no longer referenced by any script). Several were among the slowest source compiles in the image (`sass`, `httpuv`, `ragg`/`systemfonts`/`textshaping`, `data.table`, `edgeR`), so the docker `renv::restore()` layer — 1419 s of a 1473 s cold build — shrinks accordingly.

  Retained package versions are unchanged; the new lock is a strict subset of the old one. No behavior change.

## 1.2.1

### Patch Changes

- c41f0b3: Fix runtime `Permission denied` when the container runs as a non-root UID (MILAB-6263), and complete the renv lockfile.

  The entrypoint re-invoked `renv::restore()` on every start, which tries to reconcile the system R library at `/usr/local/lib/R/site-library/` with the project lockfile. When the `r-base:4.4.2` base image preinstalled a version of a locked package (e.g. `rlang`) that differs from `renv.lock`, renv attempted to back up the system-library copy before replacing it — failing on hosts that run the container unprivileged. renv now installs into a project-local library at `/app/renv/library` and `R_LIBS_USER` points R at the same path, so the obsolete `/app/run.sh` wrapper and runtime restore are removed.

  In addition, the lockfile was missing `DESeq2` and `optparse` — both loaded at the top of the R entry scripts. These are now pinned via `renv::snapshot()`, so the docker image can actually run the scripts (until now the docker path relied on these being preinstalled in the runenv, which isn't the case once the runtime restore is gone).

## 1.2.0

### Minor Changes

- 7cb8720: Include feature to always show all samples in plots
- abc392c: New changeset

## 1.1.1

### Patch Changes

- c4d0ead: Allow empty inputs

## 1.1.0

### Minor Changes

- ede2472: First block version
