---
name: resume-skill-arena
description: Launch a local resume comparison workbench that imports a real resume and job description, runs up to three installed resume Skills against one frozen baseline, locates each source sentence, and lets the user adopt, edit, or keep the original. Use when the user wants to compare resume rewrites, tailor a resume to a job, import additional resume Skills, or inspect traceable differences between Skills.
license: MIT
metadata:
  author: Yang-lab1
  version: 0.1.0
---

# Resume Skill Arena

Launch the repository's existing local workbench. Do not replace it with a chat-only simulation and do not generate demo resume data.

When the user invokes or names `resume-skill-arena`, treat “launch the workbench” as part of the request: start the local API/UI, verify the health endpoint, and open the local browser page automatically. Do not wait for the user to separately ask for the website URL. If the host cannot open a browser or start local processes, report the exact missing capability and stop.

This repository is an Agent Skill package, not a hosted website. A host must support Agent Skills, local process execution, and browser control for the zero-touch flow. Tools that can only read Markdown prompts (or do not permit local processes/browser control) cannot provide automatic launch; they may still guide the user through manual startup.

Requires Node.js 20+, a local browser that can be opened by the host, Shell/local child-process capability, and an authenticated Codex environment with available usage for real Provider runs. If any of these capabilities are unavailable, stop with an actionable error; do not fall back to a chat-only or text-only workflow.

## Start the workbench

1. Treat the directory containing this file as the project root.
2. Run `npm run check:runtime`. This must confirm Node.js, local child processes, Shell, and a local Chrome/Edge-compatible browser. If it fails, stop and explain the missing capability.
3. Install missing dependencies with `npm install` and `npm --prefix ui install`.
4. Start the app with `npm run dev:local`.
5. Verify `http://127.0.0.1:4317/api/health` returns an object with `ok: true` and `demoData: false`.
6. Open `http://127.0.0.1:4173` in the user's browser. A browser is required for this Skill; do not replace the workbench with a text-only result. Return the URL only as a useful fallback after opening it.

If installation, GitHub Skill import, OCR resources, or Provider execution needs network or local process access, consolidate the required permissions into one clear confirmation before running. Do not ask repeatedly for permissions already granted by the host.

## Product rules

- Use only the resume and job description supplied in the current run.
- Allow DOCX, PDF, PNG, or JPG for resumes.
- Allow typed or pasted text, TXT, Markdown, PDF, PNG, JPG, multiple files, drag-and-drop, and clipboard images for the job description.
- Keep the selection at a hard maximum of three Skills. A fourth Skill must remain unselectable.
- Every Skill must process the same frozen baseline independently.
- Never show a rewrite unless it passed the ChangeSet schema, source, fact, and baseline gates.
- Keep the original file visible and locate the sentence currently being compared. If exact location fails, say so explicitly.
- Offer adopt, manual edit, and keep-original decisions for every candidate block.
- Preserve Provider identity, invocation records, source references, and user decisions.
- Keep user materials local by default. Network is allowed only for user-requested GitHub Skill import or real Provider execution; OCR language data is bundled locally.

## Failure handling

- Do not invent replacement text when parsing, OCR, Provider execution, source matching, or schema validation fails.
- Show the actual failure in the workbench and keep the run incomplete.
- A local-only test result is not a real Provider pass.
- Do not publish or claim delivery readiness unless the full feature matrix reports two complete passing rounds.
