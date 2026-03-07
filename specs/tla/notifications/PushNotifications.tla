---- MODULE PushNotifications ----
\* TLA+ specification for BurnBuddy push notification flows.
\* Models the fire-and-forget notification pattern triggered when a user starts
\* a workout. The notification process runs as a background task that collects
\* recipients (burn buddy partners + squad members), filters by FCM token
\* availability, and sends notifications — without ever blocking the workout
\* creation HTTP response.
\*
\* Key safety properties verified:
\* 1. Notification failures never block the workout creation HTTP response
\* 2. Users never receive notifications for their own workouts
\* 3. All burn buddy partners and squad members are correctly targeted
\* 4. Users without FCM tokens are silently skipped (no error state)

EXTENDS Integers, FiniteSets, TLC

CONSTANTS
    Uid,       \* Set of user IDs (model values, e.g., {u1, u2, u3})
    SquadId    \* Set of squad IDs (model values, e.g., {s1})

VARIABLES
    \* --- Relationships (static after Init) ---
    buddyPairs,     \* Set of unordered pairs {u1, u2} — active burn buddy relationships
    squadMembers,   \* Function: SquadId -> SUBSET Uid — squad membership
    activeSquads,   \* SUBSET SquadId — squads that exist
    fcmTokens,      \* SUBSET Uid — users with registered FCM push tokens

    \* --- Workout state ---
    workoutStarted, \* SUBSET Uid — users who have started a workout
    responseSent,   \* SUBSET Uid — users whose HTTP response was delivered

    \* --- Background notification process (per workout-starter) ---
    notifPhase,     \* Uid -> {"idle", "notifying", "done", "failed"}
    computedTargets,\* Uid -> SUBSET Uid — recipients computed from relationships
    sentTo,         \* Uid -> SUBSET Uid — recipients who received the notification
    skippedNoToken  \* Uid -> SUBSET Uid — recipients skipped (no FCM token)

vars == <<buddyPairs, squadMembers, activeSquads, fcmTokens,
          workoutStarted, responseSent,
          notifPhase, computedTargets, sentTo, skippedNoToken>>

----

\* === Helper operators ===

\* Burn buddy partners of user u (users in a buddy pair with u, excluding self)
BuddyPartners(u) ==
    {v \in Uid : \E pair \in buddyPairs : pair = {u, v} /\ v /= u}

\* Squad members who share a squad with u (excluding self)
SquadPartners(u) ==
    UNION {squadMembers[s] \ {u} : s \in {sq \in activeSquads : u \in squadMembers[sq]}}

\* All notification recipients for user u's workout:
\* union of buddy partners and squad members, always excluding self.
\* Mirrors sendWorkoutStartedNotifications() in push-notifications.ts
AllRecipients(u) ==
    BuddyPartners(u) \cup SquadPartners(u)

\* Recipients not yet processed (neither sent to nor skipped)
Unprocessed(u) ==
    computedTargets[u] \ (sentTo[u] \cup skippedNoToken[u])

\* Symmetry set for model checking optimization
Symmetry == Permutations(Uid)

----

\* === Initial state ===
\* Relationships are chosen non-deterministically to verify invariants
\* hold across ALL possible buddy/squad/token configurations.

Init ==
    /\ buddyPairs \in SUBSET {pair \in SUBSET Uid : Cardinality(pair) = 2}
    /\ activeSquads \in SUBSET SquadId
    /\ squadMembers \in [SquadId -> SUBSET Uid]
    /\ fcmTokens \in SUBSET Uid
    /\ workoutStarted = {}
    /\ responseSent = {}
    /\ notifPhase = [u \in Uid |-> "idle"]
    /\ computedTargets = [u \in Uid |-> {}]
    /\ sentTo = [u \in Uid |-> {}]
    /\ skippedNoToken = [u \in Uid |-> {}]

----

\* === Actions ===

\* User u starts a workout.
\* The HTTP response is sent atomically in the same step (synchronous from the
\* client's perspective). The notification process is triggered as a background
\* task — modeled as separate actions in the Next relation.
StartWorkout(u) ==
    /\ u \notin workoutStarted
    /\ notifPhase[u] = "idle"
    \* Response sent immediately — never waits for notification
    /\ workoutStarted' = workoutStarted \cup {u}
    /\ responseSent' = responseSent \cup {u}
    \* Trigger background notification with computed targets
    /\ notifPhase' = [notifPhase EXCEPT ![u] = "notifying"]
    /\ computedTargets' = [computedTargets EXCEPT ![u] = AllRecipients(u)]
    /\ UNCHANGED <<sentTo, skippedNoToken,
                   buddyPairs, squadMembers, activeSquads, fcmTokens>>

\* Background: send notification to recipient v who has an FCM token.
\* Models successful delivery of a push notification via Firebase Cloud Messaging.
SendToRecipient(u, v) ==
    /\ notifPhase[u] = "notifying"
    /\ v \in Unprocessed(u)
    /\ v \in fcmTokens
    /\ sentTo' = [sentTo EXCEPT ![u] = @ \cup {v}]
    /\ UNCHANGED <<skippedNoToken, notifPhase, computedTargets,
                   workoutStarted, responseSent,
                   buddyPairs, squadMembers, activeSquads, fcmTokens>>

\* Background: skip recipient v who has no FCM token.
\* This is a normal (non-error) code path — the API implementation checks for
\* fcmToken existence and silently skips users without one.
SkipNoToken(u, v) ==
    /\ notifPhase[u] = "notifying"
    /\ v \in Unprocessed(u)
    /\ v \notin fcmTokens
    /\ skippedNoToken' = [skippedNoToken EXCEPT ![u] = @ \cup {v}]
    /\ UNCHANGED <<sentTo, notifPhase, computedTargets,
                   workoutStarted, responseSent,
                   buddyPairs, squadMembers, activeSquads, fcmTokens>>

\* Background: notification process completes successfully.
\* All recipients have been processed (either sent to or skipped).
CompleteNotification(u) ==
    /\ notifPhase[u] = "notifying"
    /\ Unprocessed(u) = {}
    /\ notifPhase' = [notifPhase EXCEPT ![u] = "done"]
    /\ UNCHANGED <<computedTargets, sentTo, skippedNoToken,
                   workoutStarted, responseSent,
                   buddyPairs, squadMembers, activeSquads, fcmTokens>>

\* Background: notification process fails due to infrastructure error
\* (e.g., FCM service unavailable, network timeout).
\* Can happen at any point during the notifying phase.
\* Critical property: this does NOT affect the workout creation response,
\* which was already sent in the StartWorkout step.
NotificationFail(u) ==
    /\ notifPhase[u] = "notifying"
    /\ notifPhase' = [notifPhase EXCEPT ![u] = "failed"]
    /\ UNCHANGED <<computedTargets, sentTo, skippedNoToken,
                   workoutStarted, responseSent,
                   buddyPairs, squadMembers, activeSquads, fcmTokens>>

----

\* === State transition relation ===

Next ==
    \/ \E u \in Uid : StartWorkout(u)
    \/ \E u \in Uid, v \in Uid : SendToRecipient(u, v)
    \/ \E u \in Uid, v \in Uid : SkipNoToken(u, v)
    \/ \E u \in Uid : CompleteNotification(u)
    \/ \E u \in Uid : NotificationFail(u)

----

\* === Invariants ===

\* Type invariant — ensures all variables stay within expected domains
TypeOK ==
    /\ workoutStarted \subseteq Uid
    /\ responseSent \subseteq Uid
    /\ \A u \in Uid : notifPhase[u] \in {"idle", "notifying", "done", "failed"}
    /\ \A u \in Uid : computedTargets[u] \subseteq Uid
    /\ \A u \in Uid : sentTo[u] \subseteq Uid
    /\ \A u \in Uid : skippedNoToken[u] \subseteq Uid

\* INV-1: Notification failures never block workout creation response.
\* If a user has started a workout, their HTTP response was always sent,
\* regardless of whether notifications succeeded, failed, or are still in progress.
ResponseNeverBlocked ==
    \A u \in Uid :
        u \in workoutStarted => u \in responseSent

\* INV-2: A user never receives a notification for their own workout.
\* The recipient set computation always excludes the workout starter.
NoSelfNotification ==
    \A u \in Uid :
        /\ u \notin sentTo[u]
        /\ u \notin computedTargets[u]

\* INV-3: When notification targeting is active, ALL burn buddy partners
\* and squad members (excluding self) are included in the target set.
\* No partner or member is accidentally omitted.
AllPartnersTargeted ==
    \A u \in Uid :
        notifPhase[u] /= "idle" =>
            computedTargets[u] = AllRecipients(u)

\* INV-4: Only users with registered FCM tokens receive notifications.
\* A notification is never sent to a user without a token.
OnlyTokenUsersReceive ==
    \A u \in Uid :
        \A v \in sentTo[u] : v \in fcmTokens

\* INV-5: When notification completes successfully, every recipient without
\* an FCM token was cleanly skipped (not errored). Missing tokens never
\* cause the notification process to fail.
NoTokenSkippedCleanly ==
    \A u \in Uid :
        notifPhase[u] = "done" =>
            \A v \in computedTargets[u] :
                v \notin fcmTokens => v \in skippedNoToken[u]

====
