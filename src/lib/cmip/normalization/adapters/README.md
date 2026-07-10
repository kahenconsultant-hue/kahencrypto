# CMIP Normalization Adapters

This folder is reserved for future isolated adapters that map existing collector-level shapes into `CmipNormalizationRequest`.

Adapters must remain deterministic and must not fetch, persist, call AI services, read secrets, or alter existing collectors. If a legacy collector shape conflicts with the approved runtime-input contract, the adapter must preserve the legacy module and document the mapping conflict instead of rewriting collector behavior.
