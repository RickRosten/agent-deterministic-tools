# Changesets

Every pull request that changes a published package adds a changeset:

```bash
npx changeset
```

Pick the affected packages and the semver bump. Remember that the tool API (tool names,
input/output schemas, semantics) is public API: see
[docs/contributing.md](../docs/contributing.md#versioning).
