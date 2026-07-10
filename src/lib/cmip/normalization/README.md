# CMIP Normalization Layer

Task 003 defines a deterministic adapter layer between future raw collector outputs and the Task 002 runtime-input contract. It does not collect data, fetch URLs, read secrets, persist output, score markets, call AI systems, or generate reports.

## Boundary

The public boundary accepts `unknown` through `normalizeCmipRuntimeInput`. After a shallow request-shape check, typed normalizers produce Task 002-compatible fragments. `buildCmipRuntimeInput` assembles those fragments and validates the final envelope with `validateCmipRuntimeInput`.

## Deterministic Policies

Normalization uses fixed policy versions:

- `CMIP-NORMALIZATION-1.0` for exported normalizer behavior.
- `CMIP-NORMALIZATION-POLICY-1.0` for freshness, unit and quality policy.

Freshness is calculated from `observed_at` to the supplied `data_cutoff`, never from local system time.

Percentages use Task 002's representation: percentage points from `0` to `100`. Decimal percentage coercion is forbidden.

## Source Handling

Sources are normalized into the central Task 002 registry. IDs must be stable and unique. Provider names are trimmed, URLs are parsed without fetching, timestamps are normalized to UTC, and failed or conflict sources cannot verify available, stale or proxy values.

## Asset Identity

The canonical universe is imported from Task 002. Provider aliases are explicit and versioned inside the normalization layer. TON is identity-safe: `coingecko:the-open-network` maps to `crypto:toncoin`; `coingecko:tokamak-network` is an identity conflict. The Task 003 prose listed `crypto:tether`, while Task 002 requires `crypto:tether-usd`; this layer emits the Task 002 canonical ID and treats `crypto:tether` only as a legacy alias.

## Critical Policy

Critical for a normal scheduled brief:

- `meta`
- `run_context`
- `sources`
- `market`
- `assets`
- `data_quality`

Conditionally critical:

- `etf`
- `stablecoins`
- `derivatives`
- `macro`

Non-blocking but confidence-relevant:

- `options`
- `cross_asset`
- `breadth`
- `news`
- `historical_evidence`
- `decision_memory`

Critical normalization errors return `ok: false`. Non-critical gaps may return `ok: true` with warnings if the assembled runtime input still passes Task 002 validation.

## Warning Policy

Warning budgets are enforced by tests:

- `raw-valid.json`: target `0` warnings. Any future warning must be individually justified as an intentional material limitation.
- `raw-partial.json`: warnings are expected, but they must be concise and deduplicated.
- `raw-conflict.json`: critical conflicts remain errors; supporting warnings are allowed only when they add separate information.

Optional missing fields are represented structurally as `status: "missing"` without field-level warning noise. Warning identity is deterministic by code, canonical path, domain, source references and root-cause message. Collapsed warnings may include non-breaking metadata: `occurrenceCount` and `affectedPaths`.

## Quality Model

Input quality is not final analytical confidence. It is a deterministic summary of source quality, freshness, completeness, source agreement, identity certainty and method transparency. Final CMIP confidence remains reserved for later approved tasks.

## Filesystem and Network

Normalization modules do not write files, make network calls, read environment variables, or depend on warm process memory. Static fixtures are repository files used by tests and the sample script only.
