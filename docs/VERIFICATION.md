# Verification status

This document records executed checks, not inferred success. Stable v1.0.0 follows
published rc.3 live acceptance and an independent final audit. Historical release
candidate checks below retain their original scope and limitations.

## Source and live baseline

- Official PF2e release tag pf2e-8.6.1 (28d9d156) inspected before implementation.
- Independent source audit confirmed native sale permissions, sequential
  deletion/credit and the active-GM multiple-tab limitation.
- Runelords `/api/status` and browser runtime both reported Foundry 14.369 /
  PF2e 8.6.1. Secure vault world login succeeded.
- Native Party Sheet and existing Party Sheet Helper 0.4.2 source were inspected.
  Its renderPartySheetPF2e hook is present; no treasure-sale override was found
  in the examined helper script.
- Disposable Party Actor and compendium-derived Items created for live tests.
  No campaign Items were sold. Existing Party inventory was not changed.
- Real PF2e prepared values: longsword 100 cp, chain mail 600 cp, ten arrows
  10 cp with `price.per=10`, five longswords 500 cp, custom-priced weapon 1500 cp.
- A +1 striking flaming longsword has raw base 1 gp but prepared value **600 gp**
  (60000 cp). Runelords world uses ABPFundamentalPotency; fundamental runes are
  removed unless ABP is disabled on the test Actor. The test Actor alone has
  `flags.pf2e.disableABP=true`; the world setting is unchanged.
- Evidence: `upstream-live-prices.json`. These are valuation checks, not yet
  completed module-sale checks.
- ABP-enabled disposable Party: a source +1 striking longsword retains those
  runes in raw data but PF2e prepares potency/striking as zero and values it at
  100 cp. The world ABP setting was not changed.
- Native treasure Ctrl-click sale executed before module installation: a 50-cp
  test agate was removed and credited exactly 50 cp. This establishes an actual
  in-application baseline, not a mocked treasure test. Evidence: `live-baseline.json`.

## Initial automated run (before review corrections)

Executed locally: `npm ci`, `npm test`, `python tools/build.py`.

- 20 tests passed, 0 failed.
- npm audit found 0 vulnerabilities in the installed development dependencies.
- Manifest parsed/validated and ZIP built successfully.
- These tests use Node test runner and mocked Foundry/PF2e documents with jsdom
  for sheet DOM. They are **not in-application tests**.

Review identified missing UI permission/eligibility restrictions, confirmation,
keyboard support, fresh validation after journal writes, and request timeout
handling. Corrections were applied with regression tests. A second parent-run
suite passed **47 tests, 0 failed**, JavaScript syntax checks passed, and the
manifest/ZIP build passed. Native partial valuation now fails closed rather than
scaling an already-rounded stack total. Invalid saved percentages fail clearly.
This remains mocked automated coverage, not full live acceptance approval.

## Published release verification

- Source pushed to public `tcabanski/pf2e-party-quick-sell`, default branch main,
  commit `277867e`; tag `v1.0.0-rc.1` pushed.
- GitHub CI run `38402754791` succeeded.
- Automated release run `38402776295` succeeded and published the prerelease
  with `module.json` and `module.zip` assets.
- Parent executed `python tools/verify_release.py v1.0.0-rc.1`: anonymous manifest
  and ZIP downloads succeeded; 11 archive entries validated; embedded version
  `1.0.0-rc.1`, dependency/compatibility metadata and versioned download matched.
- Stable main-branch manifest anonymously advertised `1.0.0-rc.1` and provides
  Foundry's update-discovery URL. No actual future-version upgrade was tested.
- Live installer access redirected to the running game. Returning Runelords to
  Setup requires disconnect permission; requested but not yet received.

## Independent-review correction verification

- An independent read-only review reproduced 47 passing tests and zero npm
  audit vulnerabilities, and identified fail-closed gaps.
- Five new regressions were executed and failed on rc.1, then passed after fixes:
  missing confirmation API, coerced settings types, minimum Foundry build,
  missing partial-update API before journaling, and bounded socket retention.
- Parent reran the full suite: **52 passed, 0 failed**, syntax checks and
  `git diff --check` passed. These remain mocked automated tests.
- Four additional regressions reproduced failures before fixes, then passed:
  sender-bound socket identity/replies, Party Stash-only controls, stale stack
  rejection and open-sheet refresh on percentage changes.
- Full suite rerun: **56 passed, 0 failed**. Workflow action references pinned
  to upstream commit SHAs. Current JSON evidence no longer includes fixture IDs
  and is excluded from installable archives. Prior public rc.1 history/artifacts
  remain unchanged; those opaque disposable IDs are not credentials.
- A hung lookup regression timed out before the fix; after adding bounded
  read-only lookups and a 64-request in-flight cap, **57 tests passed, 0 failed**.
  Native mutations are never expired/replayed by a timer; genuinely hung native
  transactions remain fail-closed and require recovery after connectivity repair.
- Additional verification exercised 64 unresolved lookups and confirmed the
  65th is rejected without dropping active work. Full suite: **58 passed, 0 failed**.
- Independent targeted review of the 56-test state reported no blockers;
  sender-bound replies, strict stash selector against upstream, stale-stack
  rejection, bounded retention and setting refresh passed. The subsequent two
  lookup-safety tests were rerun by the parent, not that independent reviewer.
- Prepared rc.2 with strict numeric saved settings, normal-click confirmation
  fail-closed behavior, partial API preflight and bounded socket replay retention.

## rc.2 public publication verification

- Commit `f3a31eb` pushed to public main; matching tag `v1.0.0-rc.2` pushed.
- GitHub CI run `38410323342` and release run `38410326975` both succeeded.
- Parent independently reran anonymous release verification: manifest and ZIP
  succeeded, embedded version and advertised main version were `1.0.0-rc.2`,
  compatibility/dependency/download metadata matched, and 9 archive files validated.
- All 9 anonymously downloaded archive files matched the tagged local source
  byte-for-byte. The verifier's `installed_version` means embedded manifest value,
  not installation in a running Foundry instance.
- Actions emitted Node 20 deprecation/runner migration warnings but completed
  successfully; action-runtime upgrades remain maintenance work.

## Published rc.3 live acceptance

Runelords interruption was explicitly approved. rc.2 was installed via its public
main-branch manifest. It failed safely at startup because the module captured the
pre-init `game` placeholder. A failing lifecycle regression reproduced this, and
resolving the actual game at init fixed it; 59 automated tests now pass.

rc.3 was anonymously verified and installed through its exact public release
manifest after the main-branch URL returned a cached rc.2. Native installer
metadata and runtime both reported 1.0.0-rc.3. Foundry 14.369 / PF2e 8.6.1.

Executed live on disposable inventory; evidence: `live-acceptance.json` (19 checks):

- Real GM Ctrl-click UI rapid double click: longsword removed, exactly 50 cp.
- Chain mail 300 cp; +1 striking flaming longsword 30000 cp; ten arrows 5 cp;
  custom 15-gp weapon 750 cp; five longswords 250 cp. Journals cleared.
- Runtime partial-stack sale of 2/5 longswords: 100 cp, 3 remain. The UI remains
  whole-stack-only. Three minor healing potions: 600 cp. Zero-value item untouched.
- Native treasure UI with module enabled: 50-cp agate credited full 50 cp.
- Real separate owner browser/client: identified controls visible, unidentified
  control absent; real module socket sale credited exactly 50 cp.
- GM/player competing requests for one item: one sale, 50 cp total; loser rejected.
- Observer client: no controls; request rejected as not-owner, no inventory change.
- Normal-click confirmation cancelled without mutation; Yes sold remaining
  3-longsword stack for 150 cp.
- A synthetic prepared journal written to a real disposable Actor blocked sales;
  GM reconciliation cleared it only with unchanged inventory and currency.
  This is not a real network/crash interruption test.
- Close/reopen and document rerenders retained unique item controls without
  duplicates. Disable/reload removed module controls, retaining native treasure.
- Module re-enabled/reloaded successfully at 50%. Both disposable actors and
  both disposable users removed; post-cleanup counts zero. Campaign inventory
  and world ABP setting were not changed.

The dedicated headless browser had excessive CPU after entering the rendered
world; restarting with native client-only core.noCanvas=true avoided the spike.
This does not prove which world/rendering component caused it and changes no
other client's settings. Automation browser is closed when testing completes.

## Stable release approval

Final independent read-only audit examined main.js, its lifecycle regression,
transaction.js and ui.js; no release blockers were found. Its fresh `npm test`
run passed 59 tests, 0 failed. Stable v1.0.0 changes only version metadata and
documentation from the live-tested rc.3 runtime.

Real process crashes, GM handoff, and future PF2e versions are not live-tested
or claimed safe beyond fail-closed/API checks and documented recovery limits.

## v1.0.1 denomination correction

User testing identified copper-only payouts in v1.0.0. New regression reproduced
30000-cp payout instead of 30 pp, and mixed payout mismatch, before the fix.
The credit payload now decomposes exact integer proceeds into pp/gp/sp/cp and
tags all standard coin denominations, not only copper. Multi-stack test doubles
verify every stack's sale ID, exact combined value and cleared journal. Full
suite: 60 tests passed. No new live-world run is claimed for this patch.

Existing coin stacks are not exchanged or rewritten. Version 1.0.1 also sorts
above prior 1.0.0-rc.3 under Foundry's non-semver version comparator.

## Guarantees not claimed

The transaction is not atomic. Actor journal flags are not distributed CAS locks.
Only one active-GM transaction tab is supported. External edits, active-GM
handoff and crash timing can require manual reconciliation. Future PF2e versions
are allowed by minimum-version and feature checks, not claimed as tested.
