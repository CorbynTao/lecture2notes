import { z } from "zod";

export const refSchema = z.object({ sourceId: z.string(), segmentId: z.string() });
const evidence = {
  provenance: z.enum(["source", "enhancement", "user"]),
  sourceRefs: z.array(refSchema).max(100),
  confidence: z.enum(["high", "medium", "low", "unassessed"]),
  confidenceReason: z.string().max(1000),
  editedByUser: z.boolean(),
  needsSourceReview: z.boolean(),
};
const itemSchema = z.object({ id: z.string(), text: z.string().max(1200), ...evidence });
export const contentSchema = z.object({
  summary: itemSchema,
  keyPoints: z.array(itemSchema).max(40),
  knowledgeBlocks: z.array(z.object({
    id: z.string(), title: z.string().max(120),
    kind: z.enum(["concept", "method", "formula", "example", "conclusion"]),
    bodyMarkdown: z.string().max(8000), ...evidence,
  })).max(40),
  enhancements: z.array(z.object({
    id: z.string(), title: z.string().max(120),
    kind: z.enum(["explanation", "analogy", "pitfall", "example"]),
    bodyMarkdown: z.string().max(8000), ...evidence,
  })).max(20),
  reviewQuestions: z.array(z.object({
    id: z.string(), question: z.string().max(1200), answer: z.string().max(3000), ...evidence,
  })).max(20),
  unresolvedItems: z.array(z.object({
    id: z.string(), description: z.string().max(1200),
    reason: z.enum(["missing_context", "recognition_uncertain", "source_conflict", "unsupported_claim"]),
    sourceRefs: z.array(refSchema), suggestedAction: z.string().max(1200),
    status: z.enum(["open", "resolved"]),
  })).max(40),
});
export const sourceSchema = z.object({
  id: z.string(), kind: z.enum(["image", "pdf", "text"]), name: z.string(), hash: z.string(),
  order: z.number().int(), parseVersion: z.string(),
  segments: z.array(z.object({
    id: z.string(), page: z.number().int().positive().nullable(), text: z.string(),
    locator: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("page"), page: z.number().int().positive() }),
      z.object({ kind: z.literal("text"), start: z.number().int().nonnegative(), end: z.number().int().nonnegative() }),
      z.object({ kind: z.literal("bbox"), page: z.number(), x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: z.number().min(0).max(1), h: z.number().min(0).max(1) }),
    ]), qualityFlags: z.array(z.string()),
  })),
});
export const exportSchema = z.object({
  schemaVersion: z.literal("1.0"), noteId: z.string(), versionId: z.string(), revision: z.number().int(),
  title: z.string().max(80), course: z.string().max(40), tags: z.array(z.string().max(20)).max(5),
  mode: z.enum(["faithful", "enhanced"]), content: contentSchema, sources: z.array(sourceSchema),
  generation: z.object({ provider: z.enum(["mock", "llm"]), model: z.string().nullable(),
    promptVersion: z.string(), generatedAt: z.string(), editedAt: z.string().nullable() }),
});
export type Mode = "faithful" | "enhanced";
export type NoteContent = z.infer<typeof contentSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type SourceRef = z.infer<typeof refSchema>;
export type Evidence = Pick<NoteContent["summary"], keyof typeof evidence>;
export type NoteExport = z.infer<typeof exportSchema>;
export type UploadSource = Source & { sizeBytes: number; mime: string; ready: boolean; error?: string; fixtureId?: string };
export interface Draft { id: string; title: string; course: string; tags: string[]; mode: Mode; focus: string; sources: UploadSource[]; updatedAt: string; provider: "mock" | "llm"; noteId?: string; baseRevision?: number }
export interface NoteRecord { id: string; title: string; course: string; tags: string[]; revision: number; currentVersionId: string; versions: NoteExport[]; createdAt: string; updatedAt: string }
export type JobStatus = "queued" | "validating" | "extracting" | "generating" | "validating_output" | "saving" | "succeeded" | "failed" | "cancelling" | "cancelled" | "interrupted";
export interface Job { id: string; draft: Draft; status: JobStatus; step: number; startedAt: string; updatedAt: string; error?: string; resultNoteId?: string; attempt: number }
export const terminal = new Set<JobStatus>(["succeeded", "failed", "cancelled", "interrupted"]);
export function current(note: NoteRecord) { return note.versions.find(v => v.versionId === note.currentVersionId)!; }
export function uid(prefix = "id") { return `${prefix}_${crypto.randomUUID()}`; }
export function clone<T>(value: T): T { return structuredClone(value); }
export class AppError extends Error { constructor(public code: string, message: string) { super(message); } }

export function validateContent(raw: unknown, sources: Source[], mode: Mode, generated = true): NoteContent {
  const content = contentSchema.parse(raw);
  const sourceIds = new Set<string>();
  for (const source of sources) {
    if (sourceIds.has(source.id)) throw new AppError("DUPLICATE_SOURCE", "来源标识重复。");
    sourceIds.add(source.id);
    const segmentIds = new Set<string>();
    for (const segment of source.segments) {
      if (segmentIds.has(segment.id)) throw new AppError("DUPLICATE_SOURCE", "来源片段标识重复。");
      segmentIds.add(segment.id);
      if (segment.locator.kind === "text" && segment.locator.end - segment.locator.start !== [...segment.text].length) throw new AppError("INVALID_LOCATOR", "来源文字定位与原文长度不一致。");
    }
  }
  const ids = new Set<string>();
  const references = new Set(sources.flatMap(s => s.segments.map(p => `${s.id}/${p.id}`)));
  const checkRefs = (refs: SourceRef[]) => {
    for (const ref of refs) if (!references.has(`${ref.sourceId}/${ref.segmentId}`)) throw new AppError("INVALID_REFERENCE", "生成结果存在无效来源引用。");
  };
  const primary = [content.summary, ...content.keyPoints, ...content.knowledgeBlocks];
  const additions = [...content.enhancements, ...content.reviewQuestions];
  for (const item of [...primary, ...additions, ...content.unresolvedItems]) {
    if (ids.has(item.id)) throw new AppError("DUPLICATE_ID", "笔记条目标识重复。");
    ids.add(item.id); checkRefs(item.sourceRefs);
  }
  if (mode === "faithful" && additions.length) throw new AppError("MODE_VIOLATION", "忠实整理不能包含 AI 增强内容。");
  if (!content.summary.text.trim()) throw new AppError("EMPTY_GENERATION", "生成摘要为空。");
  for (const item of primary) {
    if (item.provenance === "source" && !item.sourceRefs.length) throw new AppError("INVALID_EVIDENCE", "来源内容缺少有效依据。");
    if (generated && (item.provenance !== "source" || !item.sourceRefs.length)) throw new AppError("INVALID_EVIDENCE", "来源内容缺少有效依据。");
    if (generated && (item.editedByUser || item.needsSourceReview)) throw new AppError("INVALID_EVIDENCE", "生成结果不能声明人工编辑状态。");
    if (generated && item.confidence === "high" && item.sourceRefs.some(r => sources.find(s => s.id === r.sourceId)?.segments.find(p => p.id === r.segmentId)?.qualityFlags.length)) {
      item.confidence = "medium"; item.confidenceReason = "来源存在识别或冲突标记，建议核对。";
    }
  }
  for (const item of additions) if (generated && (item.provenance !== "enhancement" || item.confidence !== "unassessed" || item.editedByUser || item.needsSourceReview)) throw new AppError("INVALID_ENHANCEMENT", "AI 增强标记不完整。");
  for (const q of content.reviewQuestions) if (generated && !q.sourceRefs.length) throw new AppError("INVALID_REFERENCE", "自测题缺少关联材料。");
  for (const item of [...primary, ...additions]) if ((item.editedByUser || item.provenance === "user" || item.provenance === "enhancement") && item.confidence !== "unassessed") throw new AppError("INVALID_CONFIDENCE", "手动修改或补充内容必须标记未核验。");
  for (const item of content.unresolvedItems) if (generated && item.status !== "open") throw new AppError("INVALID_STATUS", "生成结果不能代替用户确认待解决项。");
  return content;
}

export function checkExport(raw: unknown): NoteExport {
  const data = exportSchema.parse(raw);
  validateContent(data.content, data.sources, data.mode, false);
  return data;
}
