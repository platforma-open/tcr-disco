#!/usr/bin/env Rscript

# Load required libraries
suppressMessages(library("optparse"))
#----------------------------------------

# Required functions
# 1.  *create_subsets_df(metadata_location, clonotypes_location)*

# Function creates CD4 and CD8 subset list that is used after edgeR analysis for CD4/CD8 clonotype assigning.

# Function requires a link to the metadata file and a link to the folder location with the corresponding CD4 and CD8 T cell clonotype files.

# Metadata is a txt file that contains following columns.

# | file_name                       | sample_id       | subset | chain |
# |---------------------------------|-----------------|--------|-------|
# | filename_x\_CD4.clones_TRAD.tsv | filename_x\_CD4 | CD4    | tra   |
# | filename_y\_CD8.clones_TRAD.tsv | filename_y\_CD8 | CD8    | tra   |
create_subsets_df = function(metadata_table, cd_subset_col, clonotypes, clonotypeKeyCol){
  # additional function to create separate subsets (for CD4 and CD8)
  make_subset = function(metadata_table, clonotypes, population, clonotypeKeyCol){
    # Get from metadata table the sample ids of the requested population subset
    # This will get both tra and trb, but only data from one of them is provided in clonotypes
    pos <- toupper(metadata_table[,"subset"]) == population
    list_samples = metadata_table[pos, "internalSampleId"]

    # Combine all files in metadata_location with information for the same subset/population
    # and reformat them
    cdt_subset = clonotypes[clonotypes[,"internalSampleId"] %in% list_samples,]
    cdt_subset["subset"] = population
    
    return(cdt_subset[c(clonotypeKeyCol, "count", "fraction", "subset")])
  }
  
  # create separate CD4 and CD8 subsets using function above
  metadata_table["subset"] = metadata_table[,cd_subset_col]
  cd4_subset = make_subset(metadata_table, clonotypes, "CD4", clonotypeKeyCol)
  cd8_subset = make_subset(metadata_table, clonotypes, "CD8", clonotypeKeyCol)

  #merge two subset by internalSampleId column and define clonotype subset
  subsets = merge(cd4_subset, cd8_subset, by = clonotypeKeyCol, all = T)
  # Keep only unique clonotypes
  subsets = subsets[!duplicated(subsets[[clonotypeKeyCol]]), ]
  # filter(!grepl("\\*|\\_", internalSampleId)) %>%   #filter-out stopcodons and frameshifts
  
  # Define subset based on conditions
  # Handle NA values in counts (set to 0 for comparison)
  count_x = ifelse(is.na(subsets$count.x), 0, subsets$count.x)
  count_y = ifelse(is.na(subsets$count.y), 0, subsets$count.y)
  
  subsets$subset = ifelse(subsets$subset.x == "CD4" & is.na(subsets$subset.y), "CD4",
                   ifelse(count_x > 0 & count_y > 0 & count_x / count_y >= 5, "CD4",   #assign to CD4 by 5-to-1 ratio
                   ifelse(subsets$subset.y == "CD8" & is.na(subsets$subset.x), "CD8",
                   ifelse(count_y > 0 & (count_x == 0 | (count_x > 0 & count_y / count_x >= 5)), "CD8", NA))))   #assign to CD8 by 5-to-1 ratio
  
  # Select and rename columns
  subsets = subsets[, c(clonotypeKeyCol, "count.x", "fraction.x", "count.y", "fraction.y", "subset")]
  colnames(subsets)[colnames(subsets) == "count.x"] = "umi_count_CD4"
  colnames(subsets)[colnames(subsets) == "fraction.x"] = "umi_freq_CD4"
  colnames(subsets)[colnames(subsets) == "count.y"] = "umi_count_CD8"
  colnames(subsets)[colnames(subsets) == "fraction.y"] = "umi_freq_CD8"
  
  # Calculate subset_frequency
  subsets$subset_frequency = ifelse(!is.na(subsets$subset) & subsets$subset == "CD4", log10(subsets$umi_freq_CD4),
                             ifelse(!is.na(subsets$subset) & subsets$subset == "CD8", log10(subsets$umi_freq_CD8), 0))

  return(subsets)
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
  make_option(c("--metadata"),
    type = "character", default = "metadata.tsv",
    help = "Path to metadata TSV file", metavar = "character"
  ),
  make_option(c("--cd_alpha"),
    type = "character", default = NA,
    help = "Path to CD alpha clonotypes TSV file", metavar = "character"
  ),
  make_option(c("--cd_beta"),
    type = "character", default = NA,
    help = "Path to CD beta clonotypes TSV file", metavar = "character"
  ),
  make_option(c("--cd_subset_col"),
    type = "character", default = NA,
    help = "Metadata column with CD4/8 information", metavar = "character"
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
metadata <- opt$metadata
main_alpha <- opt$main_alpha
main_beta <- opt$main_beta
cd_alpha <- opt$cd_alpha
cd_beta <- opt$cd_beta
output_folder <- opt$output
cd_subset_col <- opt$cd_subset_col

# test
# metadata <- "./metadata.tsv"
# main_alpha <- "./mainAlpha.tsv"
# main_beta <- "./mainBeta.tsv"
# cd_alpha <- "./cdAlpha.tsv"
# cd_beta <- "./cdBeta.tsv"
# output_folder <- "./results"
# cd_subset_col <- "Subset"

print(paste0("cd_alpha: ", cd_alpha))
print(paste0("cd_beta: ", cd_beta))
print(paste0("cd_subset_col: ", cd_subset_col))
print(paste0("output_folder: ", output_folder))
print(paste0("metadata: ", metadata))
print(paste0("main_alpha: ", main_alpha))
print(paste0("main_beta: ", main_beta))

## 1.1. TCR Discovery
### Load main data
metadata_table <- read.table(metadata, header = TRUE, sep = "\t", stringsAsFactors = FALSE)
main_alpha_table <- read.table(main_alpha, header = TRUE, sep = "\t", stringsAsFactors = FALSE)
main_beta_table <- read.table(main_beta, header = TRUE, sep = "\t", stringsAsFactors = FALSE)

# Check if any internalSampleId appears both in alpha and beta we remove it assuming contamination
repeatedSamples <- unique(main_alpha_table$internalSampleId)
repeatedSamples <- repeatedSamples[repeatedSamples %in% unique(main_beta_table$internalSampleId)]
if (length(repeatedSamples) > 0) {
  alpha_counts <- table(main_alpha_table$internalSampleId)[repeatedSamples]
  beta_counts <- table(main_beta_table$internalSampleId)[repeatedSamples]
  
  remove_from_alpha <- repeatedSamples[alpha_counts < beta_counts]
  remove_from_beta <- repeatedSamples[beta_counts <= alpha_counts]
  # Remove duplicated sampleIds from files in which they appear less (when comparing between tcra and tcrb)
  main_alpha_table <- main_alpha_table[!main_alpha_table$internalSampleId %in% remove_from_alpha, ]
  main_beta_table <- main_beta_table[!main_beta_table$internalSampleId %in% remove_from_beta, ]
  
  print(paste0("Removed ", length(remove_from_alpha), " repeated sample(s) from alpha"))
  print(paste0("Removed ", length(remove_from_beta), " repeated sample(s) from beta"))

}

# Load CD4 and CD8 dataframe (optional step)
if (!is.na(cd_alpha) && !is.na(cd_beta) && !is.na(cd_subset_col)) {
  # Load CD data
  cd_alpha_table <- read.table(cd_alpha, header = TRUE, sep = "\t", stringsAsFactors = FALSE)
  cd_beta_table <- read.table(cd_beta, header = TRUE, sep = "\t", stringsAsFactors = FALSE)
  clonotypeKeyCol <- "clonotypeKey"

  subsets_tra = NULL
  subsets_trb = NULL
  subsets_tra = create_subsets_df(metadata_table, cd_subset_col, cd_alpha_table, clonotypeKeyCol)
  subsets_trb = create_subsets_df(metadata_table, cd_subset_col, cd_beta_table, clonotypeKeyCol)

  # Assign T cell subset to main data
  cat("\n Assigning T cell subset...")
  reorder_cols = function(tbl) {
    cols = colnames(tbl)
    # Remove clonotypeKeyCol if it exists to avoid duplicates
    cols = cols[cols != clonotypeKeyCol]
    idx = match("internalSampleId", cols)
    tbl[, c(cols[1:idx], clonotypeKeyCol, cols[(idx+1):length(cols)])]
  }
  main_alpha_table = reorder_cols(merge(main_alpha_table, subsets_tra, by = clonotypeKeyCol, all.x = T))
  main_beta_table = reorder_cols(merge(main_beta_table, subsets_trb, by = clonotypeKeyCol, all.x = T))
  cat("Done")
} else {
  cat("\n No CD4/CD8 T cell subset available")
}

# Write merged tables
if (!dir.exists(output_folder)) {
    dir.create(output_folder, recursive = TRUE)
  }
write.table(main_alpha_table, paste0(output_folder, "/main_alpha_table.tsv"), sep = "\t", row.names = F, quote = F)
write.table(main_beta_table, paste0(output_folder, "/main_beta_table.tsv"), sep = "\t", row.names = F, quote = F)
