# Example code to create a df_small data frame
# This mimics the structure you showed in your question

# Option 1: Create from scratch with sample data
df_small <- data.frame(
  "6qEZDCxXby33nWPgD1CMk" = c(0.3419027, 0.3370198, 0.2543266, 0.2893317),
  "S7t70OZDQBa4JH8wl0zuj" = c(0.001801212, 0.003880481, 0.001053424, 0.004773765),
  row.names = c("NNF4WHOITJAOS3NZGWAYUHOQ", "PXB6HADBULAEMSOWGEKUKKZR", 
                "QK3HE7WLFYEOF6DZL43WJS34", "Y3IKVTALXFH3BJLS27EBYIER"),
  check.names = FALSE
)

# Option 2: Create programmatically (more realistic)
# Simulate 4 samples and 2 clonotypes
set.seed(123)
n_samples <- 4
sample_ids <- c("NNF4WHOITJAOS3NZGWAYUHOQ", "PXB6HADBULAEMSOWGEKUKKZR", 
                "QK3HE7WLFYEOF6DZL43WJS34", "Y3IKVTALXFH3BJLS27EBYIER")
clonotype_1 <- "6qEZDCxXby33nWPgD1CMk"
clonotype_2 <- "S7t70OZDQBa4JH8wl0zuj"

df_small <- data.frame(
  clonotype_1 = runif(n_samples, 0.2, 0.4),
  clonotype_2 = runif(n_samples, 0.001, 0.01),
  row.names = sample_ids,
  check.names = FALSE
)
colnames(df_small) <- c(clonotype_1, clonotype_2)

# Option 3: Create with some zeros (to test the condition)
df_small_with_zeros <- data.frame(
  "6qEZDCxXby33nWPgD1CMk" = c(0.3419027, 0.0, 0.2543266, 0.2893317),
  "S7t70OZDQBa4JH8wl0zuj" = c(0.001801212, 0.0, 0.001053424, 0.004773765),
  row.names = c("NNF4WHOITJAOS3NZGWAYUHOQ", "PXB6HADBULAEMSOWGEKUKKZR", 
                "QK3HE7WLFYEOF6DZL43WJS34", "Y3IKVTALXFH3BJLS27EBYIER"),
  check.names = FALSE
)

# Test the condition from your code
# Check: all(rowSums(df_small == 0) > 1)
# This checks if all rows have MORE than 1 zero (i.e., both columns are zero)
# For correlation, you probably want: all(rowSums(df_small == 0) != 1)
# (i.e., no row has exactly one zero - both chains co-occur or both are absent)

cat("df_small structure:\n")
print(df_small)
cat("\nNumber of zeros per row:\n")
print(rowSums(df_small == 0))
cat("\nCondition check (all rows have > 1 zero):\n")
print(all(rowSums(df_small == 0) > 1))
cat("\nAlternative condition (no row has exactly 1 zero):\n")
print(all(rowSums(df_small == 0) != 1))

# Test correlation
if (all(rowSums(df_small == 0) != 1) && nrow(df_small) >= 3) {
  cor_result <- cor.test(df_small[, 1], df_small[, 2])
  cat("\nCorrelation result:\n")
  print(cor_result)
}

