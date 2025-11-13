#!/usr/bin/env Rscript

# Load required libraries
suppressMessages(library(devtools))
suppressMessages(library(tcrgrapher))
suppressMessages(library(tidyverse))
suppressMessages(library(data.table))
suppressMessages(library(edgeR))
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
create_subsets_df = function(metadata_table, subset, clonotypes){
  # additional function to create separate subsets (for CD4 and CD8)
  make_subset = function(metadata_table, subset, clonotypes, population){
    # Get from metadata table the sample ids of the requested population subset
    # This will get both tra and trb, but only data from one of them is provided in clonotypes
    pos <- toupper(metadata_table[,subset]) == population
    list_samples = metadata_table[pos, "internalSampleId"]

    # Combine all files in metadata_location with information for the same subset/population
    # and reformat them
    cdt_subset = clonotypes[clonotypes[,"internalSampleId"] %in% list_samples,]
    cdt_subset["feature"] = paste0(cdt_subset[,"CDR3aa"], " ", cdt_subset[,"VGene"])
    cdt_subset[subset] = population
    
    return(cdt_subset[c("feature", "count", "fraction", subset)])
  }
  
  # create separate CD4 and CD8 subsets using function above
  cd4_subset = make_subset(metadata_table, subset, clonotypes, "CD4")
  cd8_subset = make_subset(metadata_table, subset, clonotypes, "CD8")

  #merge two subset by feature column and define clonotype subset
  subsets = merge(cd4_subset, cd8_subset, by = "feature", all = T) %>%
    distinct( feature, .keep_all = TRUE) %>%   #keep only unique clonotypes
    filter(!grepl("\\*|\\_", feature)) %>%   #filter-out stopcodons and frameshifts
    mutate(subset = case_when(subset.x == "CD4" & is.na(subset.y) ~ "CD4",
                              count.x / count.y >= 5 ~ "CD4",   #assign to CD4 by 5-to-1 ratio
                              subset.y == "CD8" & is.na(subset.x) ~ "CD8",
                              count.y / count.x >= 5 ~ "CD8")) %>%   #assign to CD8 by 5-to-1 ratio
    select(feature, umi_count_CD4 = "count.x", umi_freq_CD4 = "fraction.x",
           umi_count_CD8 = "count.y", umi_freq_CD8 = "fraction.y", subset) %>%
    mutate(subset_frequency = case_when(subset=="CD4" ~ log10(umi_freq_CD4),
                                      subset=="CD8" ~ log10(umi_freq_CD8),
                                      T ~ 0))

  return(subsets)
}

# 2.  *compare_one_vs_each(ag, edgeR_output, number_of_comparisons)*

# Function performs pairwise comparison within edger dataframe and keeps onlythose clonotypes, that were significantly (FDR \< 0.05) expanded/enriched in each individual comparison.
# Example: if there are 3 antigens and non-stimulated control in the experiment (4 conditions in total) - 3 pairwise comparisons should be applied (number_of_comparisons=3). For 3 conditions - 2 pairwise comparisons; and so on.
# In general, number_of_comparisons = n-1, where n - number of individual condition in th ag column of metadata_tra/trb
# Get the feature value of all clonotypes over-represented in "ag" antibody in "number_of_comparisons" comparisons
# number_of_comparisons is set to be all posible combinations of selected "ag" vs the rest
compare_one_vs_each = function(ag, edgeR_output, number_of_comparisons=3){
  #Get list of all comparisons including ag and excluding "all"
  comp_list <- unique(edgeR_output$comparison)
  comp_list <- comp_list[grepl(ag, comp_list) & !grepl("all", comp_list)]
 #Filter independent expanded clonotypes 
  independ.exp = edgeR_output %>%
    filter(comparison %in% comp_list) %>%
    #adjust logFC value if Ag is located at second place in comparison (after "vs")
    mutate(logFC.adj = if_else(grepl(paste0("vs.*",ag), comparison), logFC*-1, logFC)) %>% 
    filter(logFC.adj>0) %>%
    count(feature) %>%
    filter(n==number_of_comparisons) %>%
    pull(feature)

  return(independ.exp)
}

compare_numerators_vs_denominator = function(contrast_col, numerators, 
                                             denominator, edger) {
  # Build patterns for valid comparisons (numerator vs denominator/all, or reverse)
  num_prefixes <- paste0("(", contrast_col, ")?", numerators)
  denom_pattern <-  paste0("(", contrast_col, ")?", denominator)
  valid_pattern <- paste0("^(", paste(num_prefixes, collapse = "|"), ") vs ", denom_pattern, "$")
  reverse_pattern <- paste0("^", denom_pattern, " vs (", paste(num_prefixes, collapse = "|"), ")$")
  
  edger %>%
    filter(grepl(valid_pattern, comparison) | grepl(reverse_pattern, comparison)) %>%
    mutate(
      # Check if numerator is after "vs" (needs reordering) - same logic as compare_one_vs_each
      needs_reorder = grepl(paste0("vs.*(", paste(num_prefixes, collapse = "|"), ")$"), comparison),
      # Reorder comparison and flip logFC when needed
      comparison = if_else(needs_reorder, sub("^(.+) vs (.+)$", "\\2 vs \\1", comparison), comparison),
      logFC = if_else(needs_reorder, logFC * -1, logFC)
    ) %>%
    # Keep only numerator-first format
    filter(grepl(paste0("^(", paste(num_prefixes, collapse = "|"), ") vs"), comparison)) %>%
    select(-needs_reorder)
}

# 3.  *apply_threshold_filtering(ct_table, antigen, threshold_counts, threshold_samples)*

# Function filters ct_table (or ft_table) by predefined threshold:
# after edgeR analysis keeps in the antigen-specific ct_table (or ft_table) only those clonotypes that were detected in antigen specific replicates (*threshold_samples*) with corresponding UMI counts (*threshold_counts*) or frequency.
apply_threshold_filtering = function(ctable, antigen, metadata, antigen_column,
                                     sample_id_col, threshold_counts = 10,
                                     threshold_samples = 3) {
  #create count table with Ag-expanded clones
  pos <- metadata[[antigen_column]] == antigen
  sub_count_table <- ctable[,metadata[pos, get(sample_id_col)]]
  sub_count_table <- sub_count_table[rowSums(sub_count_table >= threshold_counts) >= threshold_samples,]
  count_table <- ctable[rownames(ctable) %in% rownames(sub_count_table),]

  return(count_table)
}

# 4.  *run_TCRdisco(clonotypes_folder, clonotypes_metadata, chain, output_folder)*

# Main function that runs TCR discovery workflow in one step. Returns full count_table, edger table, and ct/ft table of expanded/enriched clonotypes per specific antigen. All tables are stored in the defined output_folder.
run_TCRdisco = function(merged_table, metadata_table, subsets_tcr,
                        output_folder, sample_id_col, contrast_col = "ag",
                        numerators, denominator, chain = "tra", fdr_cut = 0.05,
                        threshold_counts = 10, threshold_samples = 3) {
  # Create output folder if it doesn't exist
  if (!dir.exists(output_edger_results)) {
    dir.create(output_edger_results, recursive = TRUE)
  }
  # Lets split input datasets in file for TCRgrapher
  metadata_tcr <- metadata_table[metadata_table[,"internalSampleId"] %in% 
              merged_table[,"internalSampleId"], ]
  metadata_tcr["file"] = paste0( metadata_tcr[,"internalSampleId"], '.tsv')
  # Store per sample files for TCRgrapher
  for (sample in unique(metadata_tcr[,"internalSampleId"])) {
    write.table(merged_table[merged_table[,"internalSampleId"] == sample,], 
      paste0(output_edger_results, sample, ".tsv"), sep = "\t", row.names = F, quote = F)
  }
  # Store metadata file for TCRgrapher
  metadata_path <- paste0(output_edger_results, "metadata.tsv")
  write.table(metadata_tcr, metadata_path, sep = "\t", row.names = F, quote = F)
  # get index locations of column sample_id_col and "file" in metadata_tcr
  file_col_idx <- which(colnames(metadata_tcr) == "file")
  sample_id_col_idx <- which(colnames(metadata_tcr) == sample_id_col)
  
  # get index locations of columns "count", "CDR3nt", "CDR3aa", "VGene", "JGene"
  count_col_idx <- which(colnames(merged_table) == "count")
  cdr3_nt_col_idx <- which(colnames(merged_table) == "CDR3nt")
  cdr3_aa_col_idx <- which(colnames(merged_table) == "CDR3aa")
  vgene_col_idx <- which(colnames(merged_table) == "VGene")
  jgene_col_idx <- which(colnames(merged_table) == "JGene")

  cat("Generating TCRgrapher object...")
  TCRgrObject <- TCRgrapher(output_edger_results, count_col_idx, cdr3_nt_col_idx, 
                            cdr3_aa_col_idx, vgene_col_idx, jgene_col_idx,
                            metadata_path, file_col_idx, sample_id_col_idx)

  #create feature as CDR3aa+V gene segment (same way we did with CD4/CD8 subsets)
  TCRgrCounts <- TCRgrapherCounts(TCRgrObject,  v_gene = TRUE)
  cat("Done")
  #align columns in the count table in the same order as in metadata
  count_table(TCRgrCounts) = count_table(TCRgrCounts) %>%
    select(metadata(TCRgrObject)[[sample_id_col]])
  cat("\n Launching edgeR...")
  #launch edgeR pipeline. Use metadata "ag" column from metadata as condition for comparison
  edger <- edgeR_pipeline(TCRgrCounts, contrast_col)

  # uses FDR < 0.05 as filter, keeps only productive clonotypes. Adjust if needed
  # Also, extract cdr3 aa and v_gene info from feature column
  edger = edger %>%
    mutate(cdr3aa = str_extract(feature, "[:graph:]+(?= TR)"),
           v_gene = str_extract(feature, "TR.*")) %>%
    filter(FDR<fdr_cut, !grepl("\\*|\\_", feature)) %>%
    relocate(cdr3aa, v_gene, .after = feature)
  cat("Done")

  # add annotation about CD4/CD8 T cell subset if it's available
  if (!is.null(subsets_tcr)) {
    cat("\n Assigning T cell subset...")
    edger = merge(edger, subsets_tcr, by = "feature", all.x = T) %>%
      relocate(subset, .after = v_gene)
    cat("Done")
  } else {
    cat("\n No CD4/CD8 T cell subset available")
  }

  #create count table
  ct <- count_table(TCRgrCounts) %>%
    filter(!grepl("\\*|\\_", rownames(.))) #filter non-functional clonotypes

  #export dataframes
  write.table(ct, paste0(output_folder, "count_table_full_", chain, ".tsv"), sep = "\t", row.names = T, quote = F)
  write.table(edger, paste0(output_folder, "edger_", chain, ".tsv"), sep = "\t", row.names = F, quote = F)

  #start post-edgeR filtering
  cat("\n Performing additional post-edgeR filtering...")
  #define list of antigens from the clonotypes metadata
  list_of_antigens = unique(metadata(TCRgrCounts)[[contrast_col]])
  cat("\n all pairwise comparisons...")
  #go through conditions for edger
  # Get for each "ag" a list of all clonotypes that have FC > 0 against all the other "ag"s 
  edger_list = numerators %>%
    set_names() %>%
    map(~ compare_numerators_vs_denominator(.x, edger, 
    number_of_comparisons = (length(list_of_antigens)-1)))

  edger_table = compare_numerators_vs_denominator(contrast_col, numerators, denominator,
                                                  edger)
  cat("Done")
  #blank list of count and frequency tables
  ct_list <- list()
  ft_list <- list()
  
  #convert counts into frequency
  ft = ct %>%
    mutate(across(everything(.), ~ .x / sum(.x, na.rm = TRUE)))
  
  #fill count and frequency tables with detected clonotypes by antigen
  cat("\n additional UMI threshold...")
  for (ag in list_of_antigens) {
    #fill count table per each Ag
    ct_list[[ag]] <- ct[rownames(ct) %in% edger_list[[ag]],]
    # Keep only clonotypes that pass minimum threshold counts for relevant ag samples
    ct_list[[ag]] <- apply_threshold_filtering(ctable = ct_list[[ag]], 
                                               antigen = ag,
                                               metadata = metadata(TCRgrCounts),
                                               antigen_column = contrast_col,
                                               sample_id_col = sample_id_col,
                                               threshold_counts = threshold_counts,
                                               threshold_samples = threshold_samples)    
    #fill frequency table per each Ag
    ft_list[[ag]] <- ft[rownames(ft) %in% rownames(ct_list[[ag]]),]
    
    #exporting results
    # REMOVED DATA CONDITION. Even if they are empty, we need to allways have all outputs for platforma
    #if (nrow(ft_list[[ag]]) != 0) {
    cat(paste0("\n", ag, " - saving ct & ft tables \n ct location: ", 
               output_folder, "ct_filt_", ag, "_", chain, ".tsv",
               "\n ft location: ", output_folder, "ft_filt_", ag, "_", chain, ".tsv"))
    
    #save ft_ and ct_filtered in the output_folder
    write.table(ct_list[[ag]], paste0(output_folder, 
                                      "ct_filt_", ag, "_", chain, ".tsv"), 
                sep = "\t", quote = F)
    write.table(ft_list[[ag]], paste0(output_folder, 
                                      "ft_filt_", ag, "_", chain, ".tsv"), 
                sep = "\t", quote = F)
    cat("\nDone \n")
    #} 
  }
}

# 5.  *find_pairs2(ag, clonotypes_tra, clonotypes_trb)*

# Function predicts TCRab pairs from the frequency tables of expanded TCR alpha and TCR beta clonotypes.
# For prediction function calculates Pearson correlation for each possible TRA-TRB combination within Ag-specific samples and applies FDR correction (Benjamini--Hochberg). Default thresholds are: FDR \< 0.05 and R \> 0.95. For correlation analysis of the potential pair both chains should be present or absent within the same samples.
# Frequency tables for both TCR chains should have the sample column names; otherwise rename them
find_pairs <- function(ag = NA, clonotypes_tra, clonotypes_trb, metadata, antigen_column,
                       p_adj_cut=0.05, estimate_cut=0.95) {
  # merge TRA and TRB clonotypes into one dataframe
  count_table_ab <- t(rbind(clonotypes_tra, clonotypes_trb))
  
  # analyze only Ag-specific samples
  if (!is.na(ag)) {
    pos <- metadata[[antigen_column]] == ag
    count_table_ab <- count_table_ab[metadata[pos, get(sample_id_col)], , drop = FALSE]
  }
  
  # generate all possible alpha-beta pairs
  predicted_pairs = expand_grid(tra = rownames(clonotypes_tra), trb = rownames(clonotypes_trb)) %>%
    mutate(test = map2(tra, trb, ~ {
        df_small <- count_table_ab[, c(.x, .y), drop = FALSE]
        #check whether both chains are present or absent within replicates
        if (all(rowSums(df_small == 0) != 1)) {
          cor.test(df_small[, 1], df_small[, 2])
        }})) %>%
    #drops rows where no correlation test was performed
    filter(!map_lgl(test, is.null)) %>%
    #fill dataframe with corr.test results
    transmute(
      tra,
      trb,
      estimate = map_dbl(test, ~ .x$estimate),
      p.value  = map_dbl(test, ~ .x$p.value)) %>%
    #perform FDR adjustment and filter by R & FDR threshold
    mutate(p.adj = p.adjust(p.value, method = "fdr")) %>%
    filter(p.adj < p_adj_cut, estimate > estimate_cut)
  
  #save ft_ and ct_filtered in the output_folder
  write.table(predicted_pairs, paste0(output_edger_results, "pairs_", ag, ".tsv"), 
                  sep = "\t", quote = F, row.names = F)
  
  return(predicted_pairs)
}

#----------------------------------------

# Main code

# Parse command line arguments
option_list <- list(
  make_option(c("--main-alpha"),
    type = "character", default = "mainAlpha.tsv",
    help = "Path to main TCR alpha clonotypes TSV file", metavar = "character"
  ),
  make_option(c("--main-beta"),
    type = "character", default = "mainBeta.tsv",
    help = "Path to main TCR beta clonotypes TSV file", metavar = "character"
  ),
  make_option(c("--metadata"),
    type = "character", default = "metadata.tsv",
    help = "Path to metadata TSV file", metavar = "character"
  ),
  make_option(c("--cd-alpha"),
    type = "character", default = "cdAlpha.tsv",
    help = "Path to CD alpha clonotypes TSV file", metavar = "character",
    optional = TRUE
  ),
  make_option(c("--cd-beta"),
    type = "character", default = "cdBeta.tsv",
    help = "Path to CD beta clonotypes TSV file", metavar = "character",
    optional = TRUE
  ),
  make_option(c("--cd-subset-col"),
    type = "character", default = "subset",
    help = "Metadata column with CD4/8 information", metavar = "character",
    optional = TRUE
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

output_edger_results <- paste0(output_folder, "/edger_results/")
# test
metadata <- "/Users/julen/Downloads/miltenyi_test/oncolumn_TCR_discovery/platforma/0x5B60C6/metadata.tsv"
main_alpha <- "/Users/julen/Downloads/miltenyi_test/oncolumn_TCR_discovery/platforma/0x5B60C6/mainAlpha.tsv"
main_beta <- "/Users/julen/Downloads/miltenyi_test/oncolumn_TCR_discovery/platforma/0x5B60C6/mainBeta.tsv"
cd_alpha <- "/Users/julen/Downloads/miltenyi_test/oncolumn_TCR_discovery/platforma/0x5B60C6/cdAlpha.tsv"
cd_beta <- "/Users/julen/Downloads/miltenyi_test/oncolumn_TCR_discovery/platforma/0x5B60C6/cdBeta.tsv"
output_folder <- "/Users/julen/Downloads/miltenyi_test/oncolumn_TCR_discovery/platforma/0x5B60C6/results"
cd_subset_col <- "subset"
# Get from platforma
sample_id_col <- "sample_id"
contrast_col <- "ag"
fdr_cut <- 0.05
threshold_counts <- 10
threshold_samples <- 3
numerators <- c("MART1", "EBV", "CMV", "all")
denominator <- "Control"



## 1.1. TCR Discovery
# Load metadata
metadata_table <- read.table(metadata, header = TRUE, sep = "\t", stringsAsFactors = FALSE)
cd_alpha_table <- read.table(cd_alpha, header = TRUE, sep = "\t", stringsAsFactors = FALSE)
cd_beta_table <- read.table(cd_beta, header = TRUE, sep = "\t", stringsAsFactors = FALSE)
# Load CD4 and CD8 dataframe (optional step)
subsets_tra = NULL
subsets_trb = NULL
if (!is.null(cd_alpha) && !is.null(cd_beta)) {
  subsets_tra = create_subsets_df(metadata_table, cd_subset_col, cd_alpha_table)
  subsets_trb = create_subsets_df(metadata_table, cd_subset_col, cd_beta_table)
}

### run_TCRdisco() per chain
main_alpha_table <- read.table(main_alpha, header = TRUE, sep = "\t", stringsAsFactors = FALSE)
main_beta_table <- read.table(main_beta, header = TRUE, sep = "\t", stringsAsFactors = FALSE)
# TRA
run_TCRdisco(main_alpha_table, metadata_table, subsets_tra, 
        output_edger_results, sample_id_col, contrast_col, 
        numerators, denominator, chain="tra", fdr_cut=fdr_cut,
        threshold_counts=threshold_counts, threshold_samples=threshold_samples)

# TRB
run_TCRdisco(main_beta_table, metadata_table, subsets_trb,
        output_edger_results, sample_id_col, contrast_col, 
        numerators, denominator, chain="trb", fdr_cut=fdr_cut,
        threshold_counts=threshold_counts, threshold_samples=threshold_samples)




# Validate required arguments
if (is.null(opt$input)) {
  stop("Input file is required. Use --input to specify the path.")
}

# Read input data
cat("Reading input data from:", opt$input, "\n")
data <- read.table(opt$input, header = TRUE, sep = "\t", stringsAsFactors = FALSE)

# TODO: Implement TCR disco enrichment analysis here
# For now, create a placeholder output
results <- data.frame(
  clonotypeKey = data$clonotypeKey,
  enrichment_score = runif(nrow(data)),
  p_value = runif(nrow(data)),
  stringsAsFactors = FALSE
)

# Write results
cat("Writing results to:", opt$output, "\n")
write.csv(results, opt$output, row.names = FALSE)

cat("Analysis complete.\n")

