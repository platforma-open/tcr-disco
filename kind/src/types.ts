import type { PlRef } from "@milaboratories/pl-model-common";

/**
 * This block's init-params contract — the shape a block of this kind receives at
 * creation, and exactly what a project template serializes for it.
 *
 * Every field is optional: a block created by hand receives no params at all, so
 * each one falls back to the block's own default (see the model's `init`). A
 * template therefore sets only what it wants to fix and inherits the rest.
 *
 * Scope is the analysis, not the view. The contract carries what the workflow
 * consumes — the projection the model's `args` lambda builds — and nothing that
 * exists for the UI alone (table state, plot configuration, selected chain,
 * sequence-alignment model): re-running a template must reproduce an analysis,
 * not someone's scroll position.
 *
 * Two analysis fields are deliberately absent, and both for the same reason:
 * `cdRef` and `cdSubsetCol` (the CD4/CD8 subset source and its column). The args
 * lambda refuses a `cdRef` whose subset column has not been confirmed to hold
 * CD4/CD8 values, and that confirmation (`cdSubsetColValid`) is only produced by
 * the UI when a user picks the column. A template-set pair would arrive
 * unconfirmed and leave the block permanently args-invalid, so admitting them
 * needs a validation path that does not depend on a user gesture. Adding fields
 * later is additive; removing them is not.
 */
export type BlockParams = {
  /** Block label in the project tree. Falls back to "TCR Disco". */
  title?: string;

  /** Main clonotype dataset — the abundance column the analysis runs on. */
  mainRef?: PlRef;

  /** Metadata column whose values name the groups being compared. */
  contrastFactor?: PlRef;

  /** Values of `contrastFactor` treated as target groups (enrichment is measured in these). */
  numerators?: string[];

  /** Values of `contrastFactor` treated as baseline groups (each numerator is compared against all of these). */
  denominators?: string[];

  /** Further metadata columns entered into the differential-abundance design as covariates. */
  covariateRefs?: PlRef[];

  /** Correlate alpha/beta clonotype frequencies across target samples to predict chain pairs. */
  findTcrAbPairs?: boolean;

  /**
   * Label of the metadata column that collapses paired alpha/beta samples onto one
   * sample id for the pairing correlation. Read only when `findTcrAbPairs` is set.
   */
  pairingMetadataCol?: string;

  /** Minimum count for a clonotype to be kept, per target sample. */
  thresholdCounts?: number;

  /** How many target samples must reach `thresholdCounts`. */
  thresholdSamples?: number;

  /** Minimum log2 fold change for a clonotype to be called enriched (the negative bounds the depleted side). */
  log2FcThreshold?: number;

  /** Maximum adjusted p-value for a clonotype to be called enriched. */
  pAdjThreshold?: number;
};
