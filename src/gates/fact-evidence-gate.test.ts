import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { runFactEvidenceGate } from "./fact-evidence-gate.js";

function validChangeSet(): Record<string, unknown> {
  return JSON.parse(
    readFileSync(
      new URL("../../examples/valid-changeset.json", import.meta.url),
      "utf8"
    )
  ) as Record<string, unknown>;
}

describe("runFactEvidenceGate", () => {
  it("accepts a change grounded in resume evidence", () => {
    expect(runFactEvidenceGate(validChangeSet())).toEqual([]);
  });

  it("blocks evidence that only cites the job description", () => {
    const input = validChangeSet() as {
      changes: Array<{ resumeEvidence: Array<{ sourceType: string }> }>;
    };
    input.changes[0]!.resumeEvidence[0]!.sourceType = "JOB_DESCRIPTION";

    expect(runFactEvidenceGate(input)).toEqual([
      expect.objectContaining({
        code: "FACT_EVIDENCE_MISSING",
        path: "/changes/0/resumeEvidence"
      })
    ]);
  });

  it("requires explicit approval semantics for a fact change", () => {
    const input = validChangeSet() as {
      changes: Array<{
        factImpacts: Array<{
          fieldId: string;
          impactType: string;
          approvalRequired: boolean;
        }>;
        risk: { level: string };
        adoptionPolicy: string;
      }>;
    };
    input.changes[0]!.factImpacts = [
      {
        fieldId: "fact.metric.new",
        impactType: "ADD",
        approvalRequired: false
      }
    ];

    const issues = runFactEvidenceGate(input);

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "FACT_APPROVAL_REQUIRED",
        "FACT_RISK_UNDERSPECIFIED"
      ])
    );
  });
});
