# Interrupted-sale recovery (GM)

Equipment sales are not atomic. An unresolved record intentionally blocks further
module sales for that Party. Never blindly repeat a sale or award currency.

The Party flag is `flags.pf2e-party-quick-sell.saleJournal` (or
`party.getFlag("pf2e-party-quick-sell", "saleJournal")`). It records transactionId,
stage, originalSource/source, itemId, requested quantity, assetCp, proceedsCp,
percentage, requesterId and the original item fingerprint.

Credited currency Items have `flags.pf2e-party-quick-sell.saleId` matching the journal transactionId. During the final `consolidating` stage, direct standard coin Items (pp/gp/sp/cp only) may be merged with PF2e's native Item `update`/`delete` APIs. The journal's `consolidation.baseline` and `expectedValueCp` are the recovery baseline. Merged stacks retain all source sale IDs in `flags.pf2e-party-quick-sell.saleIds`; contained or nonstandard treasure is never included.

1. Stop equipment sales and stash edits. Keep one active-GM transaction tab.
2. Inspect the journal and original live item/remaining quantity. Before
   consolidation, saleId-tagged currency totals should equal proceeds. During or
   after consolidation, saleIds identifies contributing sales, NOT how much of
   a merged balance belongs to each sale; use the persisted consolidation
   baseline and expectedValueCp instead of treating the entire merged stack as
   this sale's proceeds. Updating a keeper before deleting extras temporarily
   duplicates their quantity; a failed deletion must be manually reconciled.
3. If the journal is `prepared` and the live item is completely unchanged, no
   credit should have happened. The runtime's GM-only `reconcileJournal(party)`
   can clear this untouched state only when the fingerprint still matches.
4. If the item was removed or partially reduced, confirm whether exactly the recorded proceeds exist as tagged currency. If the journal is `consolidating`, compare every current direct pp/gp/sp/cp source with `consolidation.baseline` and `expectedValueCp`; do not retry a failed update/delete until value and audit IDs are reconciled. If yes, do not award them again.
   Clear the journal only after confirming the correct inventory and proceeds.
5. If item removal is confirmed but coins are absent, restore the recorded source
   or award the missing proceeds ONCE, not both. This is a deliberate manual GM
   decision after checking persisted documents and logs. Partial quantities must
   be reconciled against the original source quantity.
6. If some coins exist, values differ, items were externally edited, or the stage
   is ambiguous, do not automatically restore/replay. Reconcile manually first.
7. Only after a consistent state is verified, a GM may use native
   `party.unsetFlag("pf2e-party-quick-sell", "saleJournal")` to clear the block.

These paths describe native Foundry document APIs for GM developer-console use,
not an end-user dialog. The module does not expose a destructive one-click
recovery/reset control and does not automatically replay interrupted operations.
Keep a world backup before manual recovery on meaningful campaign inventory.

Disabling the module does not reconcile interrupted sales. Completed saleId
markers are retained on coins for audit and are not additional currency.
