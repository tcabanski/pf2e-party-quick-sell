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

## Outstanding before stable release

- Expanded automated suite and independent final code review.
- Real installation from published public manifest and module loading.
- Real GM UI/basic/rune/stack/treasure/rerender/disable testing.
- Real player-owner and non-owner authorization/socket tests, if temporary test
  accounts can be used safely.
- Public CI/release runs and anonymous manifest/ZIP checks.
- Cleanup of disposable live test actors/accounts/settings.

## Guarantees not claimed

The transaction is not atomic. Actor journal flags are not distributed CAS locks.
Only one active-GM transaction tab is supported. External edits, active-GM
handoff and crash timing can require manual reconciliation. Future PF2e versions
are allowed by minimum-version and feature checks, not claimed as tested.
