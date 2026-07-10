# CMIP Intelligence Architecture Specification

Version: `CMIP-INTELLIGENCE-SPEC-1.0`

This folder defines how the CMIP Investment Committee Decision Engine must reason between the normalized runtime input contract from Task 002 and the canonical output contract from Task 001.

It controls:

- evidence interpretation
- evidence quality and independence
- conflict handling
- hypothesis formation and rejection
- historical evidence and analogy usage
- decision memory evaluation
- confidence attribution
- audit traceability
- plain Persian explanation requirements

It does not implement:

- collectors
- scoring runtime
- Decision Engine runtime
- Confidence Engine runtime
- Historical Engine runtime
- prompt building
- OpenAI or external API calls
- persistence
- UI, charts, HTML or PDF
- cron or scheduling

Future CMIP engineering tasks that implement reasoning logic must cite this exact specification version and must not diverge silently. If production logic needs a different rule, the change requires a version increment, review, and an ADR before implementation.

Task 001 remains the output authority. Task 002 remains the runtime input authority. This specification is the official intelligence bridge between them.
