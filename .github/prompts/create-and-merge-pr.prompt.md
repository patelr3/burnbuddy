# Create and Merge PR

Create a pull request for the current branch's changes and merge it to `main`.

> **Note:** This prompt is also used by the Ralph loop's final iteration (see `.github/skills/ralph-loop/scripts/CLAUDE.md`). Keep the two in sync when making changes.

## Steps

1. **Check prerequisites**
   - Confirm we are NOT on the `main` branch. If on `main`, create a new branch from the current HEAD with a descriptive name based on the changes (e.g., `feat/short-description`, `fix/short-description`, `chore/short-description`).
   - Ensure there are committed changes that differ from `origin/main`. If there are uncommitted changes, stage and commit them with a conventional-commit message.
   - Push the branch to `origin`.

2. **Create the pull request**
   - Use `gh pr create` with:
     - `--base main`
     - A clear, conventional-commit-style **title** summarizing all changes.
     - A **body** that includes:
       - A one-line summary of what this PR does.
       - A bullet list of key changes.
       - Any relevant issue/ticket references.
     - `--fill` can be used as a starting point, but always review and improve the title and body.

3. **Wait for CI checks** (if applicable)
   - Run `gh pr checks` to see if any required checks are running.
   - If checks exist, wait for them to pass before merging.
   - If checks fail, investigate and report the failure — do NOT force-merge.

4. **Merge the pull request**
   - Use `gh pr merge` with:
     - `--squash` to keep the commit history clean.
     - `--delete-branch` to clean up the remote branch after merge.
     - `--auto` if checks are still running (enables auto-merge when checks pass).

5. **Post-merge cleanup**
   - Switch back to `main` and pull the latest changes: `git checkout main && git pull`.
   - Confirm the merge landed with `gh pr view --json state`.

## Notes

- Prefer **squash merge** to keep `main` history linear.
- Never force-push to `main` or merge with failing required checks.
- If the PR has conflicts with `main`, rebase the branch first: `git rebase origin/main`.
