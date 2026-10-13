# Verification status

This document records executed checks, not inferred success. Initial release is a
release candidate, not stable v1.0.0.

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

## Outstanding before stable release

- Final independent review of the hardened runtime and live API assumptions.
- Real installation from published public manifest and module loading.
- Real GM UI/basic/rune/stack/treasure/rerender/disable testing.
- Real player-owner and non-owner authorization/socket tests, if temporary test
  accounts can be used safely.
- Cleanup of disposable live test actors/accounts/settings.

## Guarantees not claimed

The transaction is not atomic. Actor journal flags are not distributed CAS locks.
Only one active-GM transaction tab is supported. External edits, active-GM
handoff and crash timing can require manual reconciliation. Future PF2e versions
are allowed by minimum-version and feature checks, not claimed as tested.
