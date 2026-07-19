import { documentStageFor, stageOrder, isStatusAllowed, stageLabel } from "@shared/pipeline";
import { resolveRequiredDocs, BASE_VERIFY_DOCS, DEPLOY_DOCS } from "@shared/documents";

describe("pipeline profiles", () => {
  it("compact has four stages, full has six", () => {
    expect(stageOrder("compact")).toEqual(["submitted","interview_scheduled","selected","placed"]);
    expect(stageOrder("full")).toHaveLength(6);
  });

  it("compact asks for NOTHING until selected — an interview is not a narrowing point", () => {
    expect(documentStageFor("submitted", "compact")).toBeNull();
    expect(documentStageFor("interview_scheduled", "compact")).toBeNull();
    expect(documentStageFor("selected", "compact")).toEqual({ stage: "deploy", cumulative: true });
  });

  it("full still asks from the shortlist", () => {
    expect(documentStageFor("shortlisted", "full")).toEqual({ stage: "verify", cumulative: false });
    expect(documentStageFor("selected", "full")).toEqual({ stage: "deploy", cumulative: false });
  });

  it("a selected compact candidate is asked for verification AND deployment docs", () => {
    const r = resolveRequiredDocs({ stage: "deploy", cumulative: true, professionKeys: [], professionReqs: {} });
    for (const d of BASE_VERIFY_DOCS) expect(r.required).toContain(d);
    for (const d of DEPLOY_DOCS) expect(r.required).toContain(d);
  });

  it("full's deploy stage stays lean — verify already happened upstream", () => {
    const r = resolveRequiredDocs({ stage: "deploy", cumulative: false, professionKeys: [], professionReqs: {} });
    expect(r.required.sort()).toEqual([...DEPLOY_DOCS].sort());
  });

  it("compact rejects stages it does not run, but never blocks a rejection", () => {
    expect(isStatusAllowed("shortlisted", "compact")).toBe(false);
    expect(isStatusAllowed("reviewed", "compact")).toBe(false);
    expect(isStatusAllowed("selected", "compact")).toBe(true);
    expect(isStatusAllowed("rejected", "compact")).toBe(true);
    expect(isStatusAllowed("withdrawn", "compact")).toBe(true);
  });

  it("labels are profile-aware and bilingual", () => {
    expect(stageLabel("interview_scheduled", "compact")).toBe("Interview");
    expect(stageLabel("selected", "compact", "hi")).toBe("चयनित");
  });
});
