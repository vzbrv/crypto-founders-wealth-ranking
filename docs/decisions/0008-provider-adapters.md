# ADR 0008: Isolate providers behind adapters

Status: Accepted

## Decision

Normalize market and chain providers behind replaceable typed adapters.

## Consequence

Provider-specific payloads and failures cannot leak into calculation logic.
