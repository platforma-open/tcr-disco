---
"@platforma-open/milaboratories.tcrdisco-enrichment": patch
"@platforma-open/milaboratories.tcrdisco-enrichment.model": patch
"@platforma-open/milaboratories.tcrdisco-enrichment.ui": patch
---

Modernize SDK API usage: migrate block model from BlockModel (legacy) to BlockModelV3 with DataModelBuilder, migrate the UI plugin from defineApp to defineAppV3, and migrate data tables from createPlDataTableV2 to createPlDataTableV3. Existing block instances are migrated via upgradeLegacy with no expected user-visible change.
