# BurnBuddy TLA+ Formal Specifications

Formal models of the BurnBuddy API's core protocols using [TLA+](https://lamport.azurewebsites.net/tla/tla.html). These specs verify safety invariants for request/response protocols, concurrent operations, Firestore state transitions, and background processes.

## Directory Structure

```
specs/tla/
├── Common.tla                  # Shared types (Uid, Timestamp, Status, etc.)
├── CrossDomainInvariants.tla   # Invariants spanning multiple domains
├── README.md                   # This file
├── VERIFICATION_REPORT.md      # Mapping of specs to implementation
├── friends/
│   ├── FriendManagement.tla    # Friend request lifecycle
│   └── FriendManagement.cfg    # TLC config
├── burn-buddies/
│   ├── BurnBuddyManagement.tla # Burn buddy lifecycle
│   └── BurnBuddyManagement.cfg
├── burn-squads/
│   ├── BurnSquadManagement.tla # Squad admin/member management
│   └── BurnSquadManagement.cfg
├── workouts/
│   ├── WorkoutLifecycle.tla    # Workout start/end & group detection
│   └── WorkoutLifecycle.cfg
├── users/
│   ├── UserProfileManagement.tla # Profile & username reservation
│   └── UserProfileManagement.cfg
└── notifications/
    ├── PushNotifications.tla   # Notification targeting & delivery
    └── PushNotifications.cfg
```

## Prerequisites

1. **Java 11+** — required to run the TLC model checker.

2. **TLA+ Toolbox** (optional GUI) — download from:
   <https://github.com/tlaplus/tlaplus/releases>

3. **tla2tools.jar** (CLI) — download from the same releases page, or:
   ```bash
   curl -LO https://github.com/tlaplus/tlaplus/releases/download/v1.8.0/tla2tools.jar
   ```

## Running TLC from the Command Line

From the `specs/tla/` directory:

```bash
# Check a single spec (e.g., FriendManagement)
java -cp tla2tools.jar tlc2.TLC friends/FriendManagement.tla \
  -config friends/FriendManagement.cfg \
  -workers auto

# Check all specs (run each one)
for dir in friends burn-buddies burn-squads workouts users notifications; do
  for cfg in "$dir"/*.cfg; do
    tla="${cfg%.cfg}.tla"
    echo "=== Checking $tla ==="
    java -cp tla2tools.jar tlc2.TLC "$tla" -config "$cfg" -workers auto
  done
done
```

### Interpreting TLC Output

- **Model checking completed. No error has been found.** — All invariants hold for the explored state space. Success!
- **Error: Invariant ___ is violated.** — TLC found a reachable state that breaks the named invariant. The output includes a trace of states leading to the violation.
- **Error: Deadlock reached.** — The system reached a state with no enabled actions. This may or may not be a problem depending on whether the spec allows termination.

Key metrics in the output:
- **Distinct states found** — total unique states explored
- **States generated** — total states (including duplicates) generated during the search
- **Depth** — length of the longest behavior explored

## Learning Resources

- [Learn TLA+](https://learntla.com/) — beginner-friendly tutorial by Hillel Wayne
- [TLA+ Video Course](https://lamport.azurewebsites.net/video/videos.html) — Leslie Lamport's video lectures
- [Specifying Systems](https://lamport.azurewebsites.net/tla/book.html) — the definitive TLA+ book (free PDF)
- [TLA+ Examples](https://github.com/tlaplus/Examples) — community-maintained example repository
- [PlusCal Reference](https://lamport.azurewebsites.net/tla/pluscal.html) — algorithm language that compiles to TLA+

## Relationship to Implementation

Each TLA+ spec models the behavior defined in the Express API route handlers under `services/api/src/routes/`. The `VERIFICATION_REPORT.md` maps each modeled invariant to the corresponding code location and documents any gaps.
