# Overview

TCRdisco Enrichment calculates differential abundances (DA) of clonotypes of both TCR Alpha and Beta chains between conditions using [DESeq2](https://bioconductor.org/packages/release/bioc/html/DESeq2.html) v1.46.0 with local fit. It also can correlate differentially abundant clonotypes' frequencies and annotate them to CD4/CD8 cell types. The block takes the outputs of VDJ processing blocks as input. It then generates DA lists as outputs that can be used by other downstream blocks. 

Please cite:
- *doi: [10.1186/s13059-014-0550-8](https://doi.org/10.1186/s13059-014-0550-8)*



