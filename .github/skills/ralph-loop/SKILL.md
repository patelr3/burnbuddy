---
name: ralph-loop
description: "Run the Ralph autonomous coding loop. Iterates through PRD user stories, spawning a fresh AI session per iteration to implement, test, and commit each story. Triggers on: run ralph loop, start ralph, execute prd, ralph iterate."
user-invokable: true
---

# Ralph Loop

Runs the Ralph execution loop (`ralph.sh`) that iterates through PRD user stories, spawning a fresh AI coding session per iteration.

---

## The Job

Execute the `ralph.sh` script from this skill's `scripts/` directory. The script reads a PRD JSON file and iterates through its user stories, invoking an AI tool (Copilot, Claude, or AMP) once per story.

---

## Usage

```bash
.github/skills/ralph-loop/scripts/ralph.sh --prd <path-to-prd.json> [--tool copilot|claude|amp] [--port-offset N] [max_iterations]
```

### Parameters

| Parameter | Required | Default | Description |
|---|---|---|---|
| `--prd <file>` | Yes | — | Path to the PRD JSON file (e.g., `docs/prds/inprogress/prd-2026-03-15-task-status.json`) |
| `--tool <name>` | No | `copilot` | AI backend: `copilot`, `claude`, or `amp` |
| `--port-offset N` | No | — | Port offset for parallel isolation (API=3001+N, Web=3000+N) |
| `max_iterations` | No | `10` | Maximum loop iterations before aborting |

### Example

```bash
# Run with Copilot (default), 12 iterations max
.github/skills/ralph-loop/scripts/ralph.sh \
  --prd docs/prds/inprogress/prd-2026-03-15-task-status.json \
  --port-offset 10 \
  12
```

---

## What the Loop Does

Each iteration spawns a fresh AI session that:

1. Reads the PRD JSON file
2. Reads the progress log for context from prior iterations
3. Picks the highest-priority story where `passes: false`
4. Implements that one story
5. Runs quality checks (typecheck, lint, tests)
6. Commits with message: `feat: [US-XXX] - Story Title`
7. Marks the story as `passes: true` in the PRD JSON
8. Appends learnings to the progress file
9. Checks if all stories pass — if so, archives PRD to `complete/`, creates PR, enables auto-merge, and outputs `<promise>PRD-COMPLETE</promise>`

---

## File Expectations

The script expects:
- **PRD JSON**: The file passed via `--prd` (e.g., `docs/prds/inprogress/prd-2026-03-15-task-status.json`)
- **Progress file**: Derived from the PRD filename — `prd-` prefix replaced with `progress-`, `.json` replaced with `.txt` (e.g., `docs/prds/inprogress/progress-2026-03-15-task-status.txt`)
- **CLAUDE.md prompt**: Located at `.github/skills/ralph-loop/scripts/CLAUDE.md` (same directory as `ralph.sh`)

---

## Completion

The loop exits successfully (exit 0) when:
- All stories have `passes: true`
- The PRD has been archived to `docs/prds/complete/<feature>/`
- A PR has been created with auto-merge enabled
- The output contains `<promise>PRD-COMPLETE</promise>`

The loop exits with failure (exit 1) when:
- `max_iterations` is reached without all stories passing

---

## Port Isolation

When `--port-offset N` is provided, the script exports environment variables so parallel agents don't collide:

| Variable | Value |
|---|---|
| `PORT` | `3001 + N` |
| `WEB_PORT` | `3000 + N` |
| `NEXT_PUBLIC_API_URL` | `http://localhost:<PORT>` |

---

## Files in This Skill

| File | Purpose |
|---|---|
| `scripts/ralph.sh` | The core execution loop |
| `scripts/CLAUDE.md` | Prompt template injected into each AI iteration |
