# NIP Update Automation

[Back to v1 design index](../nostr-client-core-design-v1.md)

Automation idea for detecting nostr-protocol/nips changes and producing impact reports.

## In this file

- [NIP Update Automation](#nip-update-automation)
- [NIP Impact Report](#nip-impact-report)

---

## NIP Update Automation

Later, add automation for tracking NIP changes.

### Desired Flow

```txt
Scheduled GitHub Actions workflow
  ↓
Fetch nostr-protocol/nips
  ↓
Compare with previous snapshot
  ↓
Generate NIP impact report
  ↓
If confidence is high, create implementation PR
  ↓
If confidence is low, create issue only
```

### Impact Report Format

```md

## NIP Impact Report

- Changed NIPs:
- Affected event kinds:
- Affected tags:
- Affected client messages:
- Affected relay behavior:
- Parser changes:
- Repository/index changes:
- Projection changes:
- Migration required:
- Test updates:
- Confidence:
```

The LLM should treat NIP markdown files as primary sources. Third-party summaries should not be used as authoritative sources.

---

## Related Files

- [Overview](./overview.md)
- [Migration Plan](./migration-plan.md)
