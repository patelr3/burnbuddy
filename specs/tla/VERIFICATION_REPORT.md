# TLA+ Specification vs. API Implementation — Verification Report

This report maps every TLA+ invariant to its corresponding code location in the Express
API (`services/api/src/`) and classifies each as ✅ correctly implemented,
⚠️ partially implemented, or ❌ not enforced.

---

## 1. Friend Management

**Spec:** `specs/tla/friends/FriendManagement.tla`
**Route:** `services/api/src/routes/friends.ts`

| # | Invariant | Status | Code Location | Notes |
|---|-----------|--------|---------------|-------|
| 1 | **TypeOK** | ✅ | TypeScript types (`FriendRequest`, `Friend` from `@burnbuddy/shared`) | Structural correctness enforced by TS compiler |
| 2 | **AtMostOnePendingPerDirection** | ✅ | `friends.ts:31-42` | Queries `friendRequests` for matching `fromUid`, `toUid`, `status=pending` before creating |
| 3 | **FriendshipIsSymmetric** | ✅ | `friends.ts:148-152` | Friendship doc uses sorted composite key `${uid1}_${uid2}`, ensuring a single bidirectional record |
| 4 | **NoSelfRequests** | ✅ | `friends.ts:23-26` | `if (toUid === fromUid)` returns 400 |
| 5 | **OnlyRecipientCanAccept** | ✅ | `friends.ts:135-138` | `if (friendRequest.toUid !== uid)` returns 403 |
| 6 | **NoDuplicateFriendships** | ✅ | `friends.ts:148-150` | Sorted composite key as Firestore doc ID (`${uid1}_${uid2}`) prevents duplicates at the storage layer |
| 7 | **BoundedFriendships** | ✅ | Theoretical bound (C(n,2)) | Naturally holds; no unbounded creation path |

---

## 2. Burn Buddy Management

**Spec:** `specs/tla/burn-buddies/BurnBuddyManagement.tla`
**Route:** `services/api/src/routes/burn-buddies.ts`

| # | Invariant | Status | Code Location | Notes |
|---|-----------|--------|---------------|-------|
| 1 | **TypeOK** | ✅ | TypeScript types (`BurnBuddyRequest`, `BurnBuddy`) | Structural correctness enforced by TS compiler |
| 2 | **FriendshipRequiredForBuddyRequest** | ✅ | `burn-buddies.ts:32-39` | Checks friendship doc exists via sorted composite key before creating request |
| 3 | **AtMostOneBuddyPerPair** | ✅ | `burn-buddies.ts:119-130` | Uses sorted composite key `${uid1}_${uid2}` as doc ID (matching friendship pattern). Returns 409 if BurnBuddy already exists for the pair. |
| 4 | **BuddyUidsSorted** | ✅ | `burn-buddies.ts:122` | `const [bbUid1, bbUid2] = [fromUid, uid].sort()` |
| 5 | **AtMostOnePendingPerDirection** | ✅ | `burn-buddies.ts:43-54` | Checks per-direction (`fromUid`, `toUid`, `status=pending`) before creating |
| 6 | **OnlyRecipientCanAccept** | ✅ | `burn-buddies.ts:109-112` | `if (burnBuddyRequest.toUid !== uid)` returns 403 |
| 7 | **NoSelfRequests** | ✅ | `burn-buddies.ts:25-28` | `if (toUid === fromUid)` returns 400 |
| 8 | **BoundedBuddies** | ✅ | Theoretical bound | Naturally holds |

---

## 3. Burn Squad Management

**Spec:** `specs/tla/burn-squads/BurnSquadManagement.tla`
**Route:** `services/api/src/routes/burn-squads.ts`

| # | Invariant | Status | Code Location | Notes |
|---|-----------|--------|---------------|-------|
| 1 | **TypeOK** | ✅ | TypeScript types (`BurnSquad`, `BurnSquadJoinRequest`) | Structural correctness enforced by TS compiler |
| 2 | **ExactlyOneAdmin** | ✅ | `burn-squads.ts:37` | Single `adminUid` field; no transfer mechanism exists |
| 3 | **AdminInMembers** | ✅ | `burn-squads.ts:38` | `memberUids: [adminUid]` on creation |
| 4 | **CannotInviteNonFriends** | ✅ | `burn-squads.ts:54-57` (create), `burn-squads.ts:365-369` (add member) | Friendship verified before sending invite |
| 5 | **OnlyRecipientCanAccept** | ✅ | `burn-squads.ts:293-295` | `if (joinRequest.toUid !== uid)` returns 403 |
| 6 | **AdminOnlyInviteEnforced** | ✅ | `burn-squads.ts:359-362` | Checks `settings.onlyAdminsCanAddMembers && adminUid !== uid` |
| 7 | **OnlyAdminCanManage** | ✅ | `burn-squads.ts:251-254` (PUT), `burn-squads.ts:486-489` (settings), `burn-squads.ts:524-527` (DELETE) | All admin-only routes check `squad.adminUid !== uid` |
| 8 | **NoSelfInvites** | ✅ | `burn-squads.ts:52` (create), `burn-squads.ts:341` (add member) | `if (toUid === adminUid) continue` in creation flow. `if (memberUid === uid) return 400` in POST /:id/members. |
| 9 | **UniqueSquadIds** | ✅ | `burn-squads.ts:31` | `randomUUID()` guarantees uniqueness |
| 10 | **JoinRequestReferencesSquad** | ✅ | `burn-squads.ts:345-350` (add member), implicit in create flow | Squad existence verified before creating join request |
| 11 | **BoundedMembers** | ✅ | Theoretical bound | Naturally holds |

---

## 4. Workout Lifecycle & Group Detection

**Spec:** `specs/tla/workouts/WorkoutLifecycle.tla`
**Route:** `services/api/src/routes/workouts.ts`, `services/api/src/services/group-workout-detection.ts`

| # | Invariant | Status | Code Location | Notes |
|---|-----------|--------|---------------|-------|
| 1 | **TypeOK** | ✅ | TypeScript types (`Workout`, `GroupWorkout`) | Structural correctness enforced by TS compiler |
| 2 | **CompletedWorkoutsHaveEndedAt** | ✅ | `workouts.ts:170-171`, `workouts.ts:205-206` | Both manual end and `autoEndStaleWorkouts` set `endedAt` |
| 3 | **BuddyGroupWorkoutDedup** | ✅ | `group-workout-detection.ts:81` | `hasExistingGroupWorkout('buddy', buddy.id, cutoff)` prevents duplicates within window |
| 4 | **SquadGroupWorkoutDedup** | ✅ | `group-workout-detection.ts:127` | `hasExistingGroupWorkout('squad', squad.id, cutoff)` prevents duplicates within window |
| 5 | **BuddyGroupWorkoutRequiresBothActive** | ✅ | `group-workout-detection.ts:76-77` | Checks partner has active workouts via `findActiveWorkoutsInWindow` |
| 6 | **SquadGroupWorkoutRequiresAllActive** | ✅ | `group-workout-detection.ts:107-125` | Iterates ALL members; `allActive = false` if any member lacks active workout |
| 7 | **UserCanOnlyEndOwnWorkouts** | ✅ | `workouts.ts:160-163` | `if (workout.uid !== uid)` returns 403 |

---

## 5. User Profile Management

**Spec:** `specs/tla/users/UserProfileManagement.tla`
**Route:** `services/api/src/routes/users.ts`, `services/api/src/lib/username.ts`

| # | Invariant | Status | Code Location | Notes |
|---|-----------|--------|---------------|-------|
| 1 | **TypeOK** | ✅ | TypeScript types (`UserProfile`) | Structural correctness enforced by TS compiler |
| 2 | **UsernameUniqueness** | ✅ | `username.ts:38-63` (generation), `users.ts:305-309` (change) | Generation uses `doc.create()` which atomically fails with ALREADY_EXISTS if another process claims the same username. Retries with next suffix on conflict. |
| 3 | **UsernameChangeAtomic** | ✅ | `users.ts:314-319` | Firestore `batch` atomically: sets new reservation, deletes old, updates profile |
| 4 | **ProfileCreationIdempotent** | ✅ | `users.ts:112-115` | Returns 409 if `existing.exists` |
| 5 | **NoProfileWithoutReservation** | ✅ | `users.ts:129-133` | `batch.set()` creates profile AND username reservation atomically |
| 6 | **NoOrphanedReservations** | ✅ | `users.ts:314-319` | Username change deletes old reservation in same batch as creating new one |
| 7 | **BoundedProfiles** | ✅ | Theoretical bound | Naturally holds |
| 8 | **ReservationsMatchProfiles** | ✅ | Atomic batch operations ensure 1:1 mapping | Profile + reservation always created/updated together |

---

## 6. Push Notifications

**Spec:** `specs/tla/notifications/PushNotifications.tla`
**Route:** `services/api/src/routes/workouts.ts`, `services/api/src/services/push-notifications.ts`

| # | Invariant | Status | Code Location | Notes |
|---|-----------|--------|---------------|-------|
| 1 | **TypeOK** | ✅ | TypeScript types | Structural correctness |
| 2 | **ResponseNeverBlocked** | ✅ | `workouts.ts:126-128`, `workouts.ts:135-137` | Both `detectGroupWorkouts` and `sendWorkoutStartedNotifications` run fire-and-forget with `.catch()` — response is sent before these complete |
| 3 | **NoSelfNotification** | ✅ | `push-notifications.ts:31,39` | Burn buddy: `partnerUid` is always the other user. Squad: `if (memberUid !== uid)` filters self |
| 4 | **AllPartnersTargeted** | ✅ | `push-notifications.ts:22-42` | Collects all buddy partners and squad members (excluding self) into `recipientUids` |
| 5 | **OnlyTokenUsersReceive** | ✅ | `push-notifications.ts:54-61` | Only users with `profile.fcmToken` are added to `tokens` array |
| 6 | **NoTokenSkippedCleanly** | ✅ | `push-notifications.ts:57-59` | Users without `fcmToken` are silently skipped (no error thrown) |

---

## 7. Cross-Domain Invariants

**Spec:** `specs/tla/CrossDomainInvariants.tla`
**Route:** All route files

| # | Invariant | Status | Code Location | Notes |
|---|-----------|--------|---------------|-------|
| 1 | **TypeOK** | ✅ | TypeScript types across all modules | Structural correctness |
| 2 | **ProfileRequiredForSocialActions** (CDI-1) | ✅ | `friends.ts`, `burn-buddies.ts`, `burn-squads.ts`, `workouts.ts` | `requireProfile` middleware applied after `requireAuth` on all social action POST routes. Returns 403 if no Firestore profile exists. |
| 3 | **CDI-2: FriendDeletionPreventsNewBuddyRequest** | ✅ | `burn-buddies.ts:32-39` | Friendship check at request time ensures deleted friendships block new buddy requests |
| 4 | **CDI-3/CDI-4: Deleted buddy/squad orphans GroupWorkouts** | ✅ (by design) | Documented in `CrossDomainInvariants.tla` | GroupWorkouts are historical records — orphaning is intentional |
| 5 | **CDI-5: GroupWorkout.referenceId valid at creation** | ✅ | `group-workout-detection.ts:73-94` (buddy), `group-workout-detection.ts:106-141` (squad) | Detection queries the buddy/squad doc; if it doesn't exist, no GroupWorkout is created |
| 6 | **CDI-6: GroupWorkout.memberUids matches referenced entity** | ✅ | `group-workout-detection.ts:88` (buddy: `[uid, partnerUid].sort()`), `group-workout-detection.ts:134` (squad: `squad.memberUids`) | Member UIDs sourced directly from the referenced entity |

---

## Summary of Resolved Gaps

All four gaps identified in the original verification have been fixed.

### <a name="gap-g-1"></a>RESOLVED — Gap G-1 — Duplicate Burn Buddy per Pair

**Invariant:** `AtMostOneBuddyPerPair` (BurnBuddyManagement.tla)
**Original Severity:** Critical
**Resolution:** The accept handler now uses a sorted composite key (`${uid1}_${uid2}`)
as the Firestore doc ID—matching the friendship pattern. If a `BurnBuddy` doc already
exists for the pair (e.g., cross-request scenario), the handler returns 409 Conflict.

---

### <a name="gap-g-2"></a>RESOLVED — Gap G-2 — No Explicit Self-Invite Check in Squad Member Add

**Invariant:** `NoSelfInvites` (BurnSquadManagement.tla)
**Original Severity:** Low
**Resolution:** Added `if (memberUid === uid) return 400` with error message
"Cannot invite yourself" in `POST /burn-squads/:id/members`, before any Firestore
lookups. The invariant no longer relies on a cross-domain assumption.

---

### <a name="gap-g-3"></a>RESOLVED — Gap G-3 — Username Uniqueness Race Condition

**Invariant:** `UsernameUniqueness` (UserProfileManagement.tla)
**Original Severity:** Medium
**Resolution:** `generateUniqueUsername()` now uses `doc.create()` (which atomically
fails with ALREADY_EXISTS if the document exists) instead of the previous
read-then-write pattern. On conflict, the function retries with the next suffix,
guaranteeing username uniqueness even under concurrent profile creation.

---

### <a name="gap-g-4"></a>RESOLVED — Gap G-4 — Profile Not Required for Social Actions

**Invariant:** `ProfileRequiredForSocialActions` / CDI-1 (CrossDomainInvariants.tla)
**Original Severity:** Critical
**Resolution:** A `requireProfile` middleware (`middleware/requireProfile.ts`) was
created and applied after `requireAuth` on all social action POST routes:

| Route | File |
|-------|------|
| `POST /friends/requests` | `friends.ts` |
| `POST /burn-buddies/requests` | `burn-buddies.ts` |
| `POST /burn-squads` | `burn-squads.ts` |
| `POST /workouts` | `workouts.ts` |

The middleware fetches the user's Firestore profile and returns 403 with
`{ error: 'Profile required' }` if it doesn't exist.

---

## Gap Resolution Summary

| ID | Invariant | Original Severity | Status | Resolution |
|----|-----------|-------------------|--------|------------|
| G-1 | AtMostOneBuddyPerPair | Critical | ✅ Resolved | Sorted composite key as doc ID + 409 on duplicate |
| G-2 | NoSelfInvites (explicit check) | Low | ✅ Resolved | Explicit `memberUid === uid` guard |
| G-3 | UsernameUniqueness (race) | Medium | ✅ Resolved | Atomic `doc.create()` with retry |
| G-4 | ProfileRequiredForSocialActions | Critical | ✅ Resolved | `requireProfile` middleware on all social routes |
