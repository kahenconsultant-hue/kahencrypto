# Governance And Versioning

Versioned artifacts:

- specification version
- reasoning rule version
- prompt version
- schema version
- calculation version

Rules:

- Future reasoning changes require a version increment.
- Published decisions preserve the version used.
- No silent rule changes.
- No production logic may diverge from the approved specification.
- Codex tasks must reference exact spec versions.
- Backward-incompatible changes require migration notes.
- Published decision memory must remain evaluable under the version that produced it.
- Any material change requires an ADR.
- Review and approval status must be recorded before production use.

Backward compatibility:

- Additive documentation may keep the same version only when it does not change behavior.
- Enum changes, threshold changes, confidence cap changes, and decision synthesis changes require a new version.
- Output-contract changes must be coordinated with Task 001 schema versioning.
- Runtime-input changes must be coordinated with Task 002 schema versioning.
