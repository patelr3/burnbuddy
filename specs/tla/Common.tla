--------------------------- MODULE Common ---------------------------
(*
  Common types and helper operators shared across all BurnBuddy TLA+ specs.
  Maps domain types from @burnbuddy/shared (packages/shared/src/types.ts)
  into TLA+ CONSTANTS and type-invariant operators.
*)
EXTENDS Integers, Sequences, FiniteSets

------------------------------------------------------------------------
-- User identifiers
-- Uid is a set of model values representing user IDs.
CONSTANT Uid

-- Timestamps modeled as natural numbers (monotonically increasing).
-- 0 means "not set" / absent.
Timestamp == Nat

------------------------------------------------------------------------
-- Request status values (friend requests, buddy requests, squad join requests)
Status == {"pending", "accepted", "declined"}

-- Workout types matching the WorkoutType union in types.ts
WorkoutType == {"Weightlifting", "Running", "Cycling", "Yoga",
                "Barre", "Swimming", "HIIT", "Custom"}

-- Workout status values
WorkoutStatus == {"active", "completed"}

------------------------------------------------------------------------
-- Type-invariant helpers

(* Check that a value is a valid Uid *)
IsUid(u) == u \in Uid

(* Check that a value is a valid Timestamp *)
IsTimestamp(t) == t \in Nat

(* Check that a value is a valid Status *)
IsStatus(s) == s \in Status

(* Check that a value is a valid WorkoutType *)
IsWorkoutType(wt) == wt \in WorkoutType

(* Check that a value is a valid WorkoutStatus *)
IsWorkoutStatus(ws) == ws \in WorkoutStatus

------------------------------------------------------------------------
-- Utility operators

(* Ordered pair of UIDs — ensures uid1 < uid2 for canonical representation.
   Used by BurnBuddy relationships where UIDs are stored sorted. *)
OrderedPair(a, b) == IF a < b THEN <<a, b>> ELSE <<b, a>>

(* All unordered pairs from a set *)
UnorderedPairs(S) == { {a, b} : a \in S, b \in S \ {a} }

========================================================================
