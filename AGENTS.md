---
activation: always_on
---

# Strict Implementation & Architecture Rules

## Source of Truth
- You MUST strictly follow `docs/IMPLEMENTATION_PLAN.md` (architecture, DB schema, folder structure, tool definitions) and `docs/DAY_WISE_GUIDE.md` (sub-phase tasks, Do's, and Don'ts).
- Before writing any code, read the relevant section of both files to verify exact file paths, column names, and tool signatures.
- If a user request conflicts with either plan file, stop and ask for confirmation before proceeding.


## Stack Requirements (DO)
- **Framework**: Next.js (App Router, TypeScript)
- **Styling & UI**: Tailwind CSS, shadcn/ui
- **Map & Geo**: react-map-gl with Mapbox, turf.js for geometry
- **AI**: Vercel AI SDK
- **Database & Backend**: Supabase (PostgreSQL, PostGIS, pgvector)
- **State Management**: Zustand for map state
- **Validation**: zod for schemas; validate every tool input with zod
- **Secrets & Keys**: Keep every key except the public Mapbox token in server-only environment variables
- **Tool Output Grounding**: Make the AI model answer strictly and only from tool results
- **Scope Discipline**: Build only what the current sub-phase lists; write extra ideas to `BACKLOG.md`
- **Library Version Awareness**: AI SDK and react-map-gl changed their APIs between major versions. Always read the installed version's docs/package definitions before coding.
- **Workflow & Deployment**: Commit after every sub-phase and deploy to Vercel at the end of every day.
- **One sub-phase per prompt.** Finish it, report, and stop. Never start the next one.
- **Never run destructive or irreversible commands** (rm -rf outside build output, git push, force operations, database resets) without asking me first.
- **Never invent environment variable values.** Leave them empty and tell me what is needed.
- **Time Boxing & Cut List**: If a sub-phase runs past double its estimate, stop and apply the cut list in this order:
  1. Voice output
  2. 3D buildings
  3. Auth
  4. Saved trips
  5. Semantic search (fall back to keyword filters)

## Prohibitions (DON'T)
- **Do not refactor, rename files, restyle, or add features nobody asked for.**
- **Do not add or use**:
  - LangChain
  - Leaflet
  - Google Maps
  - Redux
  - Prisma
  - Any library not explicitly listed in the allowed stack, unless explicitly permitted by a project sub-phase.
- **Do not expose secrets**: Never put secrets in client components, never commit `.env` files (only `.env.example`), never log keys.
- **Allowed without asking**: the toolchain created by create-next-app, and the official packages and required peer dependencies of the tools listed in Stack Requirements (including what `shadcn init` installs). Anything else needs explicit permission from a sub-phase.
- **Do not hallucinate / invent data**: Do not let the model invent places, ratings, opening hours, or any place details not backed by tool results.
- **Do not leave main broken**: Never leave the main branch broken overnight.
- **No Early Polish**: Do not polish anything before Day 6.
- **Do not mix old and new library APIs**: AI SDK and react-map-gl have breaking changes across major versions (AI SDK v5+ uses `stopWhen` with `stepCountIs(n)` and `inputSchema`; v4 uses `maxSteps` and `parameters`; react-map-gl v8 imports from `'react-map-gl/mapbox'`). Stick strictly to the syntax of the installed version.


<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
