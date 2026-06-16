# BrainMash

Turn any sound into music — record or import a sound, choose a transformation preset, and generate glitchy, ambient, rhythmic, or experimental audio in seconds.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Mobile: Expo (React Native) — `artifacts/brainmash/`
- API: Express 5 — `artifacts/api-server/`
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/brainmash/` — Expo mobile app
- `artifacts/brainmash/app/(tabs)/` — Studio, Discover, Profile tab screens
- `artifacts/brainmash/app/studio/` — Record → Transform → Result flow (full-screen modals)
- `artifacts/brainmash/context/StudioContext.tsx` — Global audio creation state + local persistence
- `artifacts/brainmash/constants/colors.ts` — Dark theme design tokens (electric violet + neon cyan)
- `artifacts/brainmash/components/` — WaveformVisualizer, PresetCard, CreationCard
- `artifacts/api-server/src/routes/` — API route handlers
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contracts)

## Architecture decisions

- Frontend-first: V1 uses AsyncStorage for local persistence; no backend required for core creation flow
- Simulated audio transformation: The actual SampleBrain DSP engine (C++) cannot run in Expo Go — the transformation is simulated with a 3.5s async delay; results are real playback UI
- Context-driven state: `StudioContext` holds the full creation session (recording → preset → generate → export) across the modal stack
- Dark-only palette: Music production apps are universally dark; single-theme simplifies the token system

## Product

- **Studio tab**: Record mic or import audio file → Choose transformation preset → Generate → Playback + export
- **7 presets**: Glitch, Ambient, Beat Machine, Jungle, Vaporwave, Drone, Horror
- **Controls**: Intensity, Randomness, Output Length sliders
- **Result screen**: Waveform player, Original/Generated compare mode, WAV/MP3 export, video export (Premium)
- **Discover tab**: Community feed (Trending/Recent/Following) with like + play
- **Profile tab**: Personal creations grid, stats, Premium upgrade CTA

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `expo-document-picker` version must match the expo SDK — check `pnpm --filter @workspace/brainmash run typecheck` after package updates
- Audio recording/playback is simulated in Expo Go; real `expo-av` integration requires a native build
- Run `pnpm install --filter @workspace/brainmash` after changing package.json

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
