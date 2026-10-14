import { type Mode, type Source, type NoteContent, type Evidence, uid } from "./schema";

export const demos = [
  { id: "calculus", title: "导数与连续性", course: "高等数学", category: "理解一个概念", color: "purple", icon: "∂", description: "用定义、公式与反例，串起一节高数课。", tags: ["导数", "连续性"],
    parts: [
      { name: "课件摘录 · 导数的定义", text: "导数表示函数在某点的瞬时变化率。函数 f 在 x0 处的导数定义为 f′(x0)=lim(h→0)[f(x0+h)−f(x0)]/h，前提是该极限存在。可导一定连续，连续不一定可导。" },
      { name: "课堂记录 · 反例与例题", text: "绝对值函数 f(x)=|x| 在 x=0 处连续，但左导数为 −1，右导数为 1，因此在零点不可导。课堂例题题干没有记录，仅记下了答案，需要补充。" },
    ],
  },
  { id: "management", title: "管理的四项基本职能", course: "管理学原理", category: "梳理一组知识", color: "green", icon: "↗", description: "把重复的课堂记录，整理成清晰的知识结构。", tags: ["管理职能", "组织"],
    parts: [
      { name: "管理学课件摘录", text: "管理的四项基本职能是计划、组织、领导和控制。计划确定目标及行动方案；组织配置资源并分配职责；领导通过沟通与激励推动执行；控制将实际结果与目标比较并采取纠偏措施。" },
      { name: "课堂补记", text: "计划、组织、领导、控制构成相互关联的管理过程。控制不是单纯的事后检查，还可以贯穿执行过程。计划确定目标，组织分配职责；这两项在前一页已讲过。" },
    ],
  },
  { id: "conflict", title: "两份记录，一个待确认条件", course: "概率论", category: "核对不确定信息", color: "amber", icon: "≈", description: "发现材料冲突，把需要确认的内容留下来。", tags: ["条件概率", "待确认"],
    parts: [
      { name: "课件截图转录", text: "条件概率公式：P(A|B)=P(A∩B)/P(B)，使用条件为 P(B)>0。" },
      { name: "个人速记", text: "课堂速记：条件概率的使用条件记成了 P(B)≥0。这个条件与课件不一致，需要向老师确认。" },
    ],
  },
] as const;

export async function sha(text: string | ArrayBuffer): Promise<string> {
  const bytes = typeof text === "string" ? new TextEncoder().encode(text) : text;
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(b => b.toString(16).padStart(2, "0")).join("");
}
export async function textSource(text: string, name: string, order = 0): Promise<Source> {
  const id = uid("source");
  return { id, kind: "text", name, hash: await sha(text), order, parseVersion: "text-v1", segments: [{ id: uid("segment"), page: null, text, locator: { kind: "text", start: 0, end: [...text].length }, qualityFlags: [] }] };
}

export async function demoSources(id: string) {
  const demo = demos.find(d => d.id === id) ?? demos[0];
  return Promise.all(demo.parts.map(async (p, i) => ({ ...await textSource(p.text, p.name, i), sizeBytes: new TextEncoder().encode(p.text).length, mime: "text/plain", ready: true, fixtureId: demo.id })));
}

export function buildMock(sources: Source[], mode: Mode): NoteContent {
  const combined = sources.flatMap(s => s.segments.map(p => p.text)).join("\n");
  const normalize = (text: string) => text.replace(/x₀/g, "x0").replace(/\s+/g, "");
  const allSegments = sources.flatMap(s => s.segments.map(p => ({ sourceId: s.id, segmentId: p.id, text: p.text })));
  const demo = demos.find(d => d.parts.every(p => allSegments.some(s => normalize(s.text).includes(normalize(p.text)))));
  const refs = (demo ? demo.parts.map(p => allSegments.find(s => normalize(s.text).includes(normalize(p.text)))!) : allSegments).map(({ sourceId, segmentId }) => ({ sourceId, segmentId }));
  const e = (indexes: number[] = [0], confidence: Evidence["confidence"] = "high"): Evidence => ({ provenance: "source", sourceRefs: [...new Map(indexes.map(i => refs[i]).filter(Boolean).map(r => [`${r.sourceId}/${r.segmentId}`, r])).values()], confidence, confidenceReason: confidence === "high" ? "原始材料明确陈述，尚未经人工核验。" : "来源存在缺失或冲突，建议核对。", editedByUser: false, needsSourceReview: false });
  const enhance = (): Evidence => ({ ...e(), provenance: "enhancement", confidence: "unassessed", confidenceReason: "模型补充的模拟示例，未经外部资料验证。" });
  let summary = combined.slice(0, 650);
  let points: string[] = [];
  let blocks: { title: string; body: string; kind: NoteContent["knowledgeBlocks"][number]["kind"]; indexes: number[] }[] = [];
  const unresolved: NoteContent["unresolvedItems"] = [];
  const enhancements: NoteContent["enhancements"] = [];
  const questions: NoteContent["reviewQuestions"] = [];
  if (demo?.id === "calculus") {
    summary = "导数描述函数在某一点的瞬时变化率。可导一定连续，但连续不一定可导；绝对值函数在零点就是反例。理解导数时，要同时关注极限是否存在以及左右导数是否相等。";
    points = ["导数是函数在某点的瞬时变化率，定义依赖差商极限的存在。", "可导一定连续；连续不一定可导。", "f(x)=|x| 在零点连续，但左右导数分别为 −1 与 1，因此不可导。"];
    blocks = [
      { title: "导数：从变化到极限", body: "导数表示函数在某点的瞬时变化率。\n\n$$f'(x_0)=\\lim_{h\\to0}\\frac{f(x_0+h)-f(x_0)}{h}$$\n\n**成立前提：上述极限存在。**", kind: "formula", indexes: [0] },
      { title: "可导与连续：单向蕴含", body: "- 可导一定连续。\n- 连续不一定可导。\n\n整理时必须保留“不一定”这一限定。", kind: "conclusion", indexes: [0] },
      { title: "反例：绝对值函数的零点", body: "函数 $f(x)=|x|$ 在零点连续。左导数为 −1，右导数为 1，二者不相等，所以该点不可导。", kind: "example", indexes: [1] },
    ];
    unresolved.push({ id: "u1", description: "课堂例题缺少题干，目前无法还原完整解题过程。", reason: "missing_context", sourceRefs: [refs[1]], suggestedAction: "补充例题题目或对应课件截图。", status: "open" });
    if (mode === "enhanced") {
      enhancements.push({ id: "e1", title: "把连续与可导放在两层理解", kind: "explanation", bodyMarkdown: "连续关心函数值能否自然衔接；可导进一步要求局部变化率具有确定的极限。后者对局部行为提出了更强要求。\n\n这是帮助理解的补充解释，不代表课堂原话。", ...enhance() });
      enhancements.push({ id: "e2", title: "易错提醒：不要倒置逻辑", kind: "pitfall", bodyMarkdown: "记忆“可导 ⇒ 连续”时，不要写成“连续 ⇒ 可导”。遇到分段函数的连接点，分别检查左右导数。", ...enhance() });
      questions.push({ id: "q1", question: "函数在某点连续，是否就一定可导？请给出材料中的反例。", answer: "不一定。f(x)=|x| 在零点连续，但左右导数不同，因此不可导。", ...enhance() });
    }
  } else if (demo?.id === "management") {
    summary = "管理由计划、组织、领导和控制四项相互关联的职能构成：计划确定目标，组织配置资源，领导推动执行，控制比较结果并纠偏。控制可以贯穿执行过程。";
    points = ["计划负责确定目标及行动方案。", "组织负责资源配置和职责分配。", "领导通过沟通与激励推动执行。", "控制比较实际结果与目标并纠偏，可贯穿执行过程。"];
    blocks = [
      { title: "计划与组织", body: "**计划**：确定目标及行动方案。\n\n**组织**：配置资源并分配职责。", kind: "concept", indexes: [0] },
      { title: "领导与控制", body: "**领导**：沟通、激励和推动执行。\n\n**控制**：比较实际与目标，采取纠偏措施。控制不只发生在事后。", kind: "concept", indexes: [0, 1] },
      { title: "相互关联的管理过程", body: "计划、组织、领导、控制构成相互关联的管理过程。重复出现的计划、组织定义已合并。", kind: "conclusion", indexes: [1] },
    ];
    if (mode === "enhanced") {
      enhancements.push({ id: "e1", title: "用一次小组作业理解四项职能", kind: "example", bodyMarkdown: "假设你组织小组作业：制定提交目标是计划，分工是组织，沟通推进是领导，检查进度并调整是控制。\n\n此例为额外构造的学习示例。", ...enhance() });
      questions.push({ id: "q1", question: "为什么控制不只是期末检查？", answer: "课堂记录指出控制可以贯穿执行过程，通过比较目标与实际结果及时纠偏。", ...enhance() });
    }
  } else if (demo?.id === "conflict") {
    summary = "两份材料记录了条件概率及其使用条件。课件要求 P(B)>0，而个人速记写为 P(B)≥0，二者存在冲突，需要核对原始课堂材料。";
    points = ["课件给出的公式为 P(A|B)=P(A∩B)/P(B)。", "课件与速记对 P(B) 的限制不一致，不应直接合并。"];
    blocks = [{ title: "条件概率及材料分歧", body: "$$P(A\\mid B)=\\frac{P(A\\cap B)}{P(B)}$$\n\n- 课件条件：$P(B)>0$。\n- 个人速记：$P(B)\\geq0$。\n\n两份记录的条件有冲突，当前保留两种记录待确认。", kind: "formula", indexes: [0, 1] }];
    unresolved.push({ id: "u1", description: "P(B)>0 与 P(B)≥0 两种条件冲突。", reason: "source_conflict", sourceRefs: refs, suggestedAction: "对照原课件或请老师确认，不能把两种条件视为等价。", status: "open" });
    if (mode === "enhanced") enhancements.push({ id: "e1", title: "核对思路：观察分母", kind: "pitfall", bodyMarkdown: "可以从分母能否为零入手检查条件。这是额外学习提示，不代替对原始记录的核对。", ...enhance() });
  } else {
    const segments = sources.flatMap(s => s.segments.map(p => ({ text: p.text, ref: { sourceId: s.id, segmentId: p.id } })));
    points = segments.slice(0, 5).map(p => p.text.slice(0, 600));
    blocks = segments.slice(0, 30).map((p, i) => ({ title: `原文片段 ${i + 1}`, body: p.text.slice(0, 7500), kind: "concept", indexes: [i] }));
  }
  const allEvidence = e(refs.map((_, i) => i), demo?.id === "conflict" ? "low" : "high");
  return {
    summary: { id: "s1", text: summary, ...allEvidence },
    keyPoints: points.map((text, i) => ({ id: `p${i + 1}`, text, ...allEvidence })),
    knowledgeBlocks: blocks.map((b, i) => ({ id: `b${i + 1}`, title: b.title, kind: b.kind, bodyMarkdown: b.body, ...e(b.indexes, demo?.id === "conflict" ? "low" : "high") })),
    enhancements, reviewQuestions: questions, unresolvedItems: unresolved,
  };
}
