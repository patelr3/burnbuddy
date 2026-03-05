# Plan: Multi-feature Ralph Support

## Problem

Ralph currently supports only one PRD running at a time per branch. Multiple parallel Ralph loops on the same branch conflict because they share `prd.json` and `progress.txt`. Additionally, the "push + create PR + merge" step is embedded as the final user story in every PRD, which is inflexible.

## Approach

Parameterize Ralph by **feature name**. Each feature gets its own PRD file (`prd-<feature>.json`) and progress file (`progress-<feature>.txt`). Remove the `branchName` field from PRDs — Ralph works on whatever branch is checked out. Move the push/PR/merge workflow to a reusable prompt in `.github/prompts/`.

## Files to Change

| File | Change |
|---|---|
| `scripts/ralph/ralph.sh` | Add `--feature <name>` required arg; derive PRD/progress filenames from it; remove branch-tracking/archiving logic; pass feature name into the CLAUDE.md prompt |
| `scripts/ralph/CLAUDE.md` | Parameterize — reference `prd-FEATURE.json` and `progress-FEATURE.txt` via a placeholder that ralph.sh substitutes; remove branch checkout instruction |
| `.github/skills/ralph/SKILL.md` | Update output format: remove `branchName`, output filename becomes `prd-<feature>.json`; update archiving section; remove US-009-style final story |
| `.github/prompts/push-and-merge.prompt.md` | **New file** — reusable prompt for pushing current branch, creating PR, merging, and archiving completed PRDs |
| `CLAUDE.md` | Add note about feature-scoped PRD files so agents know the convention |

## Todos

1. **update-ralph-sh** — Rewrite `ralph.sh` to accept `--feature <name>`, derive `prd-<feature>.json` / `progress-<feature>.txt`, remove branch-tracking (`.last-branch`), remove archiving logic (features are self-contained now), substitute feature name into CLAUDE.md prompt before passing to tool
2. **update-claude-md** — Update `scripts/ralph/CLAUDE.md`: replace hardcoded `prd.json`/`progress.txt` references with `prd-__FEATURE__.json`/`progress-__FEATURE__.txt` placeholders; remove "check you're on the correct branch" instruction; remove branch checkout step; keep everything else
3. **update-skill-md** — Update `.github/skills/ralph/SKILL.md`: remove `branchName` from JSON format; change output filename to `prd-<feature>.json`; update archiving section to note per-feature files; add guidance to NOT include push/PR/merge as a user story (point to the prompt instead)
4. **create-push-prompt** — Create `.github/prompts/push-and-merge.prompt.md` with instructions for: pushing the current branch, creating a PR against main, waiting for CI, merging, and then **archiving all completed PRDs** (any `prd-*.json` where all stories have `passes: true` gets moved to `scripts/ralph/archive/YYYY-MM-DD-<feature>/` along with its `progress-<feature>.txt`)
5. **update-root-claude-md** — Add a brief note to `CLAUDE.md` about the multi-feature Ralph convention (feature-suffixed PRD files)
6. **cleanup** — Remove `.last-branch` file; rename existing `prd.json` → `prd-profiles-streaks-stats.json` and `progress.txt` → `progress-profiles-streaks-stats.json` (or delete since it's a completed run — archive it)

## Notes

- The `run-ralph-hourly.sh` will need to be updated separately if the user wants to run multiple features in parallel from cron — not in scope unless requested
- Existing archive directory is untouched — it's historical
- The placeholder substitution approach (`__FEATURE__`) keeps CLAUDE.md readable while allowing ralph.sh to inject the feature name at runtime
