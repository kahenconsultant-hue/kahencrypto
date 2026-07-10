# Operational Principles

| Principle | Definition | Reason | Practical consequence | Prohibited behavior |
| --- | --- | --- | --- | --- |
| evidence before narrative | Evidence is classified before any explanation is written. | Language can overfit noise. | Narrative must cite evidence IDs. | Writing a story first and finding data later. |
| deterministic calculations before language generation | Calculations, thresholds, and validation happen before prose. | Reproducibility requires stable facts. | Generated text may explain but not calculate secretly. | Letting a model invent scores or thresholds. |
| no invented values | Missing inputs remain missing. | Fabricated values create false certainty. | Nulls and unavailable states stay visible. | Filling gaps with plausible numbers. |
| no hidden fallback | Fallback source use must be explicit. | Users must know when quality is weaker. | Fallback tier appears in evidence and audit. | Substituting a source silently. |
| no silent data substitution | A proxy must be labeled as proxy. | Proxy data is not equivalent to direct data. | Proxy method and calculation are required. | Treating proxy as verified direct input. |
| conflict visibility | Conflicts remain visible until resolved. | A hidden conflict corrupts confidence. | Final output lists material unresolved conflicts. | Averaging conflicting values silently. |
| missing-data visibility | Critical gaps are part of the conclusion. | Absence of evidence changes confidence. | Missing fields appear in data quality and audit. | Omitting unavailable domains from the report. |
| source hierarchy | Primary authoritative sources outrank fallback and proxy sources. | Not all sources have equal evidentiary weight. | Source tier affects reliability. | Counting many weak copies as stronger than one verified source. |
| freshness awareness | Evidence quality depends on age and domain-specific freshness. | Delayed macro and real-time prices have different clocks. | Stale data caps confidence. | Forward-filling beyond thresholds without warning. |
| reproducibility | A published conclusion can be reconstructed from stored input, rules, and versions. | Decision memory and audits need reviewability. | Spec, schema, calculation, and source versions are recorded. | Producing conclusions with no traceable inputs. |
| stable terminology | Canonical names must be reused across tasks. | Users and tests need a shared vocabulary. | New terms require versioned approval. | Renaming postures or verdicts casually. |
| model abstention | The model may say evidence is insufficient. | Forced decisions increase false authority. | `abstain` is a valid published posture with explicit resume evidence. | Treating abstention as bearishness or manufacturing confidence to avoid a no-action state. |
| no personalized advice | CMIP states a model posture, not user-specific investment advice. | User risk profiles are not modeled here. | Use hypothetical committee language. | Saying "you should buy" or "you should sell". |
| audit-first design | Every conclusion is traceable. | Accountability matters more than persuasion. | Source refs, input paths, evidence refs, and rule refs are required. | Unexplained conclusions. |
| versioned reasoning rules | Rule changes are explicit and reviewed. | Silent rule changes break decision memory. | Future tasks cite exact spec versions. | Production logic diverging from approved spec. |
