# KDS Implementation — Kickoff Prompts

> Copy-paste prompts for kicking off the parallel build defined in `05-implementation-plan.md`.
> Pick the option that matches the level of control you want.

---

## Option A — Run the whole thing (recommended for first attempt)

Paste this in a fresh Claude Code session at the repo root:

```
Read docs/mvp/technical-design/kitchen/05-implementation-plan.md, then execute it end-to-end.

Workflow:
1. Invoke the superpowers:dispatching-parallel-agents and superpowers:using-git-worktrees skills before fanning out.
2. Run Pre-flight (§2) yourself on main: P1–P5. Stop and report if P2 reveals schema gaps.
3. Run Group 1 (Track A then Track B) sequentially in worktrees. Merge each to main with code-review:code-review before continuing.
4. Run Group 2 (Tracks C, D, E, F, G) — dispatch all 5 in parallel via Agent calls with isolation: "worktree" in a single message. Each subagent prompt must include: the plan path, its track letter, exit criteria, "do not touch" file globs, and the skills listed in §5 of the plan.
5. After Group 2 merges, run Group 3 (H then I) in worktrees.
6. Run §6 verification end-to-end. Do NOT claim done until all six checks pass.

Hard rules:
- Tenant isolation: tenantId always from JWT, never URL/body.
- TDD-first for all backend tracks (test matrix before implementation).
- No localStorage for tokens on frontend.
- Use everything-claude-code:code-reviewer on every diff before merging.

Pause and ask me before merging Group 1 to main, and again before launching Group 2.
```

---

## Option B — One group at a time (safer, more control)

Run this, wait for green, then run the next session:

**Session 1 — Pre-flight + Group 1**

```
Read docs/mvp/technical-design/kitchen/05-implementation-plan.md and execute Pre-flight (§2) + Group 1 (Track A, then Track B). Merge each via code review. Stop after Group 1 merges and report status.
```

**Session 2 — Group 2 (parallel fan-out)**

```
Read docs/mvp/technical-design/kitchen/05-implementation-plan.md §3 Group 2.

Dispatch Tracks C, D, E, F, G in parallel via worktrees. Use superpowers:dispatching-parallel-agents and superpowers:using-git-worktrees.

Each subagent prompt must include: the plan file path, the track letter, exit criteria, "do not touch" file globs (Track C must not touch frontend/, Track G must not touch backend/, etc.), and the skills listed in §5.

Hard rules: tenant isolation from JWT only; TDD-first for backend tracks; no localStorage on frontend.

Run code-review:code-review on each diff before merging. Pause before merging each track.
```

**Session 3 — Group 3 + final verification**

```
Read docs/mvp/technical-design/kitchen/05-implementation-plan.md and execute Group 3 (Track H, then Track I) in worktrees. Then run the §6 verification list end-to-end and report pass/fail per check. Do not claim done until all six checks pass.
```

---

## Option C — Single-track dispatch (pilot the harness first)

Best for testing the worktree + subagent harness before committing to the full fleet:

```
Read docs/mvp/technical-design/kitchen/05-implementation-plan.md §3 Track A only.

Create a worktree (xfos-kds-A-schema), invoke everything-claude-code:database-reviewer, deliver everything in Track A's "Deliverables" list, hit the exit criteria, then open a PR. Do not touch any other track.
```

Repeat the pattern for any single track by swapping the track letter, worktree name, and owner subagent from §3 of the plan.

---

## What makes these prompts work

- **Plan path is explicit** — the agent reads the source of truth, not your prompt summary.
- **Skills are named** — forces the right rigor (TDD, security review, parallel dispatch).
- **Hard rules pinned at the top** — tenant isolation, TDD, code review.
- **Pause points** — Option A has explicit "ask before merging" gates; otherwise the agent will steamroll through. For an unfamiliar codebase, keep those gates.

---

## Recommended path

1. **Start with Option C on Track A** to verify worktrees and your harness work end-to-end on a low-risk track (DB schema + seed).
2. Graduate to **Option B** once you trust the pattern — group-by-group with code review between groups.
3. **Skip straight to Option A** only after you've successfully used `dispatching-parallel-agents` in this repo before.

---

## After kickoff — checks to run while agents work

- `git worktree list` — confirm 5 worktrees exist during Group 2.
- `git log --all --oneline -20` — confirm parallel commits landing on track branches.
- `gh pr list` — track-PRs should appear; review per `code-review:code-review`.
- If a worktree stalls > 30 min, check its agent's last output and intervene with `superpowers:executing-plans` guidance or kill+restart that single track.

---

## When to stop and ask before continuing

- Group 1 merge: schema is the contract that blocks everything else — review carefully.
- Group 2 merges: tenant-isolation tests must be green; if any track skipped them, do not merge.
- Verification step 5 (real-tablet PWA soak): non-skippable. Khmer rendering on Android only fails on real hardware.
