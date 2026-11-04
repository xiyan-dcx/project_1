# LLM_NetworkDiag Project Instructions

## Scope
- This file defines project-level working instructions for Codex and other compatible coding agents in this repository.
- When working in this repo, read this file together with `docs/notes/plan.md` and `README.md`.

## Project Workflow Rules
- After each milestone is completed, update the implementation record in `docs/notes/plan.md`.
- When you add a new commonly used command or a new standard execution path, also add it to `README.md`.
- Prefer small, verifiable changes that fit the current project stage instead of broad refactors.

## Long-Running Tasks
- If a task is likely to take a long time, consume substantial API tokens, or generate many outputs, do not run it directly in the Codex session by default.
- In such cases, explain the purpose of the task and provide the exact command for the user to run manually.
- Only run such tasks directly if the user explicitly asks the agent to execute them in-session.

## Progress Visibility For Long Tasks
- Commands prepared for long-running tasks should expose real-time progress whenever possible.
- Prefer scripts and command forms that print per-file, per-stage, or per-case progress directly in the terminal.
- If a script does not already emit useful progress logs, propose a command pattern that adds visible progress or live monitoring so the user can track execution.
- Existing behavior like `run_llm_summary.py` printing per-file progress is the expected standard to follow.

## Documentation Discipline
- Commands shared with the user should be directly executable from the repository root unless otherwise stated.
- When reporting completed work, mention the relevant output paths so results are easy to inspect.
- If a workflow changes, keep `README.md` and `docs/notes/plan.md` aligned with the new behavior.
