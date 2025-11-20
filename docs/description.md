# Overview

Calculates differential abundances of clonotypes for both TCR Alpha and Beta chains between conditions to identify clonotypes that are significantly enriched or depleted across experimental groups. The block takes clonotype count data from VDJ processing blocks as input and performs statistical testing to determine which clonotypes show significant changes in abundance between conditions, accounting for biological variability and library size differences.

The block uses [DESeq2](https://bioconductor.org/packages/release/bioc/html/DESeq2.html) v1.46.0 for differential abundance analysis. DESeq2 uses a local regression fit (instead of the default parametric fit) to estimate dispersion parameters, which is optimized for sparse count distributions typical of clonotype data where many clonotypes have zero or very low counts across samples. This local fit adapts to the actual relationship between mean counts and variability in the data, rather than assuming a fixed parametric form.

The block can also correlate differentially abundant clonotypes' frequencies and annotate them to CD4/CD8 cell types, providing additional context for interpreting the results. The generated differential abundance lists can be used by other downstream blocks for further analysis and visualization.

When using this block in your research, cite the DESeq2 publication (Love et al. 2014) listed below.

> Love, M. I., Huber, W., & Anders, S. (2014). Moderated estimation of fold change and dispersion for RNA-seq data with DESeq2. _Genome Biology_ **15**, 550 (2014). [https://doi.org/10.1186/s13059-014-0550-8](https://doi.org/10.1186/s13059-014-0550-8)



