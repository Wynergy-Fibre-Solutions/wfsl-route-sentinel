# Live Network Variability Demonstration

## Overview
This document records a live execution of **WFSL Route Sentinel** under real-world network conditions.
The purpose is to demonstrate how WFSL software behaves when a network transitions between degraded and healthy states.

This is not a synthetic test. All data was captured from a live mobile network.

---

## Test Context

- Network type: Mobile / fixed-wireless
- Characteristics observed:
  - Zero packet loss
  - High latency variance (jitter)
  - Periods of congestion followed by stabilisation
- Test target: 8.8.8.8 (external, stable reference endpoint)

---

## Tooling Used

- **wfsl-route-sentinel**
  - Route quality sampling
  - Latency and jitter analysis
  - Network state classification

- **wfsl-evidence-guard**
  - Structured evidence capture
  - Timestamped JSON artefacts

- **wfsl-proofgate**
  - Deterministic decision gating
  - Environment readiness assessment

---

## Observed Behaviour

### Phase 1 – Degraded Network State
During periods of mobile backhaul congestion:

- Packet loss remained at 0%
- Latency spikes exceeded 1000 ms
- Average latency exceeded acceptable thresholds

**WFSL Route Sentinel classification:**

**WFSL ProofGate decision:**


No destructive remediation was triggered. The system correctly identified upstream congestion.

---

### Phase 2 – Recovered / Healthy State
During subsequent execution windows:

- Latency stabilised
- Jitter reduced
- Packet loss remained at 0%

**WFSL Route Sentinel classification:**


This confirms the system responds to *current verified conditions*, not historical assumptions.

---

## Key Engineering Outcomes

- WFSL correctly distinguishes **degraded** vs **broken** networks
- No false positives were generated
- Decisions adapted dynamically as conditions changed
- Evidence was emitted for audit and verification
- Local system health was not misclassified

---

## Why This Matters

In telecommunications environments:
- Networks frequently fluctuate
- Degraded does not mean failed
- Overreaction causes outages

WFSL tooling demonstrates **measured, evidence-driven judgement** suitable for real operational use.

---

## Status

This demonstration confirms:
- Live-field readiness
- Deterministic behaviour
- Telecom-grade decision logic

No synthetic data was used.


