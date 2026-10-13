# PF2e Party Quick Sell

A lightweight Foundry VTT module that adds the missing native-shaped coin controls
to equipment in the Pathfinder 2e Party Stash. It uses PF2e's calculated item
value rather than reimplementing magic-item pricing. Existing Sell Treasure
buttons and sales are left completely unchanged.

**Stable v1.0.2:** 66 automated tests; initial runtime live acceptance on Foundry
14.369 / PF2e 8.6.1. The denomination and consolidation patches are automated/source-verified, not
newly live-tested. See [verification](docs/VERIFICATION.md) for exact scope.

## Features

- Sell eligible weapons, armor, shields, equipment, consumables, ammunition and
  other supported physical inventory Items from the existing Party Sheet.
- Default proceeds are 50% of PF2e's calculated total stack value.
- New proceeds use the largest possible coin denominations: platinum, gold,
  silver, then copper remainder. After a successful sale, all top-level standard
  Party Stash coinage is consolidated to at most one stack per denomination;
  contained/nonstandard treasure is untouched. Existing coin audit IDs are retained
  in the merged stack's `saleIds` flag.
- Prepared prices include runes, materials, upgrades, custom prices and bundled
  quantities. Percentage calculations use integer copper pieces.
- Native coin icon, placement, tooltip conventions and normal sheet refresh.
- Whole-stack selling matches native treasure selling; normal click confirms,
  Ctrl-click skips confirmation. No character selection or merchant window.
- A tooltip previews the configured percentage and expected proceeds.
- One optional GM world setting: Equipment resale percentage, default 50%,
  integer range 0–100. Treasure is unaffected.
- No runtime dependencies beyond the PF2e system.

## Compatibility

Source investigated: PF2e **8.6.1** release tag `pf2e-8.6.1` on Foundry **14.369**.
The manifest declares Foundry 14.361–14.x and PF2e 8.6.1 or later, with no
PF2e upper-version cap. Runtime feature checks reject missing or changed APIs
rather than guess prices. Future PF2e releases are not claimed to be tested.
This declaration is not a claim of live testing on every Foundry 14 build.
Actual live test outcomes, when performed, are recorded separately.

See [source investigation](docs/SOURCE_INVESTIGATION.md) for exact upstream
functions, native permission behavior and architecture rationale.

## Installation and updates

1. In Foundry Setup, open Add-on Modules → Install Module.
2. Paste this exact Manifest URL:

   https://raw.githubusercontent.com/tcabanski/pf2e-party-quick-sell/main/module.json

3. Click Install. Open a compatible PF2e world and enable **PF2e Party Quick Sell**
   in Manage Modules.
4. Keep one active GM transaction tab online and open the native Party Sheet.

The stable manifest URL remains the same for future versions. It advertises a
version-specific GitHub ZIP, allowing Foundry's normal module update process.
The raw main manifest is used deliberately because GitHub's `releases/latest`
endpoint excludes prereleases. Do not advance main's version until its matching
release is ready; during publishing there can be a short build/upload window.

## Usage

Open the Party Sheet → Inventory → Party Stash. Click an equipment row's coin
icon to sell the entire stack. Normal click uses the same confirmation convention
as native treasure; hold Ctrl to sell without confirmation. Proceeds appear as
Party Stash currency. Tooltip values reflect the prepared total stack value and
the current percentage. No partial quantity dialog is added.

Zero-value, temporary, nonphysical, currency, attached-subitem rows and nonempty
containers are not sold by this extension. Sell container contents separately
before selling the empty container. Native treasure buttons remain untouched.

## Permissions

This module follows the native PF2e selling UI's permissions, not a blanket
GM-only policy:

- GMs may sell identified or unidentified eligible items.
- Players with **OWNER permission on the Party actor** may sell identified items.
  Default Party ownership, if configured, counts as native ownership.
- Observers, limited/non-owner players, and players who merely own a party member
  do not receive sale controls. Party membership alone is insufficient.
- Players do not receive sell controls for unidentified items.

PF2e's Party `canUserModify("update")` additionally permits some member owners to
update, but it does **not** make the native Party Sheet editable or grant embedded
Item deletion ownership. The module never uses that broader check as its sole
sale authorization. Transactions validate the original authenticated socket
sender's permissions again; a caller-provided user ID is not authority.

Native item/document authorization remains in force. Equipment transactions are
processed by an online active GM to serialize module sales; this online-GM
requirement is an intentional additional transaction-safety limitation, not an
extra privilege granted to players.

## Configuration

A GM can set **Equipment resale percentage** in Configure Settings. Use an integer
from 0 through 100; 50 is the default. It affects equipment only and does not
change permission requirements or native treasure proceeds. At 0%, the extension
does not remove items for no proceeds.

## Automatic Bonus Progression (ABP)

The module follows PF2e's **prepared** Party Stash value, not suppressed runes in
raw item data. With ABP enabled, PF2e suppresses fundamental potency, striking
and resilient runes; they do not receive an independently reconstructed resale
value. Fundamental Potency mode can retain property runes subject to PF2e's slot
rules; Rules As Written mode also suppresses property runes. Specific magic items
continue to use PF2e's specific-item pricing rules. The tooltip previews the
actual system-calculated value after these rules. The module does not change ABP
settings or add suppressed rune prices back.

## Transaction limitations and recovery

Foundry/PF2e has no atomic delete-and-credit sale API. This module is **not atomic**.
Module requests are serialized per Party on the active GM; stale requests,
duplicate clicks and changed items are rejected. A durable namespaced Party flag
records an in-progress sale before removal. Credit uses PF2e's native currency API
with separate, sale-tagged currency Items rather than competing updates to an
existing coin stack. Completion is verified before clearing the recovery record.
The final stage consolidates only direct Party Items whose unit is pp, gp, sp or cp;
it records every source stack and expected copper value in the journal before
updating/deleting documents. Merged audit IDs remain in
`flags.pf2e-party-quick-sell.saleIds`.

An ambiguous failure retains the record and blocks further equipment sales for
that Party. Do not blindly repeat a sale, restore the item, or award coins: inspect
the journal, live inventory and sale-tagged currency first. A GM must reconcile
the state and clear the record only after confirming the correct item/coins.
See [recovery instructions and exact flag paths](docs/RECOVERY.md).

Use **one transaction tab for the active GM**. Foundry identifies an active GM
User, not a single browser tab, and actor flags are not atomic compare-and-swap
locks. Multiple tabs for the same active GM, GM handoff/disconnection, server
crashes and simultaneous edits by other modules/native treasure selling cannot
be given a distributed exactly-once guarantee. Do not edit/transfer stash Items
or currency during a sale. Pending records survive reload for manual recovery;
there is no unsafe automatic replay. Socket replay retention is bounded to 1024
requests in a five-minute window; saturation rejects further requests until
completed entries expire. This bounds retained requests, not a guarantee against
denial of service by malicious authenticated clients. Read-only actor lookups
expire after 15 seconds, and at most 64 socket requests may be in flight. A hung
native document mutation deliberately keeps its actor queue blocked; it is not
cancelled/replayed by a timer. Restore server connectivity and inspect journals
before reloading the single active-GM transaction client.

No PF2e methods are patched or replaced. Disable the module and reload clients
to restore the native UI. A pending recovery record still requires reconciliation
rather than being silently forgotten.

## Development and releases

Development requires Node 24+ and Python 3.12+; Python's standard library builds
the ZIP. Install development dependencies using `npm ci`, then run `npm test`.
Validate JavaScript with `node --check` and build with `python tools/build.py`.
Outputs are `dist/module.zip` and `dist/module.json`; the archive has one
`pf2e-party-quick-sell/` directory and includes only runtime files and documentation.

CI runs tests, syntax checks, manifest validation and an archive build on pushes
and pull requests. Tag releases use only GitHub's built-in token; contents write
permission is limited to the release job.

To publish an update:

1. Modify source/tests and update verification and release notes.
2. Update `module.json` version and its version-specific download URL together.
3. Run all checks, commit and push to main.
4. Create and push the matching semantic-version tag (for example `v1.0.1`).
5. The release workflow checks tag/version equality, tests, builds and publishes
   the ZIP and manifest, then anonymously verifies the public assets.

Prerelease tags contain a suffix (such as `v1.0.0-rc.1`) and are marked prerelease
automatically. Stable v1.0.0 is reserved for verified acceptance criteria.
For manual published artifact verification run:
`python tools/verify_release.py v1.0.0`.

## License

MIT; see [LICENSE](LICENSE). This project is independent of Foundry Gaming and the
PF2e system development team. Upstream source is inspected and referenced, not
bundled with this module.
