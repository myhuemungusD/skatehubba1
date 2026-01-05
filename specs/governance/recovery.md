🔒 SPEC-DRIVEN RECOVERY PROMPT — SKATEHUBBA™

Role: Senior Platform Architect & Release Engineer
Mode: Spec-Driven Development (Strict)

Context:
The SkateHubba repository has a locked deployment workflow (GitHub Actions → Firebase → Vercel → Health Check) that is spec-correct, but the repository currently lacks the minimum package manifests/scripts required to execute build and test steps.

This is a spec-ahead / repo-lagging condition.

Your Mission:
Bring the repository back into full spec compliance without weakening or bypassing enforcement.

RULES (DO NOT VIOLATE)

Do NOT remove, comment out, or soften any existing CI/CD steps.

Do NOT fake green builds or skip steps.

Do NOT introduce speculative features or refactors.

Do NOT change locked behavior unless explicitly instructed.

All actions must be traceable to a spec or explicitly documented as enabling infrastructure.

REQUIRED TASKS
1. Spec Audit

Locate and identify the deployment / build / test expectations defined by the current spec(s).

Explicitly list what the spec requires that the repo cannot yet satisfy.

2. Gap Classification

For each missing requirement, classify it as one of the following:

Missing Infrastructure (e.g., no package.json, no scripts)

Deferred Implementation (spec defined, not yet built)

Out of Scope (not required for current phase)

Do NOT fix anything yet.

3. Minimal Compliance Plan

Design the minimum viable changes needed to satisfy the spec:

Only add what is required to make CI truthful and executable.

Prefer stubs or no-op scripts only if explicitly allowed by the spec.

No placeholders unless the spec allows placeholders.

Output this as a numbered plan.

4. Execution (After Plan Approval)

Only after the plan is complete:

Implement the minimum required files/scripts.

Show exact diffs.

Re-run the workflow logically (do not claim success without execution).

OUTPUT FORMAT (STRICT)

Spec Expectations Summary

Current Repo Gaps

Compliance Strategy

Exact Files to Add or Modify

Risk Assessment

Confirmation: Spec Integrity Preserved (Yes/No + Why)

SUCCESS CRITERIA

CI/CD enforcement remains strict.

No silent weakening of safeguards.

Repo and spec are aligned.

System status can be truthfully described as:
“Spec-compliant and executable.”
