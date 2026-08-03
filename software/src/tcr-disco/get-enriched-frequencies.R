#!/usr/bin/env Rscript

# Load required libraries
suppressMessages(library("optparse"))
suppressMessages(library("jsonlite"))
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
  ),
  make_option(c("--covariates"),
    type = "character", default = "covariates.tsv",
    help = "Path to covariates/metadata TSV (Sample column + contrast factor)", metavar = "character"
  ),
  make_option(c("--contrast_col"),
    type = "character", default = NULL,
    help = "Contrast-factor column label used to identify target/baseline samples", metavar = "character"
  ),
  make_option(c("--numerators"),
    type = "character", default = "[]",
    help = "JSON array of numerator (target) values of the contrast factor", metavar = "character"
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
covariates_file <- opt$covariates
contrast_col <- opt$contrast_col
numerators <- fromJSON(opt$numerators)

# test
# main_alpha <- "./mainAlpha.tsv"
# main_beta <- "./mainBeta.tsv"
# da_alpha <- "./DA_alpha.csv"
# da_beta <- "./DA_beta.csv"
# output_folder <- "./resultsPairing"


## 1.1. TCR Discovery
# Load metadata
main_alpha_table <- read.table(main_alpha, header = TRUE, sep = "\t", stringsAsFactors = FALSE)
main_beta_table <- read.table(main_beta, header = TRUE, sep = "\t", stringsAsFactors = FALSE)

# Get alpha/beta DEG tables
deg_alpha_table <- read.csv(da_alpha, header = TRUE, sep = ",", stringsAsFactors = FALSE)
deg_beta_table <- read.csv(da_beta, header = TRUE, sep = ",", stringsAsFactors = FALSE)

# Keep only DA clonotypes from main tables
# Commented out for now, we need the whole data to then include pl7.app/graph/isDenseAxis annotation
# main_alpha_table <- main_alpha_table[main_alpha_table$clonotypeKey %in% unique(deg_alpha_table$clonotypeKey), ]
# main_beta_table <- main_beta_table[main_beta_table$clonotypeKey %in% unique(deg_beta_table$clonotypeKey), ]

# Build "Robust Enrichment - Any" column: Robust if clonotype is Robust in any comparison
robust_alpha_keys <- unique(deg_alpha_table$clonotypeKey)
robust_beta_keys <- unique(deg_beta_table$clonotypeKey)

all_alpha_keys <- unique(main_alpha_table$clonotypeKey)
all_beta_keys <- unique(main_beta_table$clonotypeKey)

robust_any_alpha <- data.frame(
  clonotypeKey = all_alpha_keys,
  Robust_Enrichment = ifelse(all_alpha_keys %in% robust_alpha_keys, "Robust", "Non-robust")
)
robust_any_beta <- data.frame(
  clonotypeKey = all_beta_keys,
  Robust_Enrichment = ifelse(all_beta_keys %in% robust_beta_keys, "Robust", "Non-robust")
)

# Store the tables
if (!dir.exists(output_folder)) {
  dir.create(output_folder, recursive = TRUE)
}

if ("subset" %in% colnames(main_alpha_table)) {
  keep_cols1 <- c("internalSampleId", "clonotypeKey", "fraction", "subset")
  keep_cols2 <- c("clonotypeKey", "subset")
} else {
  keep_cols1 <- c("internalSampleId", "clonotypeKey", "fraction")
  keep_cols2 <- c("clonotypeKey")
}
write.table(main_alpha_table[, keep_cols1], 
                paste0(output_folder, "/main_alpha_frequencies.tsv"), 
                sep = "\t", quote = F, row.names = F)
write.table(main_beta_table[, keep_cols1],
                paste0(output_folder, "/main_beta_frequencies.tsv"),
                sep = "\t", quote = F, row.names = F)

# Per-clonotype "mean frequency of target replicates", used to sort the heatmap
# Y axis. Target replicates = samples whose contrast-factor value is a numerator.
# For each clonotype: mean of its per-sample `fraction` over only the target
# replicates where it is present (absent replicates are excluded, not counted as
# 0). Clonotypes absent in all targets get 0.
covariates_table <- read.table(covariates_file, header = TRUE, sep = "\t", stringsAsFactors = FALSE)
# internalSampleId == the Sample column; the contrast column header is R-sanitized
# on read (check.names = TRUE), matching make.names() of the label (same as main.R).
contrast_col_safe <- if (is.null(contrast_col)) NULL else make.names(contrast_col)
target_samples <- if (!is.null(contrast_col_safe) && contrast_col_safe %in% colnames(covariates_table)) {
  covariates_table$Sample[covariates_table[[contrast_col_safe]] %in% numerators]
} else {
  character(0)
}

mean_target_freq <- function(main_table) {
  all_keys <- unique(main_table$clonotypeKey)
  res <- data.frame(clonotypeKey = all_keys,
                    meanTargetFreq = rep(0, length(all_keys)),
                    stringsAsFactors = FALSE)
  target_in_data <- intersect(unique(main_table$internalSampleId), target_samples)
  n_target <- length(target_in_data)
  if (n_target > 0 && nrow(main_table) > 0) {
    sub <- main_table[main_table$internalSampleId %in% target_in_data,
                      c("clonotypeKey", "fraction")]
    # `sub` has a row only where the clonotype is present in a target sample, so
    # the mean is over present target replicates only (absent ones excluded).
    agg <- aggregate(fraction ~ clonotypeKey, data = sub, FUN = mean)
    res$meanTargetFreq <- agg$fraction[match(all_keys, agg$clonotypeKey)]
    res$meanTargetFreq[is.na(res$meanTargetFreq)] <- 0
  }
  res
}

write.table(mean_target_freq(main_alpha_table),
                paste0(output_folder, "/mean_target_freq_alpha.tsv"),
                sep = "\t", quote = F, row.names = F)
write.table(mean_target_freq(main_beta_table),
                paste0(output_folder, "/mean_target_freq_beta.tsv"),
                sep = "\t", quote = F, row.names = F)

if ("subset" %in% colnames(main_alpha_table)) {
  # store clonotype to subset mapping removing repeated lines
  clonotype_to_subset_alpha <- unique(main_alpha_table[, c("clonotypeKey", "subset")])
  clonotype_to_subset_beta <- unique(main_beta_table[, c("clonotypeKey", "subset")])

  write.table(clonotype_to_subset_alpha, paste0(output_folder, "/clonotype_to_subset_alpha.tsv"),
    sep = "\t", quote = F, row.names = F)
  write.table(clonotype_to_subset_beta, paste0(output_folder, "/clonotype_to_subset_beta.tsv"),
    sep = "\t", quote = F, row.names = F)
} else {
  # Create empty tables
  clonotype_to_subset_alpha <- data.frame(clonotypeKey = character(), subset = character())
  clonotype_to_subset_beta <- data.frame(clonotypeKey = character(), subset = character())

  write.table(clonotype_to_subset_alpha, paste0(output_folder, "/clonotype_to_subset_alpha.tsv"),
    sep = "\t", quote = F, row.names = F)
  write.table(clonotype_to_subset_beta, paste0(output_folder, "/clonotype_to_subset_beta.tsv"),
    sep = "\t", quote = F, row.names = F)
}

# Write robust enrichment (any comparison) mapping
write.table(robust_any_alpha, paste0(output_folder, "/robust_any_alpha.tsv"),
  sep = "\t", quote = F, row.names = F)
write.table(robust_any_beta, paste0(output_folder, "/robust_any_beta.tsv"),
  sep = "\t", quote = F, row.names = F)
