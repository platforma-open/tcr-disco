#!/usr/bin/env Rscript

# Load required libraries
suppressMessages(library("optparse"))
#----------------------------------------

# Required functions
# 1.  generate fraction matrices
get_fraction_matrix = function(main_table) {
  # Generate frequency matrices for both alpha and beta
  # Aggregate fractions by useSampleId and clonotypeKey
  # Use clonotypeKey first to match group_by order
  aggregated <- aggregate(fraction ~ clonotypeKey + useSampleId, 
                          data = main_table, FUN = sum)

  # Get unique values in the order they first appear in aggregated (matches group_by + summarise order)
  unique_clonotypes <- unique(aggregated$clonotypeKey)
  unique_samples <- unique(aggregated$useSampleId)

  # Create matrix with proper dimensions and fill with 0
  fraction_matrix <- matrix(0, 
                        nrow = length(unique_clonotypes), 
                        ncol = length(unique_samples),
                        dimnames = list(unique_clonotypes, unique_samples))

  # Fill matrix with aggregated values using match for efficiency
  row_indices <- match(aggregated$clonotypeKey, unique_clonotypes)
  col_indices <- match(aggregated$useSampleId, unique_samples)
  fraction_matrix[cbind(row_indices, col_indices)] <- aggregated$fraction

  # Ensure it's a numeric matrix
  fraction_matrix <- as.matrix(fraction_matrix)
  fraction_matrix[is.na(fraction_matrix)] <- 0

  return (fraction_matrix)
}

# 2.  find pairs
find_pairs = function(deg_alpha_table, deg_beta_table, metadata_table, 
      contrast_col, alpha_matrix, beta_matrix, num) {
  # samples related to the selected numerator
  alpha_clonotypes <- deg_alpha_table[deg_alpha_table$Numerator == num, "clonotypeKey"]
  beta_clonotypes <- deg_beta_table[deg_beta_table$Numerator == num, "clonotypeKey"]
  contrast_label <- unique(deg_alpha_table[deg_alpha_table$Numerator == num, "Contrast"])
  numerator_samples <- metadata_table[metadata_table[,contrast_col] == num, "useSampleId"]
  alpha_matrix <- alpha_matrix[alpha_clonotypes, 
      colnames(alpha_matrix)[colnames(alpha_matrix) %in% numerator_samples], drop = FALSE]
  beta_matrix <- beta_matrix[beta_clonotypes, 
      colnames(beta_matrix)[colnames(beta_matrix) %in% numerator_samples], drop = FALSE]

  # merge TRA and TRB clonotypes into one dataframe
  fraction_table_ab <- t(rbind(alpha_matrix, beta_matrix))

  # Generate all possible alpha-beta pairs using base R
  pairs_grid <- expand.grid(
    tra = rownames(alpha_matrix),
    trb = rownames(beta_matrix),
    stringsAsFactors = FALSE
  )

  # Run correlation tests for each pair
  test_results <- mapply(function(tra, trb) {
    df_small <- fraction_table_ab[, c(tra, trb), drop = FALSE]
    # Check whether both chains are present or absent within replicates
    if (all(rowSums(df_small == 0) != 1)) {
      cor.test(df_small[, 1], df_small[, 2])
    } else {
      NULL
    }
  }, pairs_grid$tra, pairs_grid$trb, SIMPLIFY = FALSE)

  # Filter out NULL results and extract estimates and p-values
  valid_indices <- !sapply(test_results, is.null)
  predicted_pairs <- pairs_grid[valid_indices, , drop = FALSE]
  predicted_pairs$estimate <- sapply(test_results[valid_indices], function(x) x$estimate)
  predicted_pairs$p.value <- sapply(test_results[valid_indices], function(x) x$p.value)

  # Perform FDR adjustment and filter by R & FDR threshold
  predicted_pairs$p.adj <- p.adjust(predicted_pairs$p.value, method = "fdr")
  # predicted_pairs <- predicted_pairs[
  #   predicted_pairs$p.adj <= fdr_cut & predicted_pairs$estimate >= estimate_cut,
  #   , drop = FALSE
  # ]

  # Add contrast column
  predicted_pairs["Contrast"] = contrast_label

  return (predicted_pairs)
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
  make_option(c("--da_alpha"),
    type = "character", default = "daAlpha.csv",
    help = "Path to DA alpha CSV file", metavar = "character"
  ),
  make_option(c("--da_beta"),
    type = "character", default = "daBeta.csv",
    help = "Path to DA beta CSV file", metavar = "character"
  ),
  make_option(c("--metadata"),
    type = "character", default = "metadata.tsv",
    help = "Path to metadata TSV file", metavar = "character"
  ),
  make_option(c("-t", "--contrast_col"),
    type = "character", default = NULL,
    help = "Column name in metadata for the contrast",
    metavar = "character"
  ),
  make_option(c("--sample_id_col"),
    type = "character", default = NULL,
    help = "Column name in metadata for the sample ID",
    metavar = "character"
  ),
  make_option(c("-f", "--fc_threshold"),
    type = "double", default = 0.5,
    help = "Log2(FC) threshold for significance"
  ),
  make_option(c("-p", "--p_threshold"),
    type = "double", default = 0.05,
    help = "Adjusted p-value threshold for significance"
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
da_alpha <- opt$da_alpha
da_beta <- opt$da_beta
metadata <- opt$metadata
contrast_col <- opt$contrast_col
sample_id_col <- opt$sample_id_col
fc_cut <- opt$fc_threshold
fdr_cut <- opt$p_threshold
output_folder <- opt$output

# test
# metadata <- "/Users/julen/Downloads/m_test/oncolumn_TCR_discovery/platforma/0x5B60C6/forPairing/metadata.tsv"
# main_alpha <- "/Users/julen/Downloads/m_test/oncolumn_TCR_discovery/platforma/0x5B60C6/forPairing/mainAlpha.tsv"
# main_beta <- "/Users/julen/Downloads/m_test/oncolumn_TCR_discovery/platforma/0x5B60C6/forPairing/mainBeta.tsv"
# da_alpha <- "/Users/julen/Downloads/m_test/oncolumn_TCR_discovery/platforma/0x5B60C6/forPairing/daAlpha.csv"
# da_beta <- "/Users/julen/Downloads/m_test/oncolumn_TCR_discovery/platforma/0x5B60C6/forPairing/daBeta.csv"
# contrast_col <- "ag"
# output_folder <- "/Users/julen/Downloads/m_test/oncolumn_TCR_discovery/platforma/0x5B60C6/resultsPairing"
# sample_id_col <- "Barcode ID"

# Get from platforma
# @TODO: Filters are not yet sued, implement them
# fdr_cut <- 0.05
estimate_cut <- 0.95

## Control prints
print(paste("metadata file: ", metadata))
print(paste("main alpha file: ", main_alpha))
print(paste("main beta file: ", main_beta))
print(paste("da alpha file: ", da_alpha))
print(paste("da beta file: ", da_beta))
print(paste("contrast column: ", contrast_col))
print(paste("sample id column: ", sample_id_col))
print(paste("fc threshold: ", fc_cut))
print(paste("fdr threshold: ", fdr_cut))
print(paste("output folder: ", output_folder))

## 1.1. TCR Discovery
# Get alpha/beta DEG tables
deg_alpha_table <- read.csv(da_alpha, header = TRUE, sep = ",", stringsAsFactors = FALSE)
deg_beta_table <- read.csv(da_beta, header = TRUE, sep = ",", stringsAsFactors = FALSE)

if (nrow(deg_alpha_table) == 0 || nrow(deg_beta_table) == 0) {
  print("Warning: The DA alpha or beta tables are empty. No pairs will be found.")

  # Create an emtpy output table with sall the required columns
  required_cols <- c("Contrast", "tra", "trb", "estimate", "p.value", "p.adj", "tra_CDR3aa", "tra_VGene", "trb_CDR3aa", "trb_VGene")
  empty_table <- data.frame(matrix(ncol = length(required_cols), nrow = 0))
  colnames(empty_table) <- required_cols
  predicted_pairs_all <- empty_table

} else {
  # Load metadata and main alpha/beta tables
  metadata_table <- read.table(metadata, header = TRUE, sep = "\t", stringsAsFactors = FALSE, check.names = FALSE)
  main_alpha_table <- read.table(main_alpha, header = TRUE, sep = "\t", stringsAsFactors = FALSE)
  main_beta_table <- read.table(main_beta, header = TRUE, sep = "\t", stringsAsFactors = FALSE)

  # check if sample_id_col is in metadata_table and if it has less values than internalSampleId
  main_alpha_table$useSampleId <- main_alpha_table$internalSampleId
  main_beta_table$useSampleId <- main_beta_table$internalSampleId
  if (sample_id_col %in% colnames(metadata_table)) {
    if (length(unique(metadata_table[, sample_id_col])) < length(unique(metadata_table$internalSampleId))) {
      # Add original sample ID to the alpha and beta tables
      main_alpha_table$useSampleId <- metadata_table[match(main_alpha_table$internalSampleId, metadata_table$internalSampleId), sample_id_col]
      main_beta_table$useSampleId <- metadata_table[match(main_beta_table$internalSampleId, metadata_table$internalSampleId), sample_id_col]

      metadata_table$useSampleId <- metadata_table[, sample_id_col]
    } 
  }

  # Make sure we have the same set of samples to compare
  if (!identical(sort(unique(main_alpha_table$useSampleId)), sort(unique(main_beta_table$useSampleId)))) {
    stop("Error: The sets of samples in the alpha and beta tables are not the same")
  }
  # Get alpha/beta fraction matrices
  alpha_matrix <- get_fraction_matrix(main_alpha_table)
  beta_matrix <- get_fraction_matrix(main_beta_table)


  # Get all possible values from Numerator column in both tables
  numerators <- unique(c(deg_alpha_table$Numerator, deg_beta_table$Numerator))

  # Find pairs per numerator and comine results into one table
  predicted_pairs_all <- data.frame()
  for (num in numerators) {
    predicted_pairs <- find_pairs(deg_alpha_table, deg_beta_table, metadata_table, 
        contrast_col, alpha_matrix, beta_matrix, num)
    predicted_pairs_all <- rbind(predicted_pairs_all, predicted_pairs)
  }

  # Filter out negative correlations
  predicted_pairs_all <- predicted_pairs_all[predicted_pairs_all$estimate >= 0, ]

  # Add TRA and TRB CDR3 aa and VGene data
  # Match tra column with alpha table (match returns first occurrence, which is fine since CDR3aa/VGene are always the same for repeated clonotypeKeys)
  alpha_match_idx <- match(predicted_pairs_all$tra, main_alpha_table$clonotypeKey)
  predicted_pairs_all$tra_CDR3aa <- main_alpha_table$CDR3aa[alpha_match_idx]
  predicted_pairs_all$tra_VGene <- main_alpha_table$VGene[alpha_match_idx]

  # Match trb column with beta table
  beta_match_idx <- match(predicted_pairs_all$trb, main_beta_table$clonotypeKey)
  predicted_pairs_all$trb_CDR3aa <- main_beta_table$CDR3aa[beta_match_idx]
  predicted_pairs_all$trb_VGene <- main_beta_table$VGene[beta_match_idx]
}

#save ft_ and ct_filtered in the output_folder
write.table(predicted_pairs_all, paste0(output_folder, "/ab_pairs.tsv"), 
                sep = "\t", quote = F, row.names = F)

