"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Upload, FileText, Plus, X, ArrowUp, ArrowDown, Image, Sparkles, Loader2, ShieldCheck, Check } from "lucide-react";
import { repo } from "@/lib/lecture/store";
import { uid, type Draft, type UploadSource } from "@/lib/lecture/schema";
import { demoSources, demos, textSource } from "@/lib/lecture/fixtures";
import { extractFile, validateSources } from "@/lib/lecture/extraction";
import { createJob } from "@/lib/lecture/jobs";
import { Banner, Button, Badge, ModeCard, Modal } from "./primitives";
import type { Notify } from "./workbench";

export function NewNote({ cap, notify }: { cap: { generation: boolean; vision: boolean }; notify: Notify }) {
  const router = useRouter(), params = useSearchParams();
  const [draft, setDraft] = useState<Draft | null>(null), [text, setText] = useState("");
  const [textOpen, setTextOpen] = useState(false), [drag, setDrag] = useState(false), [busy, setBusy] = useState(false), [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(""), [error, setError] = useState(""), [confirmSend, setConfirmSend] = useState(false), [visionConsent, setVisionConsent] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null); const draftRef = useRef<Draft | null>(null); const submittingRef = useRef(false);
  useEffect(() => {
    let active = true;
    (async () => {
      const draftId = params.get("draft"); if (draftId) { const d = await repo.draft(draftId); if (d && active) { setDraft(d); return; } }
      const demo = demos.find(d => d.id === params.get("demo"));
      const d: Draft = { id: uid("draft"), title: demo?.title ?? "", course: demo?.course ?? "", tags: demo ? [...demo.tags] : [], mode: "faithful", focus: "", sources: demo ? await demoSources(demo.id) : [], updatedAt: new Date().toISOString(), provider: "mock" };
      if (active) setDraft(d);
    })().catch(e => setError(e.message)); return () => { active = false; };
  }, [params]);
  useEffect(() => {
    draftRef.current = draft;
    if (!draft) return;
    setSaved("保存中…");
    const t = setTimeout(() => repo.saveDraft(draft).then(() => setSaved("草稿已保存")).catch(() => setSaved("草稿保存失败，请重试")), 500);
    return () => clearTimeout(t);
  }, [draft]);
  useEffect(() => { const before = (e: BeforeUnloadEvent) => { if (saved.includes("失败") || saved === "保存中…") { e.preventDefault(); e.returnValue = ""; } }; window.addEventListener("beforeunload", before); return () => window.removeEventListener("beforeunload", before); }, [saved]);
  const change = (value: Partial<Draft>) => setDraft(d => d && ({ ...d, ...value, updatedAt: new Date().toISOString() }));
  const files = async (list: FileList | File[]) => {
    if (!draft || busy) return; setBusy(true); setError("");
    try {
      const items = Array.from(list);
      if (draft.sources.length + items.length > 10) throw new Error("一次最多添加 10 份素材。");
      if (draft.sources.reduce((n, s) => n + s.sizeBytes, 0) + items.reduce((n, f) => n + f.size, 0) > 50 * 1024 * 1024) throw new Error("素材总大小不能超过 50 MiB。");
      const next: UploadSource[] = [];
      for (const f of items) {
        const source = await extractFile(f, draft.sources.length + next.length, cap.vision && visionConsent);
        if (draft.sources.some(s => s.hash === source.hash) || next.some(s => s.hash === source.hash)) { notify(`“${f.name}”已添加，跳过重复文件。`); continue; }
        next.push(source);
      }
      setDraft(latest => latest && ({ ...latest, sources: [...latest.sources, ...next].map((s, order) => ({ ...s, order })), updatedAt: new Date().toISOString() }));
    } catch (e) { setError(e instanceof Error ? e.message : "上传失败，请重试。"); } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  async function addText() {
    if (!draft || !text.trim()) return;
    if ([...text].length > 30000) { setError("文字不能超过 30,000 字符。"); return; }
    if (draft.sources.length >= 10) { setError("一次最多添加 10 份素材。"); return; }
    const source = await textSource(text.trim(), `课堂文字 ${draft.sources.filter(s => s.kind === "text").length + 1}`, draft.sources.length);
    change({ sources: [...draft.sources, { ...source, sizeBytes: new TextEncoder().encode(text).length, mime: "text/plain", ready: true }] }); setText(""); setTextOpen(false);
  }
  async function submit(confirmed = false) {
    if (!draft || submittingRef.current || busy) return;
    try {
      validateSources(draft.sources);
      if (draft.provider === "llm" && !confirmed) { setConfirmSend(true); return; }
      submittingRef.current = true; setSubmitting(true); setError("");
      const source = draft.sources[0];
      const ready = { ...draft, title: draft.title.trim() || source.name.replace(/\.[^.]+$/, "").slice(0, 80), updatedAt: new Date().toISOString() };
      const job = await createJob(ready); router.push(`/jobs/${job.id}?start=1`);
    } catch (e) { setError(e instanceof Error ? e.message : "提交失败。"); submittingRef.current = false; setSubmitting(false); }
  }
  if (!draft) return <div className="page-loading"><Loader2 className="spin" />正在准备学习材料…</div>;
  const reorder = (i: number, direction: number) => { const next = [...draft.sources]; [next[i], next[i + direction]] = [next[i + direction], next[i]]; change({ sources: next.map((s, order) => ({ ...s, order })) }); };
  const canGenerate = draft.sources.length > 0 && draft.sources.every(s => s.ready) && !busy && !submitting;
  return <div className="page-enter"><button className="back-link" onClick={() => router.push("/notes")}><ArrowLeft size={16} />返回我的笔记</button><div className="page-heading"><div><div className="eyebrow">A CLEARER WAY TO LEARN</div><h1>{draft.noteId ? "换一种方式，重新理解" : "从材料开始，让知识成形。"}</h1><p>添加同一堂课的材料，选择适合你的整理方式。</p></div><span className={`save-status ${saved.includes("失败") ? "error-text" : ""}`}><span className="status-dot" />{saved}</span></div>
    {error && <Banner tone="error">{error}</Banner>}
    <div className="create-layout"><section className="create-main"><div className="panel"><div className="panel-heading"><span className="step-number">01</span><div><h2>添加学习素材</h2><p>同一堂课的材料，放在一起更容易理解。</p></div><Badge>{draft.sources.length} / 10</Badge></div>
      <div className={`upload-zone ${drag ? "dragging" : ""} ${busy ? "upload-busy" : ""}`} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); void files(e.dataTransfer.files); }}><div className="upload-symbol">{busy ? <Loader2 className="spin" size={27} /> : <Upload size={27} />}</div><h3>{busy ? "正在读取素材…" : "把课堂材料拖到这里"}</h3><p>课件 PDF、截图，或粘贴你随手记下的文字</p><div className="upload-actions"><Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}><Plus size={16} />选择文件</Button><button className="text-btn" onClick={() => setTextOpen(v => !v)}><FileText size={16} />粘贴文字</button></div><small>PDF · PNG · JPEG · WebP · TXT ｜ 单文件 ≤20 MiB</small><input ref={fileRef} hidden type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.txt" onChange={e => { if (e.target.files) void files(e.target.files); }} /></div>
      {textOpen && <div className="text-entry"><label htmlFor="source-text">课堂文字</label><textarea id="source-text" rows={7} placeholder="把你的课堂记录粘贴到这里…" value={text} onChange={e => setText(e.target.value)} /><div><span className="muted">{[...text].length.toLocaleString()} / 30,000 字符</span><Button onClick={() => void addText()} disabled={!text.trim()}>添加文字<Check size={15} /></Button></div></div>}
      {draft.sources.length > 0 && <div className="source-list"><div className="source-list-heading"><span>已添加的素材</span><span>按顺序整理，可上下调整</span></div>{draft.sources.map((s, i) => <div className={`source-row ${!s.ready ? "source-error" : ""}`} key={s.id}><span className={`source-icon ${s.kind === "image" ? "purple" : "green"}`}>{s.kind === "image" ? <Image size={19} /> : <FileText size={19} />}</span><div className="source-row-info"><strong>{s.name}</strong><span>{s.error || `${(s.sizeBytes / 1024).toFixed(1)} KB · ${s.segments.length} 个来源片段${s.fixtureId ? " · 内置样例" : ""}`}</span></div><div className="source-actions"><button className="icon-btn" aria-label="上移素材" disabled={i === 0} onClick={() => reorder(i, -1)}><ArrowUp size={14} /></button><button className="icon-btn" aria-label="下移素材" disabled={i === draft.sources.length - 1} onClick={() => reorder(i, 1)}><ArrowDown size={14} /></button><button className="icon-btn" aria-label={`移除${s.name}`} onClick={() => change({ sources: draft.sources.filter((_, n) => n !== i).map((s, order) => ({ ...s, order })) })}><X size={15} /></button></div></div>)}</div>}
      <div className="material-help"><ShieldCheck size={16} /><p>文字和文本型 PDF 在浏览器提取。演示生成只处理内置样例或形成原文模拟结构，不冒充 AI 分析。</p></div>{cap.vision && <label className="checkbox-line vision-consent"><input type="checkbox" checked={visionConsent} onChange={e => setVisionConsent(e.target.checked)} />允许将我接下来上传的图片发送到已配置的识别模型</label>}
      <div className="sample-downloads"><span>试试自制素材：</span><a href="/samples/calculus.pdf" download>示例 PDF ↗</a><a href="/samples/calculus.png" download>示例截图 ↗</a></div>
    </div><div className="panel"><div className="panel-heading"><span className="step-number">02</span><div><h2>为这堂课起个名字</h2><p>方便下一次复习时找到它。</p></div><span className="optional">选填</span></div><label className="field">笔记标题<input maxLength={80} placeholder="例如：第三讲 · 导数与连续性" value={draft.title} onChange={e => change({ title: e.target.value })} /></label><div className="two-fields"><label className="field">课程名称<input maxLength={40} placeholder="例如：高等数学" value={draft.course} onChange={e => change({ course: e.target.value })} /></label><label className="field">标签<span className="input-hint">用逗号分隔，最多 5 个</span><input maxLength={104} placeholder="导数，期末复习" value={draft.tags.join("，")} onChange={e => change({ tags: e.target.value.split(/[,，]/).slice(0, 5).map(s => s.slice(0, 20)) })} /></label></div></div></section>
      <aside className="create-aside"><div className="panel mode-panel"><div className="panel-heading"><span className="step-number">03</span><div><h2>选择整理方式</h2><p>不同的阶段，不同的帮助。</p></div></div><div className="mode-options"><ModeCard mode="faithful" selected={draft.mode === "faithful"} onClick={() => change({ mode: "faithful" })} /><ModeCard mode="enhanced" selected={draft.mode === "enhanced"} onClick={() => change({ mode: "enhanced" })} /></div><label className="field focus-field">这次想重点关注什么？<span className="input-hint">选填</span><textarea rows={3} maxLength={300} placeholder="例如：保留公式条件，突出概念之间的联系" value={draft.focus} onChange={e => change({ focus: e.target.value })} /></label><label className="field">生成服务<select value={draft.provider} onChange={e => change({ provider: e.target.value as Draft["provider"] })}><option value="mock">演示模式 · 无需密钥</option><option value="llm" disabled={!cap.generation}>{cap.generation ? "真实模型 · 服务端已配置" : "真实模型 · 尚未配置"}</option></select></label><Banner tone={draft.provider === "mock" ? "warning" : "info"}>{draft.provider === "mock" ? "当前为演示生成。固定样例展示双模式效果；自有材料只生成标明性质的原文结构。" : "点击生成前将再次确认外发范围，仅发送本次选中的来源文字。"}</Banner><Button className="generate-button" onClick={() => void submit()} disabled={!canGenerate}>{submitting ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}生成笔记<ArrowRight size={17} /></Button>{!draft.sources.length && <p className="generate-hint">先添加一份素材，就可以开始了</p>}</div><div className="aside-quote"><span>“</span><p>好的笔记，是下一次<br />理解知识的起点。</p><small>LEARN A LITTLE, EVERY DAY</small></div></aside>
    </div>
    {confirmSend && <Modal title="确认发送本次课堂材料" close={() => setConfirmSend(false)}><div className="modal-body"><p>将向服务端配置的模型发送 <strong>{draft.sources.length} 份素材的提取文字</strong>，用于生成这份笔记。不发送其他历史笔记。</p><p className="muted">请确认你可以使用这些材料；原始文件仍保存在当前浏览器。</p><div className="modal-actions"><Button variant="secondary" onClick={() => setConfirmSend(false)}>返回检查</Button><Button onClick={() => { setConfirmSend(false); void submit(true); }}>发送并生成</Button></div></div></Modal>}
  </div>;
}
