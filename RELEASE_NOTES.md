# PF2e Party Quick Sell — v1.0.0

Stable initial release after published rc.3 live acceptance on Foundry 14.369 /
PF2e 8.6.1, 59 passing automated tests, and an independent final audit with no
release blockers. Runtime is identical to the live-tested rc.3; this promotion
changes version metadata and documentation only.

## Features

- Native-shaped coin controls on eligible physical equipment in the Party Stash.
- Default resale: 50% of PF2e's prepared stack value, including native rune,
  material, custom-price and bundled-quantity rules.
- Whole-stack workflow with preview, normal-click confirmation and Ctrl-click.
- Native treasure selling remains unchanged at full treasure value.
- Party OWNER players can sell identified items; GMs can sell unidentified items.
- World percentage setting: integer 0–100; zero proceeds never remove items.
- Active-GM authoritative queue, fresh request validation and recovery journals.
- Foundry V14; PF2e minimum 8.6.1 without a PF2e upper-version cap.

## Executed live acceptance

Real GM UI double-click protection, confirmation/cancellation, plain and rune
weapons, armor, ammunition bundles, consumable stacks and custom values passed.
Runtime partial-stack selling retained the remainder; the UI remains whole-stack.
Native treasure, repeated sheet rendering and disable/reload behavior passed.
Real separate player-owner socket sale, observer denial and competing GM/player
requests passed. Synthetic prepared-journal blocking and safe clearing passed on
a real disposable Actor. All temporary actors and users were removed.

The pre-init Foundry game placeholder defect found during rc.2 installation is
fixed and covered by a lifecycle regression. No campaign inventory was sold.
See docs/VERIFICATION.md for exact executed results and their scope.

## Important limitations

Transactions are not atomic. Keep one transaction tab for the online active GM.
Ambiguous failures block further module sales and require manual journal/currency
reconciliation; never blindly replay a sale or award coins. External inventory
edits, GM handoff, crashes and multi-tab split-brain are not covered by an
exactly-once guarantee. Synthetic journal testing is not a crash-recovery test.
Future PF2e versions are allowed subject to API checks, not claimed as tested.

See README.md and docs/RECOVERY.md before using meaningful campaign inventory.
