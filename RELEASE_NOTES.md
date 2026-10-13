# PF2e Party Quick Sell — v1.0.2

Successful equipment sales now consolidate top-level Party Stash coins to one
stack per denomination, including duplicate stacks from earlier sales. Largest
pp/gp/sp/cp payouts are preserved. Contained coins and nonstandard treasure are
not merged. Existing quantities are combined, not exchanged between denominations.

Credit is verified before consolidation. A persisted consolidation baseline,
combined-value checks and merged sale audit IDs support fail-closed recovery if
an update/delete is interrupted. Do not retry an ambiguous failed sale blindly.

66 automated tests pass, including repeated sales, existing duplicate stacks,
detached journal persistence, containment, value conservation and merge failures.
No new live-world test is claimed for this patch.

## Prior v1.0.1 denomination fix

New equipment sales pay the largest available denominations: platinum, gold,
silver, then copper remainder. For example, 300 gp pays 30 pp instead of 30000 cp;
123 gp 4 sp 7 cp pays 12 pp, 3 gp, 4 sp, 7 cp. Existing stash coins are not changed.
All newly created denomination stacks retain the sale recovery/audit marker and
their combined value is verified before clearing the journal.

Regression reproduced copper-only payouts before the fix. Full automated suite:
60 tests passed. This patch is source/API and automated-test verified; no new
live-world acceptance run is claimed.

Version 1.0.1 also sorts above 1.0.0-rc.3 in Foundry's version comparator, so
normal update discovery can move existing RC installs to this stable patch.

## Initial v1.0.0 release

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
