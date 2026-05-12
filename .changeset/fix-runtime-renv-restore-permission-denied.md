---
"@platforma-open/milaboratories.run-tcrdisco-enrichment.software": patch
---

Fix runtime `Permission denied` when the container runs as a non-root UID (MILAB-6263), and complete the renv lockfile.

The entrypoint re-invoked `renv::restore()` on every start, which tries to reconcile the system R library at `/usr/local/lib/R/site-library/` with the project lockfile. When the `r-base:4.4.2` base image preinstalled a version of a locked package (e.g. `rlang`) that differs from `renv.lock`, renv attempted to back up the system-library copy before replacing it — failing on hosts that run the container unprivileged. renv now installs into a project-local library at `/app/renv/library` and `R_LIBS_USER` points R at the same path, so the obsolete `/app/run.sh` wrapper and runtime restore are removed.

In addition, the lockfile was missing `DESeq2` and `optparse` — both loaded at the top of the R entry scripts. These are now pinned via `renv::snapshot()`, so the docker image can actually run the scripts (until now the docker path relied on these being preinstalled in the runenv, which isn't the case once the runtime restore is gone).
