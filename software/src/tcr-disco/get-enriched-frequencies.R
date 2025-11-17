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
output_folder <- opt$output

# test
# main_alpha <- "/Users/julen/Downloads/m_test/oncolumn_TCR_discovery/platforma/0x5B60C6/mainAlpha.tsv"
# main_beta <- "/Users/julen/Downloads/m_test/oncolumn_TCR_discovery/platforma/0x5B60C6/mainBeta.tsv"
# da_alpha <- "/Users/julen/Downloads/m_test/oncolumn_TCR_discovery/platforma/0x5B60C6/forPairing/daAlpha.csv"
# da_beta <- "/Users/julen/Downloads/m_test/oncolumn_TCR_discovery/platforma/0x5B60C6/forPairing/daBeta.csv"
# output_folder <- "/Users/julen/Downloads/m_test/oncolumn_TCR_discovery/platforma/0x5B60C6/resultsPairing"


## 1.1. TCR Discovery
# Load metadata
main_alpha_table <- read.table(main_alpha, header = TRUE, sep = "\t", stringsAsFactors = FALSE)
main_beta_table <- read.table(main_beta, header = TRUE, sep = "\t", stringsAsFactors = FALSE)

# Get alpha/beta DEG tables
deg_alpha_table <- read.csv(da_alpha, header = TRUE, sep = ",", stringsAsFactors = FALSE)
deg_beta_table <- read.csv(da_beta, header = TRUE, sep = ",", stringsAsFactors = FALSE)

# Keep only DA clonotypes from main tables
main_alpha_table <- main_alpha_table[main_alpha_table$clonotypeKey %in% deg_alpha_table$clonotypeKey, ]
main_beta_table <- main_beta_table[main_beta_table$clonotypeKey %in% deg_beta_table$clonotypeKey, ]

# Store the tables
if (!dir.exists(output_folder)) {
  dir.create(output_folder, recursive = TRUE)
}
write.table(main_alpha_table[, c("internalSampleId", "clonotypeKey", "fraction", "subset")], 
                paste0(output_folder, "/main_alpha_frequencies.tsv"), 
                sep = "\t", quote = F, row.names = F)
write.table(main_beta_table[, c("internalSampleId", "clonotypeKey", "fraction", "subset")], 
                paste0(output_folder, "/main_beta_frequencies.tsv"), 
                sep = "\t", quote = F, row.names = F)

# store clonotype to subset mapping removing repeated lines
clonotype_to_subset_alpha <- unique(main_alpha_table[, c("clonotypeKey", "subset")])
clonotype_to_subset_beta <- unique(main_beta_table[, c("clonotypeKey", "subset")])

write.table(clonotype_to_subset_alpha, paste0(output_folder, "/clonotype_to_subset_alpha.tsv"), 
  sep = "\t", quote = F, row.names = F)
write.table(clonotype_to_subset_beta, paste0(output_folder, "/clonotype_to_subset_beta.tsv"), 
  sep = "\t", quote = F, row.names = F)
