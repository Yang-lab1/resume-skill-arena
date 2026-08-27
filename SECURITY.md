# Security and privacy

## Supported version

Security fixes currently target the latest commit on the default branch.

## Report a vulnerability

Please open a GitHub security advisory instead of posting sensitive details in a public issue.

## Local data boundary

Resume files, job descriptions, extracted text, Provider outputs and decisions are stored in local runtime directories that are excluded from Git. Do not commit files from `.resume-studio/`, `output/`, `runs/` or `agent_memory/`.

GitHub Skill import and real Provider execution are the only normal flows that require network access. Imported third-party Skills should be reviewed before execution.
