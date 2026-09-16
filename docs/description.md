# Overview

The Miltenyi TCR Disco block calculates differential abundance of TCR α/β clonotypes across experimental conditions to identify clonotypes that are significantly enriched or depleted. The block uses clonotype count data obtained from V(D)J clonotyping blocks and applies statistical tests to identify significant changes in clonotype abundance while accounting for biological variability and differences in library size.  
Differentially abundant clonotypes can be correlated based on their abundance patterns and annotated to CD4/CD8 T-cell populations to provide additional biological context.

Uniquely, the block also enables computational pairing of TCRα and TCRβ chains for detected differentially abundant clonotypes.

The resulting differential abundance tables can be used by other downstream blocks for further analysis and visualization.

The block uses DESeq2 for differential abundance analysis. DESeq2 uses local regression fit (instead of the default parametric fit) to estimate dispersion parameters. This local fit adapts to the actual relationship between mean counts and variability in the data, rather than assuming a fixed parametric form.

When using this block in your research, cite the DESeq2 publication (Love et al. 2014) and Egorov et al. (2025) listed below:

> Love, M. I., Huber, W., & Anders, S. (2014). Moderated estimation of fold change and dispersion for RNA-seq data with DESeq2. _Genome Biology_ **15**, 550 (2014). [https://doi.org/10.1186/s13059-014-0550-8](https://doi.org/10.1186/s13059-014-0550-8)
>
> Egorov, E.S., Kriukova, V.V., Shagina, I.A., ..., Serebrovskaya, E.O. (2025). Discovery of rare antigen-specific TCRs via replicate profiling. _bioRxiv_ 2025.09.30.675572. [https://doi.org/10.1101/2025.09.30.675572](https://doi.org/10.1101/2025.09.30.675572)



