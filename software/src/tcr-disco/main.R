#!/usr/bin/env Rscript

# Load required libraries
suppressMessages(library("DESeq2"))
suppressMessages(library("optparse"))
suppressMessages(library("jsonlite"))
#----------------------------------------

# Required functions
# 1.  *run DESeq2*
run_deseq = function(main_table, covariates_table, contrast_col,
  numerators, denominators, output_folder, fraction_for_filter, min_counts, threshold_counts,
  threshold_samples, fdr_cut, fc_cut) {

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

  # Apply filter by low counts (at least filter by values in two samples)
  # Filters prior to DE analysis to have minimum data quality
  min_samples <- max(floor(ncol(count_matrix) * fraction_for_filter), 2)
  count_matrix <- count_matrix[rowSums(count_matrix >= min_counts) >= min_samples, ]
  # For differential clonotype abundance we add 1 as minimum clonotype count (after filtering)
  count_matrix <- count_matrix + 1
  # Hence update user provided threshold
  threshold_counts <- threshold_counts + 1

  covariates_table[, "internalSampleId"] = covariates_table[, "Sample"]
  rownames(covariates_table) <- covariates_table$internalSampleId

  # Prepare DESeq2 dataset
  non_contrast_cols <- setdiff(colnames(covariates_table), 
    c("Sample", "internalSampleId",contrast_col))
  metadata_short <- covariates_table[,c(contrast_col, non_contrast_cols)]
  metadata_short <- metadata_short[colnames(count_matrix),]
  metadata_short[[contrast_col]] <- as.factor(metadata_short[[contrast_col]])
  set.seed(42)
  dds <- DESeqDataSetFromMatrix(
    countData = count_matrix,
    colData = metadata_short,
    design = as.formula(paste("~", paste(colnames(metadata_short), collapse = " + ")))
  )
  dds <- DESeq(dds, fitType = "local")

  # Extract results for all numerator vs denominator combinations
  # Create all valid numerator-denominator pairs
  contrast_pairs <- expand.grid(numerator = numerators, denominator = denominators, stringsAsFactors = FALSE)
  contrast_pairs <- contrast_pairs[contrast_pairs$numerator != contrast_pairs$denominator, ]
  
  if (nrow(contrast_pairs) == 0) {
    stop("No valid numerator-denominator pairs found")
  }
  
  # Process each contrast pair using lapply (more efficient than for loops)
  res_list <- lapply(seq_len(nrow(contrast_pairs)), function(i) {
    numerator <- contrast_pairs$numerator[i]
    denom <- contrast_pairs$denominator[i]
    
    # We disable independentFiltering to avoid situations with all NA adjusted 
    # p-values due to excessive filtering
    res_df <- as.data.frame(results(dds, contrast = c(make.names(contrast_col), numerator, denom),
                                    independentFiltering = FALSE))
    res_df$clonotypeKey <- rownames(res_df)
    
    # Add contrast column indicating "numerator vs denominator"
    res_df$Contrast <- paste0(numerator, " vs ", denom)
    
    # Add Numerator column (needed for pairing script)
    res_df$Numerator <- numerator
    
    # Calculate minlog10padj
    res_df$minlog10padj <- -log10(res_df$padj)
    
    # Cap infinite values to 1.05 * max finite value
    max_finite_value <- max(res_df$minlog10padj[is.finite(res_df$minlog10padj)], na.rm = TRUE)
    res_df$minlog10padj[!is.finite(res_df$minlog10padj)] <- 1.05 * max(max_finite_value, 1)
    
    # Select relevant columns
    res_df[, c("clonotypeKey", "Contrast", "Numerator", "log2FoldChange", "padj", "pvalue", 
               "baseMean", "lfcSE", "stat", "minlog10padj")]
  })
  
  # Combine all results into long format
  res_df <- do.call(rbind, res_list)
  
  # Add CDR3 aa and VGene columns
  clonoMatch <- match(res_df$clonotypeKey, main_table$clonotypeKey)
  res_df$CDR3aa <- main_table$CDR3aa[clonoMatch]
  res_df$VGene <- main_table$VGene[clonoMatch]
  
  # Calculate Regulation direction based on log2FoldChange column
  res_df$Regulation <- "NS"
  res_df$Regulation[res_df$log2FoldChange >= fc_cut] <- "Up"
  res_df$Regulation[res_df$log2FoldChange <= -fc_cut] <- "Down"

  # Calculate Robust_Enrichment based on log2FoldChange and adjusted p-value thresholds
  # Group by clonotypeKey AND Numerator to compute robust enrichment per numerator
  lfc_agg <- aggregate(log2FoldChange ~ clonotypeKey + Numerator, data = res_df, 
                       FUN = function(x) min(x, na.rm = TRUE))
  pval_agg <- aggregate(padj ~ clonotypeKey + Numerator, data = res_df, 
                       FUN = function(x) max(x, na.rm = TRUE))
  
  ## Merge aggregations to ensure proper alignment
  robust_agg <- merge(lfc_agg, pval_agg, by = c("clonotypeKey", "Numerator"), all = TRUE)
  
  ## Robust: all contrasts have log2FoldChange >= fc_cut AND all have padj <= fdr_cut
  robust_agg$Robust_Enrichment <- "Non-robust"
  robust_mask <- (robust_agg$log2FoldChange >= fc_cut) & (robust_agg$padj <= fdr_cut)
  robust_agg$Robust_Enrichment[robust_mask] <- "Robust"
  
  ## Merge back to res_df
  res_df <- merge(res_df, robust_agg[, c("clonotypeKey", "Numerator", "Robust_Enrichment")], 
                  by = c("clonotypeKey", "Numerator"), all.x = TRUE)
  
  # Filter clonotypes per numerator: must have at least threshold_counts in at least threshold_samples numerator samples
  filtered_res_list <- lapply(numerators, function(numerator) {
    numerator_samples <- colnames(count_matrix)[metadata_short[[contrast_col]] == numerator]
    numerator_counts <- count_matrix[, numerator_samples, drop = FALSE]
    passing_clonotypes <- rownames(count_matrix)[rowSums(numerator_counts >= threshold_counts) >= threshold_samples]
    res_df[res_df$Numerator == numerator & res_df$clonotypeKey %in% passing_clonotypes, ]
  })
  res_df <- do.call(rbind, filtered_res_list)
  
  # Recalculate clonoMatch after filtering to ensure indices align
  clonoMatch <- match(res_df$clonotypeKey, main_table$clonotypeKey)
  
  # Add subset columns if available
  deg_cols <- c("clonotypeKey", "Contrast", "CDR3aa", "VGene", "Regulation", "Robust_Enrichment",
                "log2FoldChange", "padj", "pvalue", "baseMean", "lfcSE", "stat", "minlog10padj", "Numerator")
  if ("subset" %in% colnames(main_table)) {
    subset_cols <- c("umi_count_CD4", "umi_freq_CD4", "umi_count_CD8", "umi_freq_CD8", "subset", "subset_frequency")
    res_df[subset_cols] <- main_table[subset_cols][clonoMatch, ]
    deg_cols <- c(deg_cols, subset_cols)
  }

  # Filter DEGs
  deg_df <- res_df[res_df$Robust_Enrichment == "Robust", deg_cols, drop = FALSE]

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
  make_option(c("-d", "--denominators"),
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
denominators <- opt$denominators
output_folder <- opt$output
fc_cut <- opt$fc_threshold
fdr_cut <- opt$p_threshold
threshold_counts <- opt$threshold_counts
threshold_samples <- opt$threshold_samples

# test
# main_alpha="mainAlpha.tsv"
# main_beta="mainBeta.tsv"
# covariates="covariates.tsv"
# contrast_col="ag"
# numerator="[\"CMV\",\"Cov\"]"
# denominators="[\"CMV\",\"Cov\",\"noAg\"]"
# fc_cut=0
# fdr_cut=0.05
# threshold_counts=10
# threshold_samples=3
# output_folder="."

# Get from platforma
# Adjustments to clean up deseq before DA
fraction_for_filter <- 0.01
min_counts <- 1
# convert denominator from json to vector
denominators <- fromJSON(denominators)
# convert numerator from json to vector
numerators <- fromJSON(numerator)

## 1.1. TCR Discovery
# Load metadata
covariates_table <- read.table(covariates, header = TRUE, sep = "\t", stringsAsFactors = FALSE)
main_alpha_table <- read.table(main_alpha, header = TRUE, sep = "\t", stringsAsFactors = FALSE)
main_beta_table <- read.table(main_beta, header = TRUE, sep = "\t", stringsAsFactors = FALSE)

# Run DESeq2 once per chain for all numerators (efficient)
deseq_results_alpha <- run_deseq(main_alpha_table, covariates_table, contrast_col,
  numerators, denominators, output_folder, fraction_for_filter, min_counts,
  threshold_counts, threshold_samples, fdr_cut, fc_cut)
res_alpha <- deseq_results_alpha$res_df
deg_alpha <- deseq_results_alpha$deg_df

deseq_results_beta <- run_deseq(main_beta_table, covariates_table, contrast_col,
  numerators, denominators, output_folder, fraction_for_filter, min_counts,
  threshold_counts, threshold_samples, fdr_cut, fc_cut)
res_beta <- deseq_results_beta$res_df
deg_beta <- deseq_results_beta$deg_df

# Create output folder if it doesn't exist
if (!dir.exists(output_folder)) {
  dir.create(output_folder, recursive = TRUE)
}
write.csv(res_alpha, paste0(output_folder, "/topTable_alpha.csv"), row.names = FALSE)
write.csv(deg_alpha, paste0(output_folder, "/DA_alpha.csv"), row.names = FALSE)
write.csv(res_beta, paste0(output_folder, "/topTable_beta.csv"), row.names = FALSE)
write.csv(deg_beta, paste0(output_folder, "/DA_beta.csv"), row.names = FALSE)

# Store clonotypeKey to Robust_Enrichment mapping for exports per numerator
for (num in numerators) {
  robust_enrichment_mapping_alpha <- unique(res_alpha[res_alpha$Numerator == num, c("clonotypeKey", "Robust_Enrichment")])
  robust_enrichment_mapping_beta <- unique(res_beta[res_beta$Numerator == num, c("clonotypeKey", "Robust_Enrichment")])
  write.csv(robust_enrichment_mapping_alpha, paste0(output_folder, "/robust_enrichment_alpha_", num, ".csv"),
            row.names = FALSE)
  write.csv(robust_enrichment_mapping_beta, paste0(output_folder, "/robust_enrichment_beta_", num, ".csv"),
            row.names = FALSE)
}