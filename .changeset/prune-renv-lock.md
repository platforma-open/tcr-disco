---
"@platforma-open/milaboratories.run-tcrdisco-enrichment.software": patch
"@platforma-open/milaboratories.tcrdisco-enrichment": patch
---

Prune `renv.lock` from 196 packages to the 57-package runtime closure of the three packages the R scripts actually load (`optparse`, `jsonlite`, `DESeq2`).

The lock was copied in from an upstream project at scaffold time and only ever added to, never pruned. The 139 removed packages were unreachable dev tooling — `devtools`, the tidyverse metapackage, `shiny`, `rmarkdown`, the git clients, and `tcrgrapher` (no longer referenced by any script). Several were among the slowest source compiles in the image (`sass`, `httpuv`, `ragg`/`systemfonts`/`textshaping`, `data.table`, `edgeR`), so the docker `renv::restore()` layer — 1419 s of a 1473 s cold build — shrinks accordingly.

Retained package versions are unchanged; the new lock is a strict subset of the old one. No behavior change.
