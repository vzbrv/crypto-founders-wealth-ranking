# Ranking v2 cutover

The public ranking uses the current published v2 snapshot when the complete,
validated RPC response is available. It falls back to the existing immutable
snapshot contract if v2 is absent, invalidated, or fails validation. The
bundled snapshot remains the last-resort display only.

## Shadow comparison

Run both engines before switching the public read path. Differences are tagged
as `EXPECTED_METHODOLOGY_CHANGE`, `MISSING_V2_RESEARCH`,
`UNRESOLVED_V2_CAPITAL`, `INPUT_DIFFERENCE`, `CALCULATION_DIFFERENCE`, or
`UNEXPLAINED_DIFFERENCE`. Only an unexplained difference blocks cutover.

Publication still requires a complete cohort, feasible constraints, immutable
input hashes, and the confidence gate. Invalidation is append-only: the public
RPC identifies an invalidated snapshot, and the frontend rejects it rather than
silently presenting it as current.

## Production evidence needed

Production candidates remain unranked until the evidence gates pass. Provide:

- official founder and founding-team disclosures with source URLs;
- wallet addresses plus direct ownership or control evidence;
- ownership exclusions and their effective dates;
- multisig control, beneficial-share, vesting, staking, wrapped, and bridged
  relationships;
- funding amounts and evidence-backed allocations when one event funds more
  than one project; and
- archived primary documents when a source can change or disappear.

High confidence is derived from the versioned evidence policy. It cannot be set
manually. Private equity and liabilities are required only for a separate net
worth metric; they are not inputs to value created for others.

Canonical publication requires High confidence. Medium, Low, and Insufficient
results remain visible only as research candidates and cannot enter a published
ranking snapshot.

## Rollback

Keep the existing public contract during the shadow period. If the v2 response
is invalid, restore the previous frontend release or append a snapshot
invalidation; do not mutate a published snapshot or its review records.
