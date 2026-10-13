# PF2e Party Quick Sell — v1.0.0-rc.2

Review hardening since rc.1:

- Missing confirmation APIs no longer permit normal-click sales.
- Invalid setting types and unavailable settings fail closed, without coercion.
- Runtime checks enforce the manifest minimum Foundry build 14.361.
- Partial-sale document APIs are checked before writing recovery journals.
- Socket replay retention is bounded to 1024 requests per five-minute window;
  saturation rejects further requests rather than growing GM memory indefinitely.
- Rebuilt release artifacts contain the source documentation for this tag.
- Sender-bound socket requests/replies, bounded completed-sale IDs.
- Strict actual Party Stash scope; orphaned rows are excluded.
- Stale whole-stack controls reject changes rather than sell a partial quantity.
- Setting changes refresh open Party Sheets.
- GitHub Actions are pinned to upstream commit SHAs.
- Live fixture IDs removed from current evidence; JSON evidence not shipped.
- Read-only actor lookup timeout and a separate 64-request in-flight cap.
  Native mutations remain fail-closed rather than expiring unsafe operations.
- 58 automated tests pass; live module installation/sales remain pending.

## Features

Adds native-shaped coin controls to eligible physical equipment rows on the PF2e
Party Sheet. Default resale is 50% of the system-calculated stack value;
runes, magic equipment and bundled prices use PF2e valuation rather than raw
base prices. Treasure selling is not modified.

- Foundry V14; PF2e minimum 8.6.1, no upper-version cap.
- Permission behavior matches native editable Party Stash selling: Party OWNER
  players can sell identified items; GMs can sell unidentified items as well.
- World resale percentage setting, integer 0–100 (default 50).
- Whole-stack workflow, native confirmation/Ctrl-click convention and preview.
- GM-authoritative module queue, fresh item checks and persistent recovery record.
- Automated CI, version-tag publishing and anonymous release-artifact verification.

This is a prerelease. It is not an atomic transaction. An online active GM is
required, with only one transaction tab for that GM. Ambiguous interrupted sales
require manual journal/currency reconciliation. External inventory edits, GM
handoff and multi-tab split-brain are not covered by an exactly-once guarantee.
Future PF2e releases are allowed subject to API checks, not claimed as tested.

See README and docs/VERIFICATION.md for exact executed test outcomes and remaining
acceptance gaps before promoting to stable v1.0.0.
