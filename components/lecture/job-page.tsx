"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles, FileText, XCircle } from "lucide-react";
import { repo } from "@/lib/lecture/store";
import { type Job, terminal } from "@/lib/lecture/schema";
import { cancelJob, retryJob, runJob, isRunning } from "@/lib/lecture/jobs";
import { Button, Banner, Badge, Empty } from "./primitives";
import type { Notify } from "./workbench";
const steps = ["校验学习素材", "读取来源内容", "整理知识结构", "检查内容与引用", "保存你的笔记"];
export function JobPage({ id, notify }: { id: string; notify: Notify }) {
  const router = useRouter(), params = useSearchParams(); const [job, setJob] = useState<Job | null>(null), [missing, setMissing] = useState(false), [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    let active = true;
    const load = async () => { const data = await repo.job(id); if (!active) return; if (!data) { setMissing(true); return; } setJob(previous => previous?.updatedAt === data.updatedAt && previous.status === data.status ? previous : data); if (terminal.has(data.status)) clearInterval(interval); };
    (async () => {
      const j = await repo.job(id); if (!j || !active) { if (active) setMissing(true); return; }
      if (!terminal.has(j.status) && !isRunning(id)) {
        if (params.get("start") === "1" && j.status === "queued") void runJob(id);
        else { j.status = "interrupted"; j.error = "页面刷新或关闭后，本地任务已中断。素材已保留，可以重新整理。"; await repo.saveJob(j); }
      }
      await load();
    })().catch(e => notify(e.message, true));
    const interval = setInterval(() => { void load(); }, 450); const on = () => { void load(); }; window.addEventListener("lecture-job", on);
    return () => { active = false; clearInterval(interval); window.removeEventListener("lecture-job", on); };
  }, [id, notify, params]);
  useEffect(() => { if (job?.status === "succeeded" && job.resultNoteId) { const t = setTimeout(() => router.replace(`/notes/${job.resultNoteId}`), 500); return () => clearTimeout(t); } }, [job?.status, job?.resultNoteId, router]);
  useEffect(() => { if (!job || terminal.has(job.status)) return; const t = setInterval(() => setElapsed(Math.floor((Date.now() - new Date(job.startedAt).getTime()) / 1000)), 1000); return () => clearInterval(t); }, [job?.startedAt, job?.status]);
  if (missing) return <Empty title="找不到这次整理任务" text="任务可能已删除，返回笔记空间继续。"><Button onClick={() => router.push("/notes")}>返回我的笔记</Button></Empty>;
  if (!job) return <div className="page-loading"><Loader2 className="spin" />读取任务…</div>;
  const failed = ["failed", "interrupted", "cancelled"].includes(job.status);
  return <div className="job-page page-enter"><button className="back-link" onClick={() => router.push("/notes")}><ArrowLeft size={16} />返回我的笔记</button><div className="job-card"><div className={`job-symbol ${failed ? "job-failed" : ""}`}>{failed ? <XCircle size={32} /> : job.status === "succeeded" ? <Check size={32} /> : <Sparkles size={32} />}</div><div className="eyebrow">FROM MATERIALS TO KNOWLEDGE</div><h1>{job.status === "succeeded" ? "你的笔记，已经整理好了。" : job.status === "cancelled" ? "本次整理已取消" : failed ? "整理暂时停在这里" : "让零散的知识，慢慢成形。"}</h1><p className="job-subtitle">{job.draft.title || "未命名笔记"} · {job.draft.sources.length} 份素材 · {job.draft.mode === "faithful" ? "忠实整理" : "学习增强"}</p>{job.draft.provider === "mock" && <Banner tone="warning">演示模式：以下步骤为模拟执行，用于验证交互与数据流。</Banner>}<div className="job-steps">{steps.map((s, i) => <div className={`job-step ${job.step > i || job.status === "succeeded" ? "done" : job.step === i && !failed ? "running" : ""}`} key={s}><span>{job.step > i || job.status === "succeeded" ? <Check size={16} /> : job.step === i && !failed ? <Loader2 className="spin" size={16} /> : i + 1}</span><div><strong>{s}</strong><small>{job.step > i || job.status === "succeeded" ? "已完成" : job.step === i && !failed ? "正在进行" : "等待中"}</small></div></div>)}</div>{failed && job.error && <Banner tone="error">{job.error}</Banner>}<div className="job-actions">{failed ? <><Button onClick={async () => { try { const next = await retryJob(id); router.push(`/jobs/${next.id}?start=1`); } catch (e) { notify(e instanceof Error ? e.message : "重试失败", true); } }}>重新整理<ArrowRight size={16} /></Button><Button variant="secondary" onClick={() => router.push(`/notes/new?draft=${job.draft.id}`)}>修改素材</Button></> : job.status === "succeeded" ? <Button onClick={() => router.push(`/notes/${job.resultNoteId}`)}>查看笔记<ArrowRight size={16} /></Button> : <Button variant="secondary" onClick={() => void cancelJob(id)}>取消任务</Button>}</div><div className="job-footer"><span><FileText size={14} />素材与配置已保留</span><span>{elapsed} 秒</span></div></div><p className="job-tip">资料不清楚的地方会留下标记，理解可以慢一点，事实需要准确一点。</p></div>;
}
