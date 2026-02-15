# Flash Sale System

## 1. Functional Requirements

### 1.1 Flash Sale Lifecycle

The flash sale operates as a state machine with three states.

#### 1.1.1 States

| State      | Description                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------ |
| `upcoming` | Current time is before the configured start time. No purchases allowed.                          |
| `active`   | Current time is within [start, end) and available stock > 0. Purchases allowed.                  |
| `ended`    | Current time is at or past the end time, OR available stock has reached 0. No purchases allowed. |

#### 1.1.2 Transitions

```
upcoming ──[start time reached]──► active ──[end time reached OR stock = 0]──► ended
```

- **Upcoming to Active**: Triggers when the server clock reaches the configured start time.
- **Active to Ended (time)**: Triggers when the server clock reaches the configured end time.
- **Active to Ended (stock)**: Triggers when available stock reaches zero via confirmed purchases.
- `ended` is a terminal state. No transitions out of `ended` are supported.
- There is no direct `upcoming → ended` transition. The sale always passes through `active` first.

#### 1.1.3 Configuration

- **Start time**: A configurable date-time indicating when the sale becomes active.
- **End time**: A configurable date-time indicating when the sale ends (if stock is not exhausted first).
- **Constraint**: End time must be strictly after start time.

#### 1.1.4 Acceptance Criteria

| ID   | Criterion                                                                                                 |
| ---- | --------------------------------------------------------------------------------------------------------- |
| FL-1 | Before start time, sale status endpoint returns `upcoming`.                                               |
| FL-2 | At or after start time (with stock remaining and before end time), sale status endpoint returns `active`. |
| FL-3 | At or after end time, sale status endpoint returns `ended` regardless of remaining stock.                 |
| FL-4 | When stock reaches 0 during an active sale, status immediately becomes `ended`.                           |
| FL-5 | The `ended` state is irreversible within a single sale configuration.                                     |

#### 1.1.5 Edge Cases

- **Clock precision**: State transitions are determined by the server clock. Client clocks are untrusted.
- **Boundary requests**: A purchase attempt that arrives at the exact millisecond of the end time is rejected (end time is exclusive for the active window).
- **Stock exhaustion race**: If the last unit is purchased while other requests are in-flight, those in-flight requests must be rejected, not queued.

---

### 1.2 Inventory Management

#### 1.2.1 Stock Initialization

- A single product type is sold.
- The initial stock quantity is predefined and configured before the sale starts.
- Stock quantity must be a positive integer.

#### 1.2.2 Stock Decrement Rules

- Stock is decremented by exactly 1 for each confirmed purchase.
- The decrement must be **atomic**: check-and-decrement happens as a single indivisible operation.
- Stock must never go below 0.
- No reservation or hold mechanism is required (purchase is immediate: attempt → confirm or reject).

#### 1.2.3 Sold Out Condition

- **Sold out** occurs when available stock reaches 0.
- Once sold out, no further purchases are accepted, even if the end time has not been reached.
- The sold-out condition triggers a transition to the `ended` sale state.

#### 1.2.4 Acceptance Criteria

| ID   | Criterion                                                                            |
| ---- | ------------------------------------------------------------------------------------ |
| IM-1 | Available stock starts at the configured quantity when the sale becomes active.      |
| IM-2 | Each confirmed purchase decrements available stock by exactly 1.                     |
| IM-3 | Available stock never goes below 0, even under concurrent load.                      |
| IM-4 | Total confirmed purchases never exceeds the initial stock quantity (no overselling). |
| IM-5 | When stock reaches 0, all subsequent purchase attempts are rejected.                 |

#### 1.2.5 Edge Cases

- **Concurrent last-unit race**: If 100 users simultaneously attempt to buy the last unit, exactly 1 succeeds and 99 are rejected.
- **Stock query during decrement**: A status query during an active decrement operation must return a consistent (not partially-updated) stock count.

---

### 1.3 Purchase Rules

#### 1.3.1 One Item Per User

- Each user (identified by their user identifier) may purchase at most one unit across the entire sale.
- This constraint is enforced server-side regardless of frontend behavior.

#### 1.3.2 User Identity

- Users are identified by a string identifier (username or email) provided in the purchase request.
- No authentication, registration, or session management is required.
- The identifier is self-reported and trusted (no spoofing prevention required).

#### 1.3.3 Purchase Attempt Outcomes

A purchase attempt results in one of the following:

| Outcome                         | Condition                                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| **Success**                     | Sale is active, stock is available, user has not previously purchased. Stock is decremented. |
| **Rejected: Sale not active**   | Sale status is `upcoming` or `ended`.                                                        |
| **Rejected: Sold out**          | Sale was active but available stock is 0.                                                    |
| **Rejected: Already purchased** | User has already confirmed a purchase.                                                       |

Each outcome must be clearly distinguishable in the API response.

#### 1.3.4 Duplicate Attempt Handling

- **Sequential duplicates**: If a user makes a second purchase attempt after a confirmed purchase, the system returns a clear "already purchased" response without modifying stock.
- **Concurrent duplicates**: If the same user sends multiple simultaneous purchase attempts, exactly one may succeed. All others must be rejected as duplicates. Stock must be decremented by at most 1.

#### 1.3.5 Acceptance Criteria

| ID   | Criterion                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------ |
| PR-1 | A valid purchase attempt during an active sale with available stock succeeds and returns a success response. |
| PR-2 | A user who has already purchased receives an "already purchased" rejection on subsequent attempts.           |
| PR-3 | A purchase attempt when the sale is not active returns a "sale not active" rejection.                        |
| PR-4 | A purchase attempt when stock is 0 returns a "sold out" rejection.                                           |
| PR-5 | Under concurrent duplicate attempts from the same user, at most one succeeds.                                |
| PR-6 | Concurrent duplicate attempts from the same user decrement stock by at most 1.                               |

#### 1.3.6 Edge Cases

- **Purchase at sale boundary**: A purchase request received during `active` state but processed after the end time must be rejected.
- **Empty identifier**: A purchase attempt with an empty or whitespace-only user identifier is rejected with a validation error.

---

### 1.4 Frontend User Experience

#### 1.4.1 Overview

The frontend is a single-page application that displays the current sale status and allows users to attempt a purchase. There is no navigation, routing, or multi-page flow.

#### 1.4.2 Sale Status Display

- The UI must display the current sale state (`upcoming`, `active`, or `ended`).
- During `upcoming`, the UI should indicate that the sale has not started yet.
- During `active`, the UI must display the current available stock count.
- During `ended`, the UI must indicate whether the sale ended due to stock exhaustion or time expiration.
- Sale status and stock count must update without requiring a manual page refresh.

#### 1.4.3 Purchase Flow

- The user enters their identifier (string input) and submits a purchase attempt.
- The purchase button is only enabled when the sale is `active`.
- Upon submission, the UI must show a loading/pending state and prevent duplicate clicks.
- The UI must display distinct feedback for each purchase outcome:

| Outcome           | User-Facing Feedback                                  |
| ----------------- | ----------------------------------------------------- |
| Success           | Clear confirmation that the purchase succeeded.       |
| Sale not active   | Message indicating the sale is not currently running. |
| Sold out          | Message indicating all stock has been sold.           |
| Already purchased | Message indicating the user has already purchased.    |

#### 1.4.4 Input Validation

- The user identifier field must reject empty or whitespace-only input on the client side (mirrors server-side rule from 1.3.6).
- Validation feedback must appear before a request is sent to the server.

#### 1.4.5 Real-Time Updates

- The frontend must reflect sale state and stock changes in near real-time (within a few seconds).
- The update mechanism (polling or server-push) is a design decision to be documented in the architecture.

#### 1.4.6 Acceptance Criteria

| ID   | Criterion                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------ |
| FE-1 | The UI displays the correct sale state (`upcoming`, `active`, `ended`) matching the backend.                 |
| FE-2 | During `active`, the displayed stock count reflects the current server-side value within a reasonable delay. |
| FE-3 | The purchase button is disabled when the sale is not `active`.                                               |
| FE-4 | Each of the four purchase outcomes produces visually distinct feedback to the user.                          |
| FE-5 | The UI prevents submission of empty/whitespace-only identifiers before making a server request.              |
| FE-6 | After a successful purchase, subsequent purchase attempts are prevented or clearly rejected in the UI.       |
| FE-7 | Sale status updates are received without manual page refresh.                                                |

---

## 2. Non-Functional Requirements

### 2.1 Performance and Scalability

#### 2.1.1 Requirements

- The system must handle a large number of concurrent purchase requests without errors or data corruption.
- The architecture must identify and mitigate bottlenecks (e.g., database contention, lock contention, connection pool exhaustion).
- Under load, the system should maintain reasonable response latency (sub-second for the majority of requests).

#### 2.1.2 Scalability Considerations

- The design should support horizontal scaling conceptually (even if not deployed in a distributed manner for this project).
- Bottleneck identification and mitigation strategy must be documented.

#### 2.1.3 Acceptance Criteria

| ID   | Criterion                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------- |
| NF-1 | System handles at least 1,000 concurrent purchase attempts without errors, data loss, or overselling.   |
| NF-2 | Under a stress test of 1,000 concurrent purchase attempts, median response time remains under 1 second. |
| NF-3 | Architectural bottlenecks are identified and addressed in documentation.                                |

> **Rationale for thresholds:**
>
> - **1,000 concurrent requests** — the source requirement describes "thousands of users" attempting simultaneous purchases. 1,000 is a reasonable lower bound that demonstrates the system can handle the thundering-herd pattern while remaining feasible to run in a local test environment.
> - **1 second median response time** — derived from standard web UX expectations where users perceive delays above 1 second as sluggish. For a "Buy Now" action where users are racing against stock depletion, sub-second feedback is critical to a reliable user experience.

---

### 2.2 Robustness and Fault Tolerance

#### 2.2.1 Requirements

- The system must remain in a consistent state after unexpected failures (e.g., crash during purchase processing).
- Graceful degradation: under extreme load beyond capacity, the system should reject requests cleanly rather than corrupt data.
- No partial state: a purchase is either fully confirmed (stock decremented + user marked) or fully rejected.

#### 2.2.2 Acceptance Criteria

| ID   | Criterion                                                                                            |
| ---- | ---------------------------------------------------------------------------------------------------- |
| NF-4 | After a simulated crash and restart, the system state (stock count, purchase records) is consistent. |
| NF-5 | Under load exceeding capacity, the system rejects excess requests cleanly without data corruption.   |
| NF-6 | No partial purchases exist (stock decremented without user record, or vice versa).                   |

---

### 2.3 Concurrency Control

#### 2.3.1 Requirements

- Race conditions on stock decrement must be prevented. Two concurrent purchases must not both decrement the same unit.
- Race conditions on per-user purchase limits must be prevented. Two concurrent requests from the same user must not both succeed.
- The atomicity guarantee must cover the combined operation: check stock, check user, decrement stock, and record purchase must be a single atomic transaction.

#### 2.3.2 Acceptance Criteria

| ID   | Criterion                                                                     |
| ---- | ----------------------------------------------------------------------------- |
| NF-7 | Under concurrent load, total confirmed purchases never exceeds initial stock. |
| NF-8 | Under concurrent load, no user has more than one confirmed purchase.          |
| NF-9 | The stock check + user check + decrement + record operation is atomic.        |

---

### 2.4 Traffic Management

#### 2.4.1 Rate Limiting

- API endpoints should be designed with rate-limiting boundaries in mind (per-user and global).
- The purchase endpoint naturally self-limits (one per user), but the status endpoint is vulnerable to polling storms.
- Architecture docs should specify where rate limiting would be applied (API gateway, reverse proxy, or application layer) and the chosen strategy (token bucket, sliding window, etc.).

#### 2.4.2 DDoS Mitigation

- The thundering herd at sale start is structurally identical to a DDoS — the architecture must distinguish legitimate surge from abuse.
- Design should document where traffic filtering would sit (CDN/edge, load balancer, application) and how legitimate users are prioritized.
- For local implementation: application-level request throttling serves as a stand-in for production-grade DDoS protection.

#### 2.4.3 Static Asset Delivery (CDN)

- In production, the React SPA bundle and static assets would be served from a CDN to keep origin servers focused on API traffic.
- The status endpoint response (read-only, high-frequency) is a candidate for short-TTL edge caching to reduce origin load.
- For local implementation: static file serving from the application server is acceptable, but architecture docs should note the CDN layer.

#### 2.4.4 Acceptance Criteria

| ID    | Criterion                                                                                        |
| ----- | ------------------------------------------------------------------------------------------------ |
| NF-10 | Architecture documentation includes a rate-limiting strategy specifying placement and algorithm. |
| NF-11 | Architecture documentation addresses DDoS/thundering-herd mitigation at the design level.        |
| NF-12 | Architecture documentation identifies CDN placement for static assets and cacheable endpoints.   |

> Note: These are **design-level requirements** — the architecture must account for them, but production-grade implementation (WAF, cloud CDN, distributed rate limiters) is not required for the local deliverable.

---

## 3. Testing Requirements

### 3.1 Unit Tests

- Test business logic in isolation (sale lifecycle state transitions, stock management, purchase rule enforcement).
- Cover all acceptance criteria edge cases from Section 3.

**Success Criteria:**

| ID  | Criterion                                                                  |
| --- | -------------------------------------------------------------------------- |
| T-1 | Unit tests cover all sale state transitions including boundary conditions. |
| T-2 | Unit tests verify stock cannot go below 0 and overselling is impossible.   |
| T-3 | Unit tests verify per-user purchase limit enforcement.                     |

### 3.2 Integration Tests

- Test API endpoints end-to-end (HTTP request → response).
- Verify correct response codes and bodies for all purchase outcomes.
- Test the full lifecycle: upcoming → active → purchase → sold out → ended.

**Success Criteria:**

| ID  | Criterion                                                                    |
| --- | ---------------------------------------------------------------------------- |
| T-4 | Integration tests exercise every API endpoint with valid and invalid inputs. |
| T-5 | Integration tests verify the full sale lifecycle through the API.            |
| T-6 | Integration tests verify distinct response types for each rejection reason.  |

### 3.3 Stress Tests

- Simulate a high volume of concurrent users (hundreds to thousands) attempting purchases simultaneously.
- Prove that concurrency controls hold under load.
- Results must be documented and explainable.

**Success Criteria:**

| ID   | Criterion                                                                                                                               |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------- |
| T-7  | Stress test simulates at least 1,000 concurrent purchase attempts against a stock of fewer units (e.g., 100 stock, 1,000 users).        |
| T-8  | After stress test completion, total confirmed purchases equals min(stock, unique users) with zero overselling.                          |
| T-9  | After stress test completion, no user has more than one confirmed purchase.                                                             |
| T-10 | Stress test results are logged and include: total attempts, successful purchases, rejected attempts (by reason), and final stock count. |

> **Rationale for thresholds:**
>
> - **1,000 concurrent users** — matches NF-1 and represents the "thousands of users" scenario from the source requirement at a scale that is reproducible locally.
> - **100 stock (10:1 user-to-stock ratio)** — ensures most requests are rejected, which maximises contention on the final units and exposes race conditions in both stock decrement and per-user deduplication. A 1:1 ratio would let nearly everyone succeed and would not stress concurrency controls.

---

## 4. Assumptions and Decisions

### 4.1 Assumptions

| #   | Assumption                                                                                       | Rationale                                                                                        |
| --- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| A-1 | No real authentication is required. User identity is a self-reported string.                     | The assessment focuses on concurrency and throughput, not auth infrastructure.                   |
| A-2 | No real payment processing occurs. A "confirmed purchase" means the system accepted the attempt. | Payment integration is out of scope per the assessment.                                          |
| A-3 | A single server instance is sufficient for the initial implementation.                           | The assessment allows local infrastructure. Horizontal scaling is designed for but not deployed. |
| A-4 | Cloud services (Redis, message queues) may be simulated locally or in-memory.                    | The assessment permits local Docker or in-memory simulation as long as choices are documented.   |
| A-5 | Server clock is the single source of truth for sale timing.                                      | Client clocks are untrusted. Distributed clock sync is out of scope.                             |
| A-6 | The flash sale is configured once before it starts and is not modified during or after.          | No admin UI or runtime reconfiguration is required.                                              |

### 4.2 Decisions

| #   | Decision                                                                          | Rationale                                                                 |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| D-1 | Language: TypeScript for both backend and frontend.                               | Required by assessment guidelines. Provides type safety across the stack. |
| D-2 | Backend framework: To be selected from Express, Fastify, Nest.js, or native http. | Per assessment constraints. Choice to be documented in architecture docs. |
| D-3 | Frontend framework: React.                                                        | Required by assessment guidelines.                                        |
| D-4 | All concurrency-critical operations use atomic operations or transactions.        | Non-negotiable for correctness under load.                                |

### 4.3 Back-of-the-Envelope Estimation

The following estimates ground the performance thresholds from Sections 2 and 3 in concrete capacity math. All figures assume the stress-test scenario: **100 stock, 1,000–10,000 users, sale duration of a few minutes**.

| Dimension                     | Estimate             | Notes                                                   |
| ----------------------------- | -------------------- | ------------------------------------------------------- |
| **Traffic**                   |                      |                                                         |
| Connected users               | 1,000–10,000         | Source requirement: "thousands of users" simultaneously |
| Peak purchase QPS             | ~2,000 req/s         | 10,000 users firing within a 5 s window                 |
| Status polling QPS            | ~10,000 req/s        | 1 poll/s per connected client (read-only, no writes)    |
| Status polling QPS (with CDN) | ~100 req/s to origin | Edge cache absorbs 99% of status polls at 1–2 s TTL     |
| **Storage**                   |                      |                                                         |
| Per-purchase record           | ~200 B               | User ID string + timestamp + status                     |
| All purchase records          | ~20 KB               | 100 confirmed purchases × 200 B                         |
| User dedup set                | ~500 KB              | 10,000 user IDs × ~50 B avg                             |
| Total persistent data         | < 1 MB               | Fits entirely in memory; disk persistence is optional   |
| **Memory**                    |                      |                                                         |
| Stock counter                 | 8 B                  | Single atomic integer                                   |
| User-purchased set            | ~500 KB              | Hash set of 10,000 entries                              |
| Business state total          | < 1 MB               | Negligible relative to runtime overhead                 |
| Connection overhead           | ~100 MB              | 10,000 concurrent connections × ~10 KB each             |
| **Bandwidth**                 |                      |                                                         |
| Per-purchase round trip       | ~500 B               | ~200 B request + ~300 B response                        |
| Purchase peak throughput      | ~1 MB/s              | 2,000 req/s × 500 B                                     |
| Status polling throughput     | ~5 MB/s              | 10,000 clients × ~500 B response at 1 req/s             |

> **Key Takeaway**
>
> - The system is **compute/concurrency-bound**, not storage or bandwidth-bound. All business state fits in < 1 MB of memory, and peak bandwidth is well under 10 MB/s.
> - The bottleneck is **atomic operations on shared state** (stock counter + user-purchased set), not I/O or storage.
> - This confirms the architecture should prioritise **lock contention and atomic-operation throughput** over storage capacity or network optimisation.

---

## 5. Out of Scope

The following are explicitly excluded from this project:

| Item                                                              | Reason                                                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Payment processing                                                | No real payment gateway integration required.                                                     |
| User authentication and registration                              | Identity is a self-reported string; no login system.                                              |
| Multi-product catalog                                             | Single product only per assessment constraints.                                                   |
| Order history and management                                      | No post-purchase order tracking beyond purchase verification.                                     |
| Email or push notifications                                       | No notification system for purchase confirmations or sale reminders.                              |
| Live cloud deployment                                             | System runs locally; cloud architecture is designed but not deployed.                             |
| Admin interface                                                   | No runtime configuration UI; sale parameters are set before startup.                              |
| Cart or wishlist functionality                                    | Single "Buy Now" action; no shopping cart.                                                        |
| Production-grade DDoS infrastructure (WAF, cloud-based scrubbing) | Design is documented; deployment of dedicated DDoS appliances is out of scope.                    |
| CDN deployment                                                    | Architecture specifies CDN placement; actual CDN provisioning is out of scope for local delivery. |
| Internationalization or localization                              | Single-locale interface.                                                                          |
