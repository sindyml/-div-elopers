# Sprint Burndown Reports: Stockpal

These reports track the progress of work during each sprint, showing the relationship between time and remaining story points/tasks.

## Sprint 3: PayFast Migration (May 1 - May 14, 2026)
**Goal:** 40 Story Points (SPs) total.

| Day | Remaining SPs | Actual Progress | Notes |
|---|---|---|---|
| Day 1 | 40 | 40 | Sprint kick-off |
| Day 3 | 34 | 32 | Backend service implementation ahead of schedule |
| Day 5 | 29 | 25 | API endpoints (/initiate, /notify) completed |
| Day 8 | 20 | 18 | Frontend UI integration started |
| Day 10 | 14 | 12 | Verification tests (test-integration.js) passing |
| Day 12 | 6 | 4 | Documentation and edge case handling |
| Day 14 | 0 | 0 | Sprint completed successfully ✅ |

### Sprint 3 Burndown Visualization
```text
SPs
40 |*
   | *
30 |  *
   |   *
20 |    *
   |     *
10 |      *
   |       *
 0 |________*
   Day 1    14
```

---

## Sprint 4: Auth & UX Optimization (May 15 - May 30, 2026)
**Goal:** 45 Story Points (SPs) total. **STATUS: IN PROGRESS**

| Day | Remaining SPs | Actual Progress | Notes |
|---|---|---|---|
| Day 1 | 45 | 45 | Sprint kick-off |
| Day 3 | 39 | 40 | Delayed by Auth persistence bug |
| Day 5 | 32 | 34 | Dashboard UI standardizing balance fields |
| Day 8 | 26 | 28 | AI Chatbot widget integrated |
| Day 11 | 19 | 15 | **Current Status: Accelerated after Stripe base setup** |
| Day 12 | 13 | - | (Estimated) Stripe Webhook completion |
| Day 14 | 0 | - | (Estimated) Final UAT and Polish |

### Sprint 4 Burndown Visualization
```text
SPs
45 |*
   | *
35 |  O
   |   O
25 |    O
   |     O  <- (Current Trend: Accelerating)
15 |      *
   |       *
 0 |________*
   Day 1    14

Legend: * = Ideal, O = Actual
```

## Analysis
- **Sprint 3:** Showed high velocity in backend tasks, allowing for extra time on documentation.
- **Sprint 4:** Started slower due to a complex authentication header bug, but velocity increased significantly after the AI widget deployment and the start of the Stripe transition.
