#!/usr/bin/env Rscript

# Load required libraries
suppressMessages(library("optparse"))
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

# Merge Robust_Enrichment from deg tables into main tables
robust_alpha <- unique(deg_alpha_table[, c("clonotypeKey", "Robust_Enrichment"), drop = FALSE])
main_alpha_table <- merge(main_alpha_table, robust_alpha, by = "clonotypeKey", all.x = TRUE)
main_alpha_table$Robust_Enrichment[is.na(main_alpha_table$Robust_Enrichment)] <- "Non-robust"

robust_beta <- unique(deg_beta_table[, c("clonotypeKey", "Robust_Enrichment"), drop = FALSE])
main_beta_table <- merge(main_beta_table, robust_beta, by = "clonotypeKey", all.x = TRUE)
main_beta_table$Robust_Enrichment[is.na(main_beta_table$Robust_Enrichment)] <- "Non-robust"

# Store the tables
if (!dir.exists(output_folder)) {
  dir.create(output_folder, recursive = TRUE)
}

if ("subset" %in% colnames(main_alpha_table)) {
  keep_cols1 <- c("internalSampleId", "clonotypeKey", "fraction", "Robust_Enrichment", "subset")
  keep_cols2 <- c("clonotypeKey", "subset")
} else {
  keep_cols1 <- c("internalSampleId", "clonotypeKey", "fraction", "Robust_Enrichment")
  keep_cols2 <- c("clonotypeKey")
}
write.table(main_alpha_table[, keep_cols1], 
                paste0(output_folder, "/main_alpha_frequencies.tsv"), 
                sep = "\t", quote = F, row.names = F)
write.table(main_beta_table[, keep_cols1], 
                paste0(output_folder, "/main_beta_frequencies.tsv"), 
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
