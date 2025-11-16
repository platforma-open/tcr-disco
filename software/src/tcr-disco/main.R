#!/usr/bin/env Rscript

# Load required libraries
suppressMessages(library("DESeq2"))
suppressMessages(library("optparse"))
#----------------------------------------

# Required functions
# 1.  *run DESeq2*
run_deseq = function(main_table, covariates_table, contrast_col,
  numerator, denominator, output_folder, fraction_for_filter, min_counts, threshold_counts,
  fdr_cut, fc_cut) {

  # Aggregate counts by internalSampleId and clonotypeKey
  # Use clonotypeKey first to match group_by order
  aggregated <- aggregate(count ~ clonotypeKey + internalSampleId, 
                          data = main_table, FUN = sum)
  
  # Get unique values in the order they first appear in aggregated (matches group_by + summarise order)
  unique_clonotypes <- unique(aggregated$clonotypeKey)
  unique_samples <- unique(aggregated$internalSampleId)
  
  # Create matrix with proper dimensions and fill with 0
  count_matrix <- matrix(0, 
                        nrow = length(unique_clonotypes), 
                        ncol = length(unique_samples),
                        dimnames = list(unique_clonotypes, unique_samples))
  
  # Fill matrix with aggregated values using match for efficiency
  row_indices <- match(aggregated$clonotypeKey, unique_clonotypes)
  col_indices <- match(aggregated$internalSampleId, unique_samples)
  count_matrix[cbind(row_indices, col_indices)] <- aggregated$count
  
  # Ensure it's a numeric matrix
  count_matrix <- as.matrix(count_matrix)
  count_matrix[is.na(count_matrix)] <- 0

  # Apply filter by low counts (at least filter by values in one sample)
  # Filters prior to DE analysis to have minimum data quality
  min_samples <- max(floor(ncol(count_matrix) * fraction_for_filter), 1)
  count_matrix <- count_matrix[rowSums(count_matrix >= min_counts) >= min_samples, ]
  # For differentialclonotype abundance we add 1 as minimum clonotype count (after filtering)
  count_matrix <- count_matrix + 1
  # Hence update user provided threshold
  threshold_counts <- threshold_counts + 1

  # @TODO: add default value instead of sample, user might have this column name alreadu
  covariates_table[, "internalSampleId"] = covariates_table[, "Sample"]
  rownames(covariates_table) <- covariates_table$internalSampleId

  # Prepare DESeq2 dataset
  metadta_short <- covariates_table[,c(contrast_col, "replicate")]
  metadta_short <- metadta_short[colnames(count_matrix),]
  set.seed(42)
  dds <- DESeqDataSetFromMatrix(
    countData = count_matrix,
    colData = metadta_short,
    design = as.formula(paste("~", paste(colnames(metadta_short), collapse = " + ")))
  )
  dds <- DESeq(dds, fitType = "local")

  # Extract topTable
  res <- results(dds, contrast = c(make.names(contrast_col), numerator, denominator))
  res_df <- as.data.frame(res)

  # Tidy table
  res_df["clonotypeKey"] <- rownames(res_df)
  res_df$minlog10padj <- -log10(res_df$padj)
  res_df$minlog10padj[is.na(res_df$minlog10padj)] <- NA

  # Add regulation direction
  res_df$Regulation <- ifelse(res_df$log2FoldChange >= fc_cut, "Up",
    ifelse(res_df$log2FoldChange <= -fc_cut,
      "Down", "NS"
    )
  )

  # Apply threshold filter: set Regulation to NS for clonotypes that don't pass threshold
  # Check if clonotype has at least threshold_counts in at least threshold_samples samples
  passing_clonotypes <- rownames(count_matrix)[rowSums(count_matrix >= threshold_counts) >= threshold_samples]
  res_df$Regulation[!res_df$clonotypeKey %in% passing_clonotypes] <- "NS"

  # Reorder columns
  res_df <- res_df[, c(
    "clonotypeKey", "Regulation",
    setdiff(colnames(res_df), c(
      "clonotypeKey",
      "Regulation"
    ))
  )]

  # Add contrast column
  contrast_label <- paste0(numerator, " vs ", denominator)
  res_df$Contrast <- contrast_label
  # Add numerator column
  res_df$Numerator <- numerator

  # # Save topTable as csv
  # write.csv(res_df, paste0(output_folder, "/topTable.csv"), row.names = FALSE)
  # cat("Full results saved to", paste0(output_folder, "/topTable.csv"), "\n")


  # Filter DEGs with adjusted p-value < p_threshold and absolute log2FoldChange > fc_cut
  # Also filter by threshold: only keep clonotypes that pass threshold criteria
  deg_df <- res_df[
    res_df$padj <= fdr_cut & abs(res_df$log2FoldChange) >= fc_cut & res_df$clonotypeKey %in% passing_clonotypes,
    c("clonotypeKey", "Contrast", "log2FoldChange", "Regulation", "Numerator")
  ]
  # Filter out counts without ID
  deg_df <- deg_df[!is.na(deg_df["clonotypeKey"]), ]

  # # Save DEC as csv
  # write.csv(deg_df, paste0(output_folder, "/DEG.csv"), row.names = FALSE)
  # cat("Filtered DEGs saved to", paste0(output_folder, "/DEG.csv"), "\n")

  return (list(res_df = res_df, deg_df = deg_df))

}

#----------------------------------------

# Main code

# Parse command line arguments
option_list <- list(
  make_option(c("--main_alpha"),
    type = "character", default = "mainAlpha.tsv",
    help = "Path to main TCR alpha clonotypes TSV file", metavar = "character"
  ),
  make_option(c("--main_beta"),
    type = "character", default = "mainBeta.tsv",
    help = "Path to main TCR beta clonotypes TSV file", metavar = "character"
  ),
  make_option(c("--covariates"),
    type = "character", default = "metadata.tsv",
    help = "Path to metadata TSV file", metavar = "character"
  ),
  make_option(c("-t", "--contrast_factor"),
    type = "character", default = NULL,
    help = "Column name in metadata for the contrast",
    metavar = "character"
  ),
  make_option(c("-n", "--numerator"),
    type = "character", default = "all",
    help = "Numerator for contrast", metavar = "character"
  ),
  make_option(c("-d", "--denominator"),
    type = "character", default = "Control",
    help = "Denominator for contrast", metavar = "character"
  ),
  make_option(c("-f", "--fc_threshold"),
    type = "double", default = 0.5,
    help = "Log2(FC) threshold for significance"
  ),
  make_option(c("-p", "--p_threshold"),
    type = "double", default = 0.05,
    help = "Adjusted p-value threshold for significance"
  ),
  make_option(c("--threshold_counts"),
    type = "integer", default = 10,
    help = "Minimum number of counts for a clonotype to be considered significant"
  ),
  make_option(c("-s", "--threshold_samples"),
    type = "integer", default = 3,
    help = "Minimum number of samples for a clonotype to be considered significant"
  ),
  make_option(c("-o", "--output"),
    type = "character",
    default = ".",
    help = "Output folder for TSV results", metavar = "character"
  )
)

opt_parser <- OptionParser(option_list = option_list)
opt <- parse_args(opt_parser)

# Get input data
main_alpha <- opt$main_alpha
main_beta <- opt$main_beta
covariates <- opt$covariates
contrast_col <- opt$contrast_factor
numerator <- opt$numerator
denominator <- opt$denominator
output_folder <- opt$output
fc_cut <- opt$fc_threshold
fdr_cut <- opt$p_threshold
threshold_counts <- opt$threshold_counts
threshold_samples <- opt$threshold_samples
# test
# covariates <- "/Users/julen/Downloads/miltenyi_test/oncolumn_TCR_discovery/platforma/0x5B60C6/covariates.tsv"
# main_alpha <- "/Users/julen/Downloads/miltenyi_test/oncolumn_TCR_discovery/platforma/0x5B60C6/results/main_alpha_table.tsv"
# main_beta <- "/Users/julen/Downloads/miltenyi_test/oncolumn_TCR_discovery/platforma/0x5B60C6/results/main_beta_table.tsv"
# output_folder <- "/Users/julen/Downloads/miltenyi_test/oncolumn_TCR_discovery/platforma/0x5B60C6/results"
# contrast_col <- "ag"
# numerator <- "MART1"
# denominator <- "Control"

# Get from platforma
# Adjustments to clean up deseq before DA
fraction_for_filter <- 0.01
min_counts <- 1
# Adjustments to clean up DA results
# threshold_counts <- 10
# threshold_samples <- 3
# fc_cut <- 0
# fdr_cut <- 0.05



## 1.1. TCR Discovery
# Load metadata
covariates_table <- read.table(covariates, header = TRUE, sep = "\t", stringsAsFactors = FALSE)
main_alpha_table <- read.table(main_alpha, header = TRUE, sep = "\t", stringsAsFactors = FALSE)
main_beta_table <- read.table(main_beta, header = TRUE, sep = "\t", stringsAsFactors = FALSE)

deseq_results_alpha <- run_deseq(main_alpha_table, covariates_table, contrast_col,
  numerator, denominator, output_folder, fraction_for_filter, min_counts,
  threshold_counts, fdr_cut, fc_cut)
res_alpha <- deseq_results_alpha$res_df
deg_alpha <- deseq_results_alpha$deg_df

deseq_results_beta <- run_deseq(main_beta_table, covariates_table, contrast_col,
  numerator, denominator, output_folder, fraction_for_filter, min_counts,
  threshold_counts, fdr_cut, fc_cut)
res_beta <- deseq_results_beta$res_df
deg_beta <- deseq_results_beta$deg_df

# Save merged results
if (!dir.exists(output_folder)) {
  dir.create(output_folder, recursive = TRUE)
}
write.csv(res_alpha, paste0(output_folder, "/topTable_alpha.csv"), row.names = FALSE)
write.csv(deg_alpha, paste0(output_folder, "/DA_alpha.csv"), row.names = FALSE)
write.csv(res_beta, paste0(output_folder, "/topTable_beta.csv"), row.names = FALSE)
write.csv(deg_beta, paste0(output_folder, "/DA_beta.csv"), row.names = FALSE)