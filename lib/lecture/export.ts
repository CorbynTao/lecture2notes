import { checkExport, type NoteExport, type Evidence } from "./schema";
export const confidenceLabels = { high: "来源较清楚", medium: "建议核对", low: "需要确认", unassessed: "未核验" };
export function evidenceMarkdown(e: Evidence) {
  const parts = [confidenceLabels[e.confidence]];
  if (e.provenance === "enhancement") parts.push("AI 增强");
  if (e.provenance === "user") parts.push("用户补充");
  if (e.editedByUser) parts.push("已手动修改，来源待核对");
  return `> ${parts.join(" · ")}。${e.confidenceReason}`;
}
export function markdown(raw: NoteExport, options = { sources: true, questions: true }) {
  const v = checkExport(raw), c = v.content;
  const lines = [`# ${v.title}`, "", `课程：${v.course || "未分类"} · 模式：${v.mode === "faithful" ? "忠实整理" : "学习增强"}`, `生成时间：${v.generation.generatedAt} · 版本：${v.versionId} / revision ${v.revision}`, ""];
  if (v.generation.provider === "mock") lines.push("> 演示模式：模拟整理结果，不代表真实 AI 语义分析或 OCR 能力。", "");
  lines.push("## 摘要", "", c.summary.text, "", evidenceMarkdown(c.summary), "", "## 关键点", "");
  for (const p of c.keyPoints) lines.push(`- ${p.text}`, `  ${evidenceMarkdown(p)}`, "");
  lines.push("## 知识块", "");
  for (const b of c.knowledgeBlocks) lines.push(`### ${b.title}`, "", b.bodyMarkdown, "", evidenceMarkdown(b), "");
  if (c.enhancements.length) { lines.push("## 学习增强（AI 补充，未经外部核验）", ""); for (const b of c.enhancements) lines.push(`### ${b.title} · AI 增强`, "", b.bodyMarkdown, "", evidenceMarkdown(b), ""); }
  if (options.questions && c.reviewQuestions.length) { lines.push("## 自测问题（AI 增强）", ""); for (const q of c.reviewQuestions) lines.push(`### ${q.question}`, "", `参考答案：${q.answer}`, "", evidenceMarkdown(q), ""); }
  lines.push("## 未解决项", "");
  if (!c.unresolvedItems.length) lines.push("当前未标记待确认项；这不保证内容完全正确。", "");
  for (const u of c.unresolvedItems) lines.push(`- [${u.status === "resolved" ? "x" : " "}] ${u.description}`, `  建议：${u.suggestedAction}`, "");
  if (options.sources) {
    lines.push("## 来源清单", "");
    for (const s of v.sources) { lines.push(`### ${s.name}`, "", `来源 ID：${s.id} · 类型：${s.kind} · 解析版本：${s.parseVersion}`, ""); for (const p of s.segments) lines.push(`**${p.page ? `第 ${p.page} 页 · ` : ""}${p.id}**`, "", p.text, ""); }
    lines.push("## 内容引用映射", "");
    for (const e of [c.summary, ...c.keyPoints, ...c.knowledgeBlocks, ...c.enhancements, ...c.reviewQuestions, ...c.unresolvedItems]) lines.push(`- ${e.id} → ${e.sourceRefs.map(r => `${r.sourceId}/${r.segmentId}`).join(", ") || "无来源；属于补充内容"}`);
  }
  return lines.join("\n");
}
export function filename(v: NoteExport, format: string) { return `${v.course ? v.course + "_" : ""}${v.title}_${new Date().toLocaleDateString("sv-SE").replaceAll("-", "")}`.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 150) + "." + format; }
export function download(text: string, name: string, mime = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type: mime })); const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
