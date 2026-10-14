import test from "node:test";
import assert from "node:assert/strict";
import { buildMock, demoSources, textSource, sha } from "../lib/lecture/fixtures";
import { validateContent, checkExport, type NoteExport, clone } from "../lib/lecture/schema";
import { markdown, filename } from "../lib/lecture/export";
import { validateSources } from "../lib/lecture/extraction";

for (const fixture of ["calculus", "management", "conflict"]) {
  for (const mode of ["faithful", "enhanced"] as const) {
    test(`${fixture} / ${mode}: schema and source references`, async () => {
      const sources = await demoSources(fixture);
      const result = validateContent(buildMock(sources, mode), sources, mode);
      if (mode === "faithful") { assert.equal(result.enhancements.length, 0); assert.equal(result.reviewQuestions.length, 0); }
      else assert.ok(result.enhancements.length > 0);
      if (fixture === "conflict") assert.equal(result.unresolvedItems[0].reason, "source_conflict");
      if (fixture === "management") assert.ok(!result.summary.text.includes("导数"));
    });
  }
}
test("single screenshot can support both calculus source parts", async () => {
  const sources = await demoSources("calculus"); const combined = await textSource(sources.map(s => s.segments[0].text).join("\n"), "one screenshot");
  const c = validateContent(buildMock([combined], "enhanced"), [combined], "enhanced");
  assert.equal(c.knowledgeBlocks.length, 3); assert.equal(c.summary.sourceRefs.length, 1); assert.equal(c.unresolvedItems[0].sourceRefs[0].sourceId, combined.id);
});
test("unknown material never receives unrelated fixed fixture", async () => {
  const s = await textSource("星球围绕恒星运行，这是一次天文学课堂记录。", "astronomy"); const c = validateContent(buildMock([s], "enhanced"), [s], "enhanced");
  assert.ok(c.summary.text.includes("天文学")); assert.ok(!c.summary.text.includes("导数")); assert.equal(c.enhancements.length, 0);
});
test("invalid source reference is rejected", async () => { const s = await demoSources("calculus"); const c = buildMock(s, "faithful"); c.summary.sourceRefs[0].segmentId = "missing"; assert.throws(() => validateContent(c, s, "faithful")); });
test("wrong source ownership is rejected", async () => { const s = await demoSources("calculus"); const c = buildMock(s, "faithful"); c.summary.sourceRefs = [{ sourceId: s[0].id, segmentId: s[1].segments[0].id }]; assert.throws(() => validateContent(c, s, "faithful")); });
test("faithful mode rejects enhancements instead of hiding them", async () => { const s = await demoSources("calculus"); assert.throws(() => validateContent(buildMock(s, "enhanced"), s, "faithful")); });
test("duplicate content IDs are rejected", async () => { const s = await demoSources("calculus"); const c = buildMock(s, "faithful"); c.keyPoints[0].id = c.summary.id; assert.throws(() => validateContent(c, s, "faithful")); });
test("low-quality source cannot retain high confidence", async () => { const s = await demoSources("calculus"); s[0].segments[0].qualityFlags.push("vision_unverified"); const c = validateContent(buildMock(s, "faithful"), s, "faithful"); assert.equal(c.summary.confidence, "medium"); });
test("missing sources and size/page limits are enforced", async () => {
  assert.throws(() => validateSources([])); const s = await demoSources("calculus");
  assert.throws(() => validateSources([{ ...s[0], ready: false }]));
  assert.throws(() => validateSources(Array.from({ length: 11 }, () => s[0])));
  assert.throws(() => validateSources([{ ...s[0], sizeBytes: 51 * 1024 * 1024 }]));
  assert.throws(() => validateSources([{ ...s[0], kind: "pdf", segments: [{ ...s[0].segments[0], page: 51 }] }]));
});
test("Unicode offsets count code points", async () => { const s = await textSource("中文😀文字", "unicode"); assert.deepEqual(s.segments[0].locator, { kind: "text", start: 0, end: 5 }); assert.equal(s.hash, await sha("中文😀文字")); });
test("canonical export preserves mock/enhancement/uncertainty labels", async () => {
  const sources = await demoSources("calculus"); const v: NoteExport = { schemaVersion: "1.0", noteId: "n", versionId: "v", revision: 1, title: "导数/连续性", course: "高数", tags: [], mode: "enhanced", content: buildMock(sources, "enhanced"), sources, generation: { provider: "mock", model: null, promptVersion: "test", generatedAt: "2026-10-14T00:00:00Z", editedAt: null } };
  checkExport(JSON.parse(JSON.stringify(v))); const md = markdown(v, { sources: false, questions: false });
  assert.ok(md.includes("演示模式")); assert.ok(md.includes("AI 增强")); assert.ok(md.includes("未核验")); assert.ok(md.includes("缺少题干")); assert.ok(!md.includes("## 来源清单")); assert.ok(!filename(v, "md").includes("/"));
  const unknown = clone(v) as unknown as { schemaVersion: string }; unknown.schemaVersion = "9.0"; assert.throws(() => checkExport(unknown));
});
