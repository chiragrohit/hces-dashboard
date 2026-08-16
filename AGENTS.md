# AGENTS.md

## Core rule — Docs first, code second

For **Svelte/SvelteKit**, **Modal**, and **Vercel** work, check the authoritative docs before writing any code, and re-check after writing before calling it done. These stacks change fast; stale-version code and syntax errors are the failure modes this rule exists to prevent.

The loop for every change in these areas:

1. **Before writing** — pull the relevant docs (MCP, CLI, or skill below) and confirm the current APIs, config shape, and syntax for the exact thing you are about to write.
2. **Write the code.**
3. **After writing** — run the stack's own verifiers (autofixer, type/lint check, CLI dry-run) and re-read the docs section if anything is unfamiliar.

Do not skip step 1 or 3 for "simple" changes — that is exactly where stale-version slip happens.

## Svelte / SvelteKit

Use for anything under `web_sveltekit/`: `.svelte` components, `+page`/`+layout`/`+server` routes, kit config, adapters.

- **Docs**: Svelte MCP — call `svelte_list-sections` to find relevant sections, then `svelte_get-documentation` for each one (runes, load, routing, adapters, page options, env vars — whatever the task touches).
- **After writing**: run `svelte_svelte-autofixer` on every component before delivering.
- **Verify**: `pnpm check` (svelte-check + types) and `pnpm lint` (prettier + eslint) inside `web_sveltekit/`.
- Local skills for deeper guidance: `svelte-code-writer`, `svelte-core-bestpractices`.

## Modal

Use for anything under `deploy/` (`modal_app.py`, `upload_data.py`) or Modal CLI/SDK usage.

- **Docs**: read the `modal` skill (`C:\Users\chira\.pi\agent\skills\modal\SKILL.md`) before and after writing or updating Modal code. Confirm SDK versions and API shape from the skill — do not write Modal code from memory.
- **Verify**: `modal deploy` in the `crtimepass` workspace after changes.

## Vercel

Use for anything touching deployment: `vercel.json`, adapter config, project settings, environment variables, deployments.

- **Docs**: `vercel` CLI (`vercel --help`, `vercel project ls`, `vercel env ls`...) or the official docs text at `https://vercel.com/docs/llms.txt`. Check before changing any deployment-related code or settings.
- **Verify after**: confirm the change through the CLI or the resulting deployment before declaring done.

## Note on the current migration

Active branch: `sveltekit-migration`. The SvelteKit app lives in `web_sveltekit/` (adapter-vercel configured in `vite.config.ts` under the new-style `sveltekit({ adapter })`). Production still deploys from `main` → `web_dashboard/` (the old static site); it stays untouched until the migration is swapped in.