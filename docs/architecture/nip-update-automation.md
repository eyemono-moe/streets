# NIP Update Automation

`streets` should eventually detect changes in `nostr-protocol/nips` and produce a reviewable impact report. Implementation PRs should only be generated when confidence is high.

## Conservative Initial Flow

```txt
Scheduled workflow
  ↓
Fetch nostr-protocol/nips
  ↓
Compare with stored snapshot
  ↓
Generate NIP impact report
  ↓
Create Linear/GitHub issue
  ↓
Optionally create implementation PR after confidence improves
```

## Impact Report Fields

- Changed NIPs
- Affected event kinds
- Affected tags
- Affected client messages
- Affected relay behavior
- Parser changes
- Repository/index changes
- Projection changes
- Migration required
- Test updates
- Confidence

## Rules

- NIP markdown files are authoritative.
- Third-party summaries are only hints.
- Start by creating issues and reports, not auto-merging generated code.
- Generated PRs must include tests or explain why docs-only changes need none.
- Changes should reference the exact NIP files and commits used as input.
