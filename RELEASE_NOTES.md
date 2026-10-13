# PF2e Party Quick Sell — initial release candidate

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
