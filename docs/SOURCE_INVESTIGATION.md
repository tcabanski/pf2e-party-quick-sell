# Source investigation

Target: official `foundryvtt/pf2e` release tag **pf2e-8.6.1**, commit
`28d9d156f252d084371d994dc359509b49eadf18`, published 2026-10-12.
Release system manifest: minimum Foundry 14.361, verified 14.369, maximum 14.
A read-only live `/api/status` check returned Foundry 14.369 and PF2e 8.6.1;
its installed `pf2e.mjs` was also inspected. Other existing worlds use earlier
PF2e versions; they are not the target of this first release.

References below are relative to that exact upstream tag:
https://github.com/foundryvtt/pf2e/tree/pf2e-8.6.1

## Party inventory and selling

- `src/module/actor/party/sheet.ts:32`: PartySheetPF2e extends ActorSheetPF2e,
  still Foundry ApplicationV1 rather than ApplicationV2. `getData` at line 86
  prepares the stash and party currency summaries. Coin distribution is
  separately GM-only; this is not the permission rule for selling.
- `src/module/actor/sheet/base.ts:231`, `prepareInventoryItem`: native
  `isSellable` (line 263) is true only for non-currency treasure which is
  identified, or when viewed by a GM.
- `static/templates/actors/partials/item-line.hbs:77–126`: controls exist only
  for an editable sheet. The native control (115) is an anchor with
  `fa-solid fa-coins fa-fw`, `data-action="sell-treasure"`, and PF2e tooltip.
- `src/module/actor/sheet/base.ts:764–785`, `activateClickListener` handler:
  resolves the item, requires treasure and not coinage, deletes the **whole
  stack**, then calls `actor.inventory.addCoins(item.assetValue)`. Normal click
  confirms using DialogV2; Ctrl-click bypasses confirmation. There is no quantity
  selection. Native treasure handling will not execute equipment sales merely
  because an equipment row receives the same action.

## Valuation and currency

- `src/module/item/physical/document.ts:121–130`: `price` is prepared system
  price; `assetValue` calculates the whole stack using `Coins.fromPrice` and
  includes attached subitems unless the item is specific.
- `src/module/item/physical/helpers.ts:17–74`, `computePrice` and
  `computeLevelRarityPrice`: rune, precious material, reinforcing, specific-item,
  grade, shoddy and size-sensitive pricing is prepared by PF2e. Base field values
  are not a safe substitute.
- `src/module/item/physical/coins.ts:55–75,143–146`: `Coins.fromPrice` scales by
  quantity divided by `price.per`; `scale` propagates fractions to lower
  denominations and discards sub-copper fractions with floating-point cleanup.
  The module consumes the integer `assetValue.copperValue` produced by PF2e and
  floors its percentage using integer arithmetic.
- `src/module/actor/inventory/index.ts:78–132`: `addCoins` delegates to
  `addCurrency`; that method prepares coin Item updates/creates and applies
  grouped document operations. `combineStacks:false` requests separate currency
  Items rather than a read-modify-write against existing coin stacks.

## Exact permissions

Foundry **14.369** client source was inspected from the running installation
(`scripts/foundry.mjs`). Its ApplicationV1 DocumentSheet getter `isEditable`
requires `options.editable && document.isOwner`; embedded Item ownership derives
from its parent Actor. Native item mutation uses document ownership checks.

- GMs can edit the Party actor and sell identified or unidentified treasure.
- Players with OWNER permission on the Party actor (including default ownership
  if configured) can sell identified non-currency treasure.
- Observer/limited/non-owner players cannot see native sale controls.
- An unidentified item does not receive a player sale control.
- `src/module/actor/party/document.ts:47–51`, `canUserModify`, additionally
  allows an update when the user can update a member. **This alone does not make
  the Party Sheet editable, nor grant embedded Item creation/deletion ownership.**
  Using only this method would overgrant module sale access.
- The native handler's type checks and UI visibility are separate from
  authoritative document mutation authorization. It does not implement a
  bespoke selling role or an atomic transaction.

Equipment controls preserve the native editable/identification rules. The
module transaction service must additionally verify the authenticated sender's
Party ownership before any GM-side document operation. A caller-provided user
ID must never be trusted.

Foundry server custom sockets forward the sender's authenticated `this.user.id`
as a second callback argument. This was verified in the local Foundry 14.368
server `handleCustomSocket` source, and must be checked during live 14.369
integration as well; an absent authenticated identity fails closed.

## Extension and compatibility

Use the existing ApplicationV1 `renderPartySheetPF2e` hook, rather than migrate,
replace or patch the Party Sheet. Insert native-shaped controls into existing
editable stash item-controls and leave `sell-treasure` untouched. Register
separate listeners that are idempotent on repeated hooks and rerenders.

Native selling is sequential, not atomic. Equipment requires custom protection:
active-GM serialization, stale-request rejection, fresh quantity/value checks,
and a durable recovery record. This adds an online-GM requirement. No claim of
atomicity, exactly-once distributed execution across split-brain GM tabs, or
synchronization with unrelated native edits is justified by these APIs.

Initial investigated target is Foundry V14 / PF2e 8.6.1. At the user's request,
PF2e 8.6.1 and higher are allowed without an upper-version cap. Missing or changed
APIs and system versions below the minimum must fail clearly rather than sell
at a guessed price. Later versions are not claimed to have been tested. No production campaign data was changed during investigation.
