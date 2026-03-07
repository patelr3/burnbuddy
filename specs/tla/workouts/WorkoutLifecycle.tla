------------------------ MODULE WorkoutLifecycle ------------------------
(*
  Models the workout start/end lifecycle and group workout detection for BurnBuddy.
  Verifies deduplication, time window constraints, ownership enforcement,
  and that group detection runs concurrently without blocking workout creation.

  Maps to: services/api/src/routes/workouts.ts (start/end workout)
           services/api/src/services/group-workout-detection.ts (buddy/squad detection)

  Key abstractions:
    - Time: natural numbers 1..MaxTime (0 reserved as "endedAt not set")
    - WindowSize = 1 abstracts the 20-minute group detection window
    - StaleThreshold = 2 abstracts the 90-minute auto-end threshold
    - Workout type (Running, Yoga, etc.) is omitted — does not affect safety invariants
    - Buddy/squad relationships are pre-configured to focus on workout operations

  Abstract time phases for each workout (relative to current time):
    - WithinWindow: time - w.startedAt <= WindowSize  (eligible for group detection)
    - AfterWindow:  time - w.startedAt > WindowSize   (too old for group detection)
    - Stale:        time - w.startedAt >= StaleThreshold (should be auto-ended)

  Concurrency model:
    StartWorkout, EndWorkout, AutoEndStaleWorkouts, and group detection actions
    are independent disjuncts in Next. Detection never blocks workout creation
    by construction.
*)
EXTENDS Integers, FiniteSets, TLC

CONSTANT Uid          \* Set of user identifiers (model values)

CONSTANTS
    WorkoutId,       \* Set of workout identifiers (model values)
    SquadId,         \* Set of squad identifiers (model values)
    MaxTime          \* Maximum time value (natural number, e.g., 3)

\* Workout status values (from @burnbuddy/shared types.ts)
WorkoutStatus == {"active", "completed"}

\* --- Abstract time thresholds ---
\* WindowSize models the 20-minute group workout detection window.
\* StaleThreshold models the 90-minute auto-end threshold.
WindowSize == 1
StaleThreshold == 2

VARIABLES
    time,            \* Current global time (1..MaxTime)
    workouts,        \* Set of workout records
    groupWorkouts,   \* Set of group workout records
    buddies,         \* Set of sets {u1, u2} — pre-configured burn buddy pairs
    squads           \* Set of records [id, memberUids] — pre-configured squads

vars == <<time, workouts, groupWorkouts, buddies, squads>>

\* =====================================================================
\* Helper operators
\* =====================================================================

\* All unordered pairs from Uid — each pair is a 2-element subset {u1, u2}
AllBuddyPairs == { pair \in SUBSET Uid : Cardinality(pair) = 2 }

\* Set of workout IDs currently in use
UsedIds == { w.id : w \in workouts }

\* Active workouts for a specific user
ActiveWorkouts(uid) ==
    { w \in workouts : w.uid = uid /\ w.status = "active" }

\* Active workouts for a user that are within the detection window at current time
ActiveInWindow(uid) ==
    { w \in workouts :
        /\ w.uid = uid
        /\ w.status = "active"
        /\ time - w.startedAt <= WindowSize }

\* Check if a GroupWorkout already exists for a given reference+type within current window
\* (Deduplication check — mirrors the API's check before creating a GroupWorkout)
GroupWorkoutExistsInWindow(refId, gwt) ==
    \E gw \in groupWorkouts :
        /\ gw.gwType = gwt
        /\ gw.referenceId = refId
        /\ time - gw.detectedAt <= WindowSize

\* Symmetry optimization for TLC — reduces state space.
\* Sound for safety invariants when all users and workout IDs are interchangeable.
Symmetry == Permutations(Uid) \cup Permutations(WorkoutId)

\* =====================================================================
\* Type invariant
\* =====================================================================

TypeOK ==
    /\ time \in 1..MaxTime
    /\ \A w \in workouts :
        /\ w.id \in WorkoutId
        /\ w.uid \in Uid
        /\ w.status \in WorkoutStatus
        /\ w.startedAt \in 1..MaxTime
        /\ w.endedAt \in 0..MaxTime      \* 0 means "not yet ended"
    /\ \A gw \in groupWorkouts :
        /\ gw.gwType \in {"buddy", "squad"}
        /\ gw.memberUids \subseteq Uid
        /\ gw.detectedAt \in 1..MaxTime
        /\ gw.workoutIds \subseteq WorkoutId
    /\ buddies \subseteq SUBSET Uid
    /\ \A b \in buddies : Cardinality(b) = 2
    /\ \A s \in squads :
        /\ s.id \in SquadId
        /\ s.memberUids \subseteq Uid

\* =====================================================================
\* Initial state
\* =====================================================================

Init ==
    /\ time = 1
    /\ workouts = {}
    /\ groupWorkouts = {}
    \* Pre-configure: all user pairs are burn buddies (simplifies model)
    /\ buddies = AllBuddyPairs
    \* Pre-configure: one squad per SquadId with all users as members
    /\ squads = { [id |-> sid, memberUids |-> Uid] : sid \in SquadId }

\* =====================================================================
\* Actions
\* =====================================================================

\* --- StartWorkout: User creates a new active workout ---
\* Models POST /workouts. Any user can start a workout at any time.
\* Workout type is omitted — it doesn't affect safety properties.
StartWorkout(uid, wid) ==
    /\ wid \notin UsedIds                  \* Fresh workout ID
    /\ workouts' = workouts \cup {[
        id        |-> wid,
        uid       |-> uid,
        status    |-> "active",
        startedAt |-> time,
        endedAt   |-> 0                    \* 0 = not yet ended
       ]}
    /\ UNCHANGED <<time, groupWorkouts, buddies, squads>>

\* --- EndWorkout: User ends their own active workout ---
\* Models PATCH /workouts/:id/end. Only the workout owner can end it.
\* The ownership check (w.uid = uid) is the key guard — no other user
\* can transition this workout to completed.
EndWorkout(uid, wid) ==
    \E w \in workouts :
        /\ w.id = wid
        /\ w.uid = uid                     \* Ownership enforcement
        /\ w.status = "active"
        /\ workouts' = (workouts \ {w}) \cup
            {[w EXCEPT !.status = "completed", !.endedAt = time]}
        /\ UNCHANGED <<time, groupWorkouts, buddies, squads>>

\* --- AutoEndStaleWorkouts: Background job ends workouts past stale threshold ---
\* Models the scheduled auto-end for workouts active > 90 minutes.
\* Ends ALL stale workouts atomically (matches batch job behavior).
AutoEndStaleWorkouts ==
    /\ \E w \in workouts :                 \* Guard: at least one stale workout exists
        w.status = "active" /\ time - w.startedAt >= StaleThreshold
    /\ workouts' = {
        IF w.status = "active" /\ time - w.startedAt >= StaleThreshold
        THEN [w EXCEPT !.status = "completed", !.endedAt = time]
        ELSE w
        : w \in workouts }
    /\ UNCHANGED <<time, groupWorkouts, buddies, squads>>

\* --- DetectBuddyGroupWorkout: Background detection for a buddy pair ---
\* Fires when both members have active workouts within the detection window.
\* Models the fire-and-forget group workout detection triggered by workout creation.
\* Deduplication: skips creation if a GroupWorkout for this pair already exists in window.
DetectBuddyGroupWorkout(pair) ==
    /\ pair \in buddies
    /\ \A uid \in pair : ActiveInWindow(uid) /= {}
    /\ ~GroupWorkoutExistsInWindow(pair, "buddy")
    /\ LET wids == UNION { {w.id : w \in ActiveInWindow(uid)} : uid \in pair }
       IN groupWorkouts' = groupWorkouts \cup {[
            gwType      |-> "buddy",
            referenceId |-> pair,
            memberUids  |-> pair,
            workoutIds  |-> wids,
            detectedAt  |-> time
          ]}
    /\ UNCHANGED <<time, workouts, buddies, squads>>

\* --- DetectSquadGroupWorkout: Background detection for a squad ---
\* Fires when ALL squad members have active workouts within the detection window.
\* Requires at least 2 squad members for a group workout to be meaningful.
\* Deduplication: skips creation if a GroupWorkout for this squad already exists in window.
DetectSquadGroupWorkout(sid) ==
    \E squad \in squads :
        /\ squad.id = sid
        /\ Cardinality(squad.memberUids) >= 2
        /\ \A uid \in squad.memberUids : ActiveInWindow(uid) /= {}
        /\ ~GroupWorkoutExistsInWindow(sid, "squad")
        /\ LET wids == UNION { {w.id : w \in ActiveInWindow(uid)} : uid \in squad.memberUids }
           IN groupWorkouts' = groupWorkouts \cup {[
                gwType      |-> "squad",
                referenceId |-> sid,
                memberUids  |-> squad.memberUids,
                workoutIds  |-> wids,
                detectedAt  |-> time
              ]}
        /\ UNCHANGED <<time, workouts, buddies, squads>>

\* --- AdvanceTime: Global clock tick ---
\* Each tick represents the passage of abstract time (~half a detection window).
\* As time advances, workouts move through phases: WithinWindow → AfterWindow → Stale.
AdvanceTime ==
    /\ time < MaxTime
    /\ time' = time + 1
    /\ UNCHANGED <<workouts, groupWorkouts, buddies, squads>>

\* =====================================================================
\* Next-state relation
\* =====================================================================

\* StartWorkout and detection actions are independent disjuncts in Next,
\* modeling that detection never blocks workout creation (structural property).
Next ==
    \/ \E uid \in Uid, wid \in WorkoutId :
        StartWorkout(uid, wid)
    \/ \E uid \in Uid, wid \in WorkoutId :
        EndWorkout(uid, wid)
    \/ AutoEndStaleWorkouts
    \/ \E pair \in buddies :
        DetectBuddyGroupWorkout(pair)
    \/ \E sid \in SquadId :
        DetectSquadGroupWorkout(sid)
    \/ AdvanceTime

Spec == Init /\ [][Next]_vars

\* =====================================================================
\* Safety invariants
\* =====================================================================

\* 1. Completed workouts always have endedAt set (non-zero timestamp).
\*    Active workouts always have endedAt = 0 (not yet ended).
CompletedWorkoutsHaveEndedAt ==
    \A w \in workouts :
        /\ (w.status = "completed") => (w.endedAt > 0)
        /\ (w.status = "active") => (w.endedAt = 0)

\* 2. User can only end their own workouts.
\*    Enforced structurally by the EndWorkout guard (w.uid = uid).
\*    No separate state predicate needed — the guard prevents any state where
\*    a different user's action transitions a workout to completed.

\* 3. At most one GroupWorkout per buddy pair per detection window (dedup).
\*    Two group workouts for the same buddy reference must be in different windows.
BuddyGroupWorkoutDedup ==
    \A gw1, gw2 \in groupWorkouts :
        (gw1 /= gw2 /\ gw1.gwType = "buddy" /\ gw2.gwType = "buddy"
         /\ gw1.referenceId = gw2.referenceId)
        =>
        \* Not within the same window (uses addition to avoid Nat underflow)
        ~(gw1.detectedAt <= gw2.detectedAt + WindowSize
          /\ gw2.detectedAt <= gw1.detectedAt + WindowSize)

\* 4. At most one GroupWorkout per squad per detection window (dedup).
SquadGroupWorkoutDedup ==
    \A gw1, gw2 \in groupWorkouts :
        (gw1 /= gw2 /\ gw1.gwType = "squad" /\ gw2.gwType = "squad"
         /\ gw1.referenceId = gw2.referenceId)
        =>
        ~(gw1.detectedAt <= gw2.detectedAt + WindowSize
          /\ gw2.detectedAt <= gw1.detectedAt + WindowSize)

\* 5. GroupWorkout for buddy requires both members had active workouts in window.
\*    Each member must have contributed a workout started within the detection window
\*    at the time the GroupWorkout was detected.
BuddyGroupWorkoutRequiresBothActive ==
    \A gw \in groupWorkouts :
        gw.gwType = "buddy" =>
            /\ Cardinality(gw.memberUids) = 2
            /\ gw.memberUids \in buddies
            /\ \A uid \in gw.memberUids :
                \E w \in workouts :
                    /\ w.id \in gw.workoutIds
                    /\ w.uid = uid
                    /\ gw.detectedAt - w.startedAt <= WindowSize

\* 6. GroupWorkout for squad requires ALL members had active workouts in window.
\*    The memberUids must match the squad's membership at detection time.
SquadGroupWorkoutRequiresAllActive ==
    \A gw \in groupWorkouts :
        gw.gwType = "squad" =>
            /\ \E s \in squads :
                s.id = gw.referenceId /\ s.memberUids = gw.memberUids
            /\ \A uid \in gw.memberUids :
                \E w \in workouts :
                    /\ w.id \in gw.workoutIds
                    /\ w.uid = uid
                    /\ gw.detectedAt - w.startedAt <= WindowSize

\* 7. Detection does not block workout creation.
\*    Structural property: StartWorkout and Detect* are independent disjuncts
\*    in Next. No state predicate needed — verified by model structure.

\* Combined invariant checked by TLC
Invariant ==
    /\ TypeOK
    /\ CompletedWorkoutsHaveEndedAt
    /\ BuddyGroupWorkoutDedup
    /\ SquadGroupWorkoutDedup
    /\ BuddyGroupWorkoutRequiresBothActive
    /\ SquadGroupWorkoutRequiresAllActive

=========================================================================
