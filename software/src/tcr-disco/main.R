#!/usr/bin/env Rscript

# Load required libraries
suppressMessages(library("DESeq2"))
suppressMessages(library("optparse"))
suppressMessages(library("jsonlite"))
#----------------------------------------

# Required functions
# 1.  *run DESeq2*
run_deseq = function(main_table, covariates_table, contrast_col,
  numerator, denominators, output_folder, fraction_for_filter, min_counts, threshold_counts,
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

  # Apply filter by low counts (at least filter by values in one sample)
  # Filters prior to DE analysis to have minimum data quality
  min_samples <- max(floor(ncol(count_matrix) * fraction_for_filter), 1)
  count_matrix <- count_matrix[rowSums(count_matrix >= min_counts) >= min_samples, ]
  # For differentialclonotype abundance we add 1 as minimum clonotype count (after filtering)
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
  set.seed(42)
  dds <- DESeqDataSetFromMatrix(
    countData = count_matrix,
    colData = metadata_short,
    design = as.formula(paste("~", paste(colnames(metadata_short), collapse = " + ")))
  )
  dds <- DESeq(dds, fitType = "local")

  # Extract topTable for each denominator (excluding numerator)
  valid_denominators <- denominators[denominators != numerator]
  if (length(valid_denominators) == 0) {
    stop("No valid denominators found after excluding numerator")
  }
  
  # Process each denominator and merge results
  res_list <- lapply(valid_denominators, function(denom) {
    res_df <- as.data.frame(results(dds, contrast = c(make.names(contrast_col), numerator, denom)))
    res_df$clonotypeKey <- rownames(res_df)
    
    # Add suffix to relevant columns
    suffix <- paste0("_", make.names(denom))
    cols_to_rename <- c("log2FoldChange", "padj", "pvalue", "baseMean", "lfcSE", "stat")
    idx <- colnames(res_df) %in% cols_to_rename
    colnames(res_df)[idx] <- paste0(colnames(res_df)[idx], suffix)
    
    # Calculate minlog10padj
    padj_col <- paste0("padj", suffix)
    minlog10padj_col <- paste0("minlog10padj", suffix)
    res_df[[minlog10padj_col]] <- -log10(res_df[[padj_col]])
    
    # Cap infinite values to 1.05 * max finite value
    max_finite_value <- max(res_df[[minlog10padj_col]][is.finite(res_df[[minlog10padj_col]])], na.rm = TRUE)
    res_df[[minlog10padj_col]][!is.finite(res_df[[minlog10padj_col]])] <- 1.05 * max_finite_value
    
    res_df[, c("clonotypeKey", grep(suffix, colnames(res_df), value = TRUE))]
  })
  
  # Merge all results
  res_df <- Reduce(function(x, y) merge(x, y, by = "clonotypeKey", all = TRUE), res_list)
  
  # Add CDR3 aa and VGene columns
  clonoMatch <- match(res_df$clonotypeKey, main_table$clonotypeKey)
  res_df$CDR3aa <- main_table$CDR3aa[clonoMatch]
  res_df$VGene <- main_table$VGene[clonoMatch]
  
  # Calculate Regulation based on ALL log2FoldChange columns
  lfc_cols <- grep("^log2FoldChange_", colnames(res_df), value = TRUE)
  res_df$Regulation <- "NS"
  lfc_data <- res_df[, lfc_cols, drop = FALSE]
  # Check if all values are non-NA and meet thresholds
  no_na_mask <- rowSums(is.na(lfc_data)) == 0
  up_mask <- no_na_mask & (rowSums(lfc_data >= fc_cut, na.rm = TRUE) == length(lfc_cols))
  down_mask <- no_na_mask & (rowSums(lfc_data <= -fc_cut, na.rm = TRUE) == length(lfc_cols))
  
  res_df$Regulation[up_mask] <- "Up"
  res_df$Regulation[down_mask] <- "Down"
  
  # Apply threshold filter: check if clonotype has at least threshold_counts in at least threshold_samples numerator samples
  numerator_samples <- colnames(count_matrix)[metadata_short[[contrast_col]] == numerator]
  numerator_counts <- count_matrix[, numerator_samples, drop = FALSE]
  passing_clonotypes <- rownames(count_matrix)[rowSums(numerator_counts >= threshold_counts) >= threshold_samples]
  res_df$Regulation[!res_df$clonotypeKey %in% passing_clonotypes] <- "NS"

  # Get median minlog10padj and log2FoldChange values
  padj_cols <- grep("^padj_", colnames(res_df), value = TRUE)
  minlog10padj_cols <- grep("^minlog10padj_", colnames(res_df), value = TRUE)
  res_df$log2FoldChange_mean <- apply(res_df[, lfc_cols, drop = FALSE], 1, mean, na.rm = TRUE)
  res_df$minlog10padj_mean <- apply(res_df[, minlog10padj_cols, drop = FALSE], 1, mean, na.rm = TRUE)
  res_df$padj_mean <- apply(res_df[, padj_cols, drop = FALSE], 1, mean, na.rm = TRUE)
  
  # Add subset columns if available
  deg_cols <- c("clonotypeKey", "Contrast", "CDR3aa", "VGene", "Regulation", "Numerator",
                lfc_cols, padj_cols, minlog10padj_cols, "log2FoldChange_mean", "minlog10padj_mean")
  if ("subset" %in% colnames(main_table)) {
    subset_cols <- c("umi_count_CD4", "umi_freq_CD4", "umi_count_CD8", "umi_freq_CD8", "subset", "subset_frequency")
    res_df[subset_cols] <- main_table[subset_cols][clonoMatch, ]
    deg_cols <- c(deg_cols, subset_cols)
  }

  # If numerator is among denominators, add columns with NaN values for concatenation and pcolumn usage
  if (numerator %in% denominators) {
    numerator_suffix <- paste0("_", make.names(numerator))
    new_cols <- c(paste0("pvalue", numerator_suffix), paste0("padj", numerator_suffix), 
      paste0("log2FoldChange", numerator_suffix), paste0("lfcSE", numerator_suffix), 
      paste0("baseMean", numerator_suffix), paste0("stat", numerator_suffix))
    for (col in new_cols) {
      res_df[[col]] <- NA_real_
    }
    # Update deg_cols
    deg_cols <- c(deg_cols, new_cols)
  }

  # Add contrast and numerator columns, reorder alphabetically
  res_df$Contrast <- paste0(numerator, " vs ", paste(denominators, collapse = "-"))
  res_df$Numerator <- numerator
  res_df <- res_df[order(colnames(res_df))]

  # Filter DEGs: use Regulation column (includes fc and count/sample thresholds) and also check fc_cut
  # We only return DEGs with FC >= fc_cut (only greater) and padj <= fdr_cut
  padj_data <- res_df[, padj_cols, drop = FALSE]
  padj_no_na_mask <- rowSums(is.na(padj_data)) == 0
  # Only keep FC above threshold
  padj_pass <- padj_no_na_mask & (rowSums(padj_data <= fdr_cut, na.rm = TRUE) == length(padj_cols))
  deg_indices <- (res_df$Regulation == "Up") & padj_pass

  # Select DEG columns
  deg_df <- res_df[deg_indices, sort(deg_cols), drop = FALSE]

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
# numerator="CMV"
# denominators="[\"CMV\",\"Control\",\"EBV\",\"MART1\"]"
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


## 1.1. TCR Discovery
# Load metadata
covariates_table <- read.table(covariates, header = TRUE, sep = "\t", stringsAsFactors = FALSE)
main_alpha_table <- read.table(main_alpha, header = TRUE, sep = "\t", stringsAsFactors = FALSE)
main_beta_table <- read.table(main_beta, header = TRUE, sep = "\t", stringsAsFactors = FALSE)

deseq_results_alpha <- run_deseq(main_alpha_table, covariates_table, contrast_col,
  numerator, denominators, output_folder, fraction_for_filter, min_counts,
  threshold_counts, threshold_samples, fdr_cut, fc_cut)
res_alpha <- deseq_results_alpha$res_df
deg_alpha <- deseq_results_alpha$deg_df

deseq_results_beta <- run_deseq(main_beta_table, covariates_table, contrast_col,
  numerator, denominators, output_folder, fraction_for_filter, min_counts,
  threshold_counts, threshold_samples, fdr_cut, fc_cut)
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