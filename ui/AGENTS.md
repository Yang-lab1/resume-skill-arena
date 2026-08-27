# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Locked product direction

- The entrance cover uses `public/assets/resume-studio-cover-clean.png` as the visual truth.
- The cover remains an immersive poster without SaaS navigation, cards, or feature inventory.
- Clicking anywhere on the cover enters the workbench.
- The workbench stays related through cream paper, black photocopy texture, torn-paper framing, and red/yellow/cobalt accents, while remaining practical and readable.
- The local-first flow is: import resume and job description, choose 3 Skills by default with a hard maximum of 3, compare named Skill outputs, adopt/edit by section, and compose a traceable final draft.
- Resume input supports DOCX, PDF, PNG, and JPG. Job input supports typed or pasted text, TXT, Markdown, PDF, PNG, JPG, multiple files, drag-and-drop, and clipboard images.
- No resume baseline, candidate rewrite, rationale, score, provider status, or final result may be hard-coded as demo business data. Every visible comparison result must originate from the current uploaded files and a recorded real Provider invocation; otherwise render an explicit empty or failed state.
