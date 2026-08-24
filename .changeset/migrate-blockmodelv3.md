---
"@platforma-open/milaboratories.tcrdisco-enrichment.model": minor
"@platforma-open/milaboratories.tcrdisco-enrichment.ui": minor
"@platforma-open/milaboratories.tcrdisco-enrichment": minor
---

Migrate block to BlockModelV3. Persisted state is unchanged for existing projects via a legacy upgrader; UI bindings move from `app.model.args` / `app.model.ui` to the unified `app.model.data`. The CD4/CD8 subset validation no longer writes back from a watched output — the validity is snapshotted into data only on the user's column selection.

Fix a latent data-loss bug in the contrast-factor watcher: it was watching a fresh `[contrastFactor]` array, so Vue saw a change on every `data` reconcile and cleared the user's numerator/denominator selection even when the contrast factor was unchanged. It now watches the ref directly and only resets on a genuine change.

Fix the data tables never settling ("error ↔ updating" loop): `usePlDataTableSettingsV2` was wrapped in `computed(() => …().value)`, re-instantiating the composable every tick and driving a non-converging table recompute / stale-handle loop. It is now called once at setup (Main and Pairs pages).
