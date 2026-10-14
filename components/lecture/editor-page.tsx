"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, RotateCcw, Plus, X, Loader2, Eye, Download } from "lucide-react";
import { repo } from "@/lib/lecture/store";
import { current, clone, uid, type NoteRecord, type NoteContent, type Evidence } from "@/lib/lecture/schema";
import { download } from "@/lib/lecture/export";
import { useNote } from "./note-page";
import { Button, Banner, Badge, Empty, Modal } from "./primitives";
import { Markdown } from "./markdown";
import type { Notify } from "./workbench";

export function EditorPage({ id, notify }: { id: string; notify: Notify }) {
  const router = useRouter(); const { note: initial, loaded, error } = useNote(id);
  const [note, setNote] = useState<NoteRecord | null>(null), [seq, setSeq] = useState(0), [status, setStatus] = useState("已保存"), [saveError, setSaveError] = useState("");
  const [preview, setPreview] = useState(false), [undo, setUndo] = useState(false), [conflict, setConflict] = useState(false);
  const local = useRef<NoteRecord | null>(null), entry = useRef<NoteRecord | null>(null), expected = useRef(0), sequence = useRef(0), savedSequence = useRef(0), saving = useRef<Promise<void> | null>(null), blocked = useRef(false), mounted = useRef(true);
  const saveRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (initial && !entry.current) { entry.current = clone(initial); const next = clone(initial); const snapshot = clone(current(next)); snapshot.versionId = uid("snapshot"); next.versions.push(snapshot); local.current = next; expected.current = initial.revision; setNote(next); } }, [initial]);
  const mutate = (fn: (n: NoteRecord) => void) => {
    if (!local.current) return; const next = clone(local.current); fn(next); local.current = next; setNote(next); sequence.current++; setSeq(sequence.current); setStatus("有未保存修改");
  };
  async function save() {
    if (saving.current) return saving.current;
    if (!local.current || savedSequence.current === sequence.current) return;
    if (blocked.current) throw new Error("存在版本冲突，请另存副本或重新载入。");
    const captured = sequence.current, snapshot = clone(local.current);
    setStatus("保存中…"); setSaveError("");
    saving.current = (async () => {
      try {
        const result = await repo.saveNote(snapshot, expected.current); expected.current = result.revision; savedSequence.current = captured;
        if (captured === sequence.current) { local.current = result; if (mounted.current) setNote(result); }
        if (mounted.current) setStatus(`已保存 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`);
      } catch (e) {
        const message = e instanceof Error ? e.message : "保存失败。"; if (mounted.current) { setStatus("保存失败"); setSaveError(message); }
        if (message.includes("其他页面")) { blocked.current = true; setConflict(true); }
        throw e;
      } finally { saving.current = null; }
    })();
    return saving.current;
  }
  saveRef.current = save;
  useEffect(() => { if (!seq || blocked.current) return; const t = setTimeout(() => { void saveRef.current().catch(() => {}); }, 800); return () => clearTimeout(t); }, [seq, status]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => { if (sequence.current !== savedSequence.current) { e.preventDefault(); e.returnValue = ""; } };
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void saveRef.current().catch(() => {}); } };
    window.addEventListener("beforeunload", before); document.addEventListener("keydown", key); return () => { window.removeEventListener("beforeunload", before); document.removeEventListener("keydown", key); };
  }, []);
  useEffect(() => {
    const guard = (event: MouseEvent) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>(".sidebar button,.sidebar a");
      if (!target || sequence.current === savedSequence.current) return;
      event.preventDefault(); event.stopPropagation();
      (async () => { try { while (sequence.current !== savedSequence.current) await saveRef.current(); target.click(); } catch { notify("修改尚未保存，请处理保存问题或下载备份。", true); } })();
    };
    document.addEventListener("click", guard, true); return () => document.removeEventListener("click", guard, true);
  }, [notify]);
  async function leave(path: string) { try { while (savedSequence.current !== sequence.current) await save(); router.push(path); } catch { notify("请先处理保存问题；也可以下载当前备份。", true); } }
  const edited = (e: Evidence) => { e.editedByUser = true; e.needsSourceReview = true; e.confidence = "unassessed"; e.confidenceReason = "用户修改了内容，原来源关系需要重新核对。"; };
  function changeItem(section: "keyPoints" | "knowledgeBlocks" | "enhancements" | "reviewQuestions", itemId: string, field: string, value: string) { mutate(n => { const item = current(n).content[section].find(x => x.id === itemId)!; Object.assign(item, { [field]: value }); edited(item); }); }
  if (error) return <Banner tone="error">{error}</Banner>;
  if (!loaded) return <div className="page-loading"><Loader2 className="spin" />准备编辑器…</div>;
  if (!note) return <Empty title="找不到笔记" text="返回笔记空间查看已有内容。"><Button onClick={() => router.push("/notes")}>返回</Button></Empty>;
  const c = current(note).content;
  const newEvidence: Evidence = { provenance: "user", sourceRefs: [], confidence: "unassessed", confidenceReason: "用户自行补充，未经核验。", editedByUser: true, needsSourceReview: true };
  return <div className="editor-page page-enter"><button className="back-link" onClick={() => void leave(`/notes/${id}`)}><ArrowLeft size={16} />返回笔记详情</button><div className="page-heading"><div><div className="eyebrow">MAKE IT YOURS</div><h1>让这份笔记，更适合你。</h1><p>修改会保留手动编辑标记，来源原文保持独立。</p></div><div className="editor-actions"><span className={`save-status ${saveError ? "error-text" : ""}`}>{status}</span><Button variant="secondary" onClick={() => setPreview(v => !v)}><Eye size={16} />{preview ? "继续编辑" : "预览"}</Button><Button onClick={() => void save().catch(() => {})}><Save size={16} />保存</Button></div></div>{saveError && <Banner tone="error">{saveError}<button className="text-btn" onClick={() => download(JSON.stringify(current(local.current!), null, 2), "Lecture2Notes-未保存备份.json", "application/json;charset=utf-8")}>下载当前备份</button></Banner>}
    <div className="editor-layout"><section className="panel editor-main"><div className="editor-section"><h2>基本信息</h2><label className="field">笔记标题<input maxLength={80} value={note.title} onChange={e => mutate(n => { n.title = e.target.value; })} /></label><div className="two-fields"><label className="field">课程名称<input maxLength={40} value={note.course} onChange={e => mutate(n => { n.course = e.target.value; })} /></label><label className="field">标签（逗号分隔）<input value={note.tags.join("，")} onChange={e => mutate(n => { n.tags = e.target.value.split(/[,，]/).slice(0, 5).map(t => t.slice(0, 20)); })} /></label></div></div>
    <div className="editor-section"><h2>摘要</h2>{preview ? <Markdown text={c.summary.text} /> : <textarea aria-label="编辑摘要" rows={5} maxLength={1200} value={c.summary.text} onChange={e => mutate(n => { current(n).content.summary.text = e.target.value; edited(current(n).content.summary); })} />}</div>
    <div className="editor-section"><div className="editor-section-title"><h2>关键点</h2><button className="text-btn" onClick={() => mutate(n => { current(n).content.keyPoints.push({ id: uid("point"), text: "新的关键点", ...newEvidence }); })}><Plus size={15} />添加</button></div>{c.keyPoints.map((p, i) => <div className="editable-point" key={p.id}><span>{String(i + 1).padStart(2, "0")}</span>{preview ? <p>{p.text}</p> : <textarea rows={2} maxLength={1200} aria-label={`关键点 ${i + 1}`} value={p.text} onChange={e => changeItem("keyPoints", p.id, "text", e.target.value)} />}<button className="icon-btn" aria-label="删除关键点" onClick={() => mutate(n => { current(n).content.keyPoints = current(n).content.keyPoints.filter(x => x.id !== p.id); })}><X size={15} /></button></div>)}</div>
    <div className="editor-section"><div className="editor-section-title"><h2>知识块</h2><button className="text-btn" onClick={() => mutate(n => { current(n).content.knowledgeBlocks.push({ id: uid("block"), title: "我的补充", kind: "concept", bodyMarkdown: "在这里写下你的理解。", ...newEvidence }); })}><Plus size={15} />添加知识块</button></div>{c.knowledgeBlocks.map((b, i) => <div className="editable-block" key={b.id}><div className="editable-block-top"><Badge>{i + 1} · {b.provenance === "user" ? "用户补充" : "来源内容"}</Badge><button className="icon-btn" aria-label="删除知识块" onClick={() => mutate(n => { current(n).content.knowledgeBlocks = current(n).content.knowledgeBlocks.filter(x => x.id !== b.id); })}><X size={16} /></button></div>{preview ? <><h3>{b.title}</h3><Markdown text={b.bodyMarkdown} /></> : <><input aria-label={`知识块 ${i + 1} 标题`} maxLength={120} value={b.title} onChange={e => changeItem("knowledgeBlocks", b.id, "title", e.target.value)} /><textarea aria-label={`知识块 ${i + 1} 正文`} maxLength={8000} rows={7} value={b.bodyMarkdown} onChange={e => changeItem("knowledgeBlocks", b.id, "bodyMarkdown", e.target.value)} /></>}</div>)}</div>
    {!!c.enhancements.length && <div className="editor-section"><h2>学习增强 <Badge tone="purple">AI 补充 · 未核验</Badge></h2>{c.enhancements.map(b => <div className="editable-block" key={b.id}><div className="editable-block-top"><Badge tone="purple">AI 增强</Badge><button className="icon-btn" aria-label="删除增强块" onClick={() => mutate(n => { current(n).content.enhancements = current(n).content.enhancements.filter(x => x.id !== b.id); })}><X size={15} /></button></div><input aria-label="增强标题" maxLength={120} value={b.title} onChange={e => changeItem("enhancements", b.id, "title", e.target.value)} /><textarea aria-label="增强正文" rows={5} maxLength={8000} value={b.bodyMarkdown} onChange={e => changeItem("enhancements", b.id, "bodyMarkdown", e.target.value)} /></div>)}</div>}
    {!!c.reviewQuestions.length && <div className="editor-section"><h2>自测问题</h2>{c.reviewQuestions.map(q => <div className="editable-block" key={q.id}><div className="editable-block-top"><Badge tone="purple">AI 增强参考答案</Badge><button className="icon-btn" aria-label="删除自测题" onClick={() => mutate(n => { current(n).content.reviewQuestions = current(n).content.reviewQuestions.filter(x => x.id !== q.id); })}><X size={15} /></button></div><input aria-label="自测问题" maxLength={1200} value={q.question} onChange={e => changeItem("reviewQuestions", q.id, "question", e.target.value)} /><textarea aria-label="参考答案" rows={3} maxLength={3000} value={q.answer} onChange={e => changeItem("reviewQuestions", q.id, "answer", e.target.value)} /></div>)}</div>}
    {!!c.unresolvedItems.length && <div className="editor-section"><h2>未解决项</h2>{c.unresolvedItems.map(u => <label className="checkbox-line unresolved-edit" key={u.id}><input type="checkbox" checked={u.status === "resolved"} onChange={e => mutate(n => { current(n).content.unresolvedItems.find(x => x.id === u.id)!.status = e.target.checked ? "resolved" : "open"; })} /><span><strong>{u.description}</strong><small>{u.suggestedAction}</small></span></label>)}</div>}
    </section><aside className="editor-aside"><div className="panel"><h3>写下自己的理解</h3><p>原文负责提供依据，笔记负责帮助你理解。修改过的条目会提示重新核对来源。</p><div className="editor-help"><strong>支持简洁 Markdown</strong><code>**重点**<br />- 列表内容<br />$公式$</code></div><Button variant="secondary" onClick={() => setUndo(true)}><RotateCcw size={15} />撤销本次编辑</Button><Button className="editor-export" onClick={() => void leave(`/notes/${id}/export`)}><Download size={15} />保存并导出</Button></div></aside></div>
    {undo && <Modal title="撤销本次编辑？" close={() => setUndo(false)}><div className="modal-body"><p>恢复到你进入编辑页时的内容，包括已自动保存的本次修改。</p><div className="modal-actions"><Button variant="secondary" onClick={() => setUndo(false)}>继续编辑</Button><Button onClick={async () => { if (!entry.current) return; mutate(n => { const old = clone(entry.current!); n.title = old.title; n.course = old.course; n.tags = old.tags; current(n).content = current(old).content; }); setUndo(false); notify("已恢复进入编辑时的内容，正在保存。"); }}>确认撤销</Button></div></div></Modal>}
    {conflict && <Modal title="发现另一处更新" close={() => setConflict(false)}><div className="modal-body"><p>为保护另一个页面的修改，本次保存已暂停。可以保留当前内容为副本，或重新载入已保存版本。</p><div className="modal-actions"><Button variant="secondary" onClick={() => window.location.reload()}>重新载入</Button><Button onClick={async () => { try { const v = clone(current(local.current!)); v.title = local.current!.title.slice(0, 76) + "（副本）"; v.course = local.current!.course; v.tags = local.current!.tags; const nextId = await repo.importVersion(v, true); savedSequence.current = sequence.current; router.push(`/notes/${nextId}`); } catch (e) { notify(e instanceof Error ? e.message : "另存失败", true); } }}>另存副本</Button></div></div></Modal>}
  </div>;
}
