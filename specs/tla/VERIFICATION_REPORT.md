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
| 3 | **AtMostOneBuddyPerPair** | ⚠️ | `burn-buddies.ts:119-130` | Uses `randomUUID()` as doc ID (not a sorted composite key). If A→B and B→A requests are both pending then both accepted, two `BurnBuddy` docs are created for the same pair. See [Gap G-1](#gap-g-1) |
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
| 8 | **NoSelfInvites** | ⚠️ | `burn-squads.ts:52` (create only) | `if (toUid === adminUid) continue` in creation flow. **POST /:id/members** has no explicit self-invite check—relies on friendship-with-self being impossible. See [Gap G-2](#gap-g-2) |
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
| 2 | **UsernameUniqueness** | ⚠️ | `username.ts:38-63` (generation), `users.ts:305-309` (change) | Generation uses sequential read-then-write without a transaction; two concurrent profile creations could claim the same username. See [Gap G-3](#gap-g-3) |
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
| 2 | **ProfileRequiredForSocialActions** (CDI-1) | ❌ | Not checked in `friends.ts:14-55`, `burn-buddies.ts:16-67`, `burn-squads.ts:17-74`, `workouts.ts:104-140` | **None** of the social action routes verify that the acting user (or target user) has a profile in Firestore before proceeding. See [Gap G-4](#gap-g-4) |
| 3 | **CDI-2: FriendDeletionPreventsNewBuddyRequest** | ✅ | `burn-buddies.ts:32-39` | Friendship check at request time ensures deleted friendships block new buddy requests |
| 4 | **CDI-3/CDI-4: Deleted buddy/squad orphans GroupWorkouts** | ✅ (by design) | Documented in `CrossDomainInvariants.tla` | GroupWorkouts are historical records — orphaning is intentional |
| 5 | **CDI-5: GroupWorkout.referenceId valid at creation** | ✅ | `group-workout-detection.ts:73-94` (buddy), `group-workout-detection.ts:106-141` (squad) | Detection queries the buddy/squad doc; if it doesn't exist, no GroupWorkout is created |
| 6 | **CDI-6: GroupWorkout.memberUids matches referenced entity** | ✅ | `group-workout-detection.ts:88` (buddy: `[uid, partnerUid].sort()`), `group-workout-detection.ts:134` (squad: `squad.memberUids`) | Member UIDs sourced directly from the referenced entity |

---

## Summary of Gaps

### <a name="gap-g-1"></a>Gap G-1 — Duplicate Burn Buddy per Pair (Critical)

**Invariant:** `AtMostOneBuddyPerPair` (BurnBuddyManagement.tla)
**Severity:** Critical
**Description:** The burn buddy accept handler (`burn-buddies.ts:92-134`) creates a
`BurnBuddy` doc with a `randomUUID()` as the doc ID. Unlike friendships (which use a
sorted composite key), there is no uniqueness constraint on the user pair. If user A
sends a buddy request to B, and B simultaneously sends one to A, both can be accepted
independently—creating **two** `BurnBuddy` documents for the same pair.

**Fix:** Before creating the `BurnBuddy` doc, check whether one already exists for the
sorted pair. Alternatively, use a sorted composite key (e.g., `${uid1}_${uid2}`) as the
Firestore doc ID, matching the friendship pattern.

---

### <a name="gap-g-2"></a>Gap G-2 — No Explicit Self-Invite Check in Squad Member Add (Low)

**Invariant:** `NoSelfInvites` (BurnSquadManagement.tla)
**Severity:** Low
**Description:** `POST /burn-squads/:id/members` (`burn-squads.ts:330-386`) does not
explicitly check `memberUid === uid`. The invariant is **indirectly** maintained because
a user cannot be friends with themselves (friend request to self is blocked), so the
friendship check will fail. However, this relies on a cross-domain assumption rather
than a direct guard.

**Fix:** Add `if (memberUid === uid) return 400` before the friendship check.

---

### <a name="gap-g-3"></a>Gap G-3 — Username Uniqueness Race Condition (Medium)

**Invariant:** `UsernameUniqueness` (UserProfileManagement.tla)
**Severity:** Medium
**Description:** `generateUniqueUsername()` (`username.ts:38-63`) reads the `usernames`
collection to find an available username, then writes the reservation in a separate
`batch.commit()`. Two concurrent profile creations for users with the same email prefix
could both read the same username as available, then both write—one overwriting the
other's reservation.

**Fix:** Wrap the read-check-write in a Firestore transaction, or use
`doc.create()` (which fails if the doc already exists) instead of `doc.set()` for the
username reservation.

---

### <a name="gap-g-4"></a>Gap G-4 — Profile Not Required for Social Actions (Critical)

**Invariant:** `ProfileRequiredForSocialActions` / CDI-1 (CrossDomainInvariants.tla)
**Severity:** Critical
**Description:** None of the social action endpoints verify that the authenticated user
has a Firestore profile before proceeding:

| Route | File | Line |
|-------|------|------|
| `POST /friends/requests` | `friends.ts` | 14 |
| `POST /burn-buddies/requests` | `burn-buddies.ts` | 16 |
| `POST /burn-squads` | `burn-squads.ts` | 17 |
| `POST /workouts` | `workouts.ts` | 104 |

A user who has a valid Firebase Auth token but has not yet created their Firestore
profile can send friend requests, create squads, start workouts, etc. This violates
CDI-1 which requires a profile before any social action.

**Fix:** Add a `requireProfile` middleware (or enhance `requireAuth`) that fetches the
user's Firestore profile and returns 403/404 if it doesn't exist.

---

## Gap Severity Summary

| ID | Invariant | Severity | Domain |
|----|-----------|----------|--------|
| G-1 | AtMostOneBuddyPerPair | **Critical** | Burn Buddies |
| G-2 | NoSelfInvites (explicit check) | **Low** | Burn Squads |
| G-3 | UsernameUniqueness (race) | **Medium** | Users |
| G-4 | ProfileRequiredForSocialActions | **Critical** | Cross-Domain |
