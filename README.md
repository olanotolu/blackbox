# OPERATION BLACKBOX — the flight recorder for environmental impact

Every carbon number should be as inspectable, replayable, diffable, and debuggable as a
program. BLACKBOX is an instrument for interrogating, debugging, and changing the
environmental consequences of physical manufacturing — not another sustainability
dashboard.

It answers the question Pathways engineer Zhichao Han described: a customer sees
**GWP = 167** and asks *"why?"* — and today the answer may require exporting
calculations into Excel and reconstructing the explanation by hand. BLACKBOX makes the
calculation itself replayable: machine-verifiable traces, immutable versioned snapshots
with explainable diffs, adversarial fault injection against the process graph,
renewal-risk intelligence for the October 2026 EPD expiration wave, and downloadable
evidence packets pinned by reproducibility hashes.

> **Honesty banner (read first).** All demo data is **synthetic and invented** —
> every fixture record is labeled synthetic and the UI badges it. The arithmetic is a
> **simplified illustrative LCA-style model, not ISO 14040/44/25-compliant**, and
> nothing here is a verified EPD, third-party verification, or a claim of regulatory
> compliance. EPD expiration is a validity-window fact, never "noncompliance."

## Prerequisites

- **Node.js 18+** (tested on Node v24.20.0) and **npm 10+**
- No API keys needed. Jev (TypeSafe AI) runs through a **clearly-labeled deterministic
  simulation** when `JEV_API_KEY` is absent; set it to hit the live API.
- No Docker, no database, no network services. The engine is pure TypeScript; fixtures
  are generated JSON+TS.

## How to run

```bash
cd ~/workspace/blackbox

# 1. install (npm workspaces: app, engine, fixtures)
npm install

# 2. deterministic engine tests (Stage-5 validation checklist)
npm run test --workspace=blackbox-engine   # vitest: aggregation, units, cycles,
                                           # hash stability, diffs, all 7 faults,
                                           # expiry, packet integrity

# 3. bounded-judgment (Jev) tests
cd jev && npm install && npm test && cd .. # 17 vitest tests: adapter shape,
                                           # fallback routing, triage rules,
                                           # decision-log integrity

# 4. typecheck everything
npm run typecheck

# 5. run the demo app
npm run dev --workspace=blackbox-app       # → http://localhost:3000

# 6. production build check
npm run build --workspace=blackbox-app
```

Fixtures are committed as generated artifacts plus a generator:
`fixtures/src/generate.ts` rebuilds them from the real engine
(`cd fixtures && npx tsc -p tsconfig.gen.json && node .gen-dist/src/generate.js`).

### One-command validation (what `docs/VALIDATION.md` records)

```bash
npm run test --workspace=blackbox-engine && \
npm run test --workspace=blackbox-fixtures && \
(cd jev && npm test) && \
npm run typecheck && \
npm run build --workspace=blackbox-app
```

## Repo map

```
blackbox/
├── README.md                  this file
├── package.json               npm workspaces: app, engine, fixtures
├── docs/
│   ├── RESEARCH.md            Stage-1 verified facts (EC3 wave, DPP, openEPD, GCCA v6, Jev)
│   ├── CANDIDATES.md          6–8 project candidates, ranked; BLACKBOX selection
│   ├── ARCHITECTURE.md        components, data flow, determinism-vs-judgment line
│   ├── DATA_CONTRACT.md       FINAL cross-component data contract
│   ├── JEV.md                 Jev integration notes
│   ├── VALIDATION.md          Stage-5 checklist results (actual runs, real numbers)
│   ├── DEMO.md                the 6-step demo walkthrough
│   └── DELIVERABLES.md        the brief's 9 items + honest simulation ledger
├── engine/                    DETERMINISTIC — all arithmetic lives here
│   └── src/
│       ├── schema.ts          Zod-typed contracts (units, graph, trace, faults, EPD, packet)
│       ├── units.ts           unit registry, dimensional analysis, conversions
│       ├── graph.ts           DAG validation, cycle detection, topological order, lineage
│       ├── evaluate.ts        topological evaluation → per-node TraceSteps
│       ├── validate.ts        structural/semantic rules with stable rule codes
│       ├── snapshot.ts        immutable snapshots + sha256 reproHash (canonical JSON)
│       ├── diff.ts            explainable computational diffs (cause attribution)
│       ├── faults.ts          7 typed fault kinds: injectFault + detectFaults
│       ├── expiry.ts          renewal-risk tiers, decomposed priority score, work packets
│       └── packet.ts          evidence-packet assembly + manifest hash
├── fixtures/                  SYNTHETIC data (labeled) — 2 plants, products, datasets,
│                              versioned snapshots, 7 seeded faults, EPD expiry records
├── app/                       Next.js 14 + React Flow demo UI (dark mission-control)
│   └── src/
│       ├── app/               routes (facility view → graph explorer)
│       └── components/        Explorer, TimeMachine, FaultLab, ExpiryBoard, EvidencePanel
└── jev/                       BOUNDED JUDGMENT — Jev by TypeSafe AI (separate package)
    ├── adapter.ts             real POST /v1/systemone client (key from env only, never stored)
    ├── triage.ts              anomaly_triage: choice/score over FIXED permitted sets
    ├── simulation.ts          clearly-labeled deterministic fallback (no key → this)
    ├── decisions/             logged JevDecision records (permitted, evidence, rationale)
    └── tests/                 17 vitest tests
```

## The bright line

| Deterministic (engine, always) | Judgment (Jev, bounded) |
|---|---|
| graph evaluation & aggregation | which detected issue deserves urgent human attention |
| unit conversion & dimensional validation | which fixed taxonomy class an issue belongs to |
| cycle detection | which review queue an evidence gap routes to |
| snapshot hashing & reproducibility | whether an explanation request needs more evidence |
| diff computation & cause attribution | which permitted diagnostic tool runs next |
| fault detection & trust quarantine | — |
| evidence-packet assembly | — |

Jev may **route and prioritize**; it can never change a number, clear a validator error,
alter evidence, or claim verification. If Jev is unreachable, the system degrades to the
labeled fallback and loses nothing that matters.

## Demo in 60 seconds

1. Open the app → a product shows **GWP = 167 kg CO₂e / m³** (synthetic).
2. Click **"Explain this result"** → the process graph expands; every node's formula,
   unit conversions, impact factor + dataset version, and evidence refs are inspectable.
3. Open an earlier snapshot → the **time machine** shows the exact numerical diff with
   cause attribution ("cement factor 0.92→0.98 kgCO₂e/kg accounts for +13.2…").
4. Inject a fault (e.g. cement unit kg → kWh) → the validator flags it, highlights the
   affected path, and quarantines the result as **UNTRUSTED**.
5. Export the **evidence packet** → JSON artifact with reproHash, trace, diff, faults,
   dataset pins, warnings — independently re-verifiable.

Full walkthrough: `docs/DEMO.md`. What was built vs. simulated: `docs/DELIVERABLES.md`.
