import { uid, AppError, type Draft, type Job, type NoteExport, validateContent, terminal } from "./schema";
import { repo } from "./store";
import { buildMock } from "./fixtures";
import { validateSources } from "./extraction";

const running = new Map<string, AbortController>();
function emit() { window.dispatchEvent(new Event("lecture-job")); }
const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => { if (signal.aborted) return reject(new DOMException("Aborted", "AbortError")); const abort = () => { clearTimeout(t); reject(new DOMException("Aborted", "AbortError")); }; const t = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms); signal.addEventListener("abort", abort, { once: true }); });
export async function createJob(draft: Draft): Promise<Job> {
  validateSources(draft.sources);
  const active = (await repo.jobs()).find(j => j.draft.id === draft.id && !terminal.has(j.status));
  if (active) return active;
  const now = new Date().toISOString();
  const job: Job = { id: uid("job"), draft: structuredClone(draft), status: "queued", step: 0, startedAt: now, updatedAt: now, attempt: 1 };
  await repo.saveDraft(draft); await repo.saveJob(job); return job;
}
export function isRunning(id: string) { return running.has(id); }
export async function runJob(id: string) {
  if (running.has(id)) return;
  const controller = new AbortController(); running.set(id, controller);
  let job: Job | undefined;
  try { job = await repo.job(id); } catch (e) { running.delete(id); throw e; }
  if (!job || terminal.has(job.status)) { running.delete(id); return; }
  const signal = controller.signal;
  const update = async (status: Job["status"], step: number) => {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const latest = await repo.job(id);
    if (!latest) { controller.abort(); throw new DOMException("Aborted", "AbortError"); }
    if (latest && ["cancelled", "cancelling"].includes(latest.status)) { controller.abort(); throw new DOMException("Aborted", "AbortError"); }
    job = { ...job!, status, step, updatedAt: new Date().toISOString() }; await repo.saveJob(job); emit();
  };
  try {
    await update("validating", 0); validateSources(job.draft.sources); await wait(250, signal);
    await update("extracting", 1); await wait(job.draft.provider === "mock" ? 450 : 10, signal);
    const sources = job.draft.sources.map(({ sizeBytes, mime, ready, error, fixtureId, ...s }) => s);
    await update("generating", 2);
    let raw: unknown; let model: string | null = null;
    if (job.draft.provider === "mock") { await wait(850, signal); raw = buildMock(sources, job.draft.mode); }
    else {
      const response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sources, mode: job.draft.mode, focus: job.draft.focus }), signal });
      const result = await response.json() as { content: unknown; model: string | null; error?: { code?: string; message?: string } };
      if (!response.ok) throw new AppError(result.error?.code ?? "GENERATION_FAILED", result.error?.message ?? "真实模型调用失败。");
      raw = result.content; model = result.model;
    }
    await update("validating_output", 3); const content = validateContent(raw, sources, job.draft.mode); await wait(250, signal);
    await update("saving", 4); await wait(150, signal);
    const now = new Date().toISOString();
    const version: NoteExport = { schemaVersion: "1.0", noteId: job.draft.noteId ?? uid("note"), versionId: uid("version"), revision: 1, title: job.draft.title.trim() || sources[0].name.slice(0, 80), course: job.draft.course, tags: job.draft.tags, mode: job.draft.mode, content, sources, generation: { provider: job.draft.provider, model, promptVersion: `lecture2notes-${job.draft.mode}-v1`, generatedAt: now, editedAt: null } };
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    await repo.commitResult(job, version); emit();
  } catch (e) {
    const latest = await repo.job(id);
    if (latest && latest.status !== "succeeded") {
      job = { ...job, status: signal.aborted || latest?.status === "cancelled" ? "cancelled" : "failed", error: signal.aborted ? undefined : e instanceof Error ? e.message : "任务失败，请重试。", updatedAt: new Date().toISOString() };
      await repo.saveJob(job).catch(() => {}); emit();
    }
  } finally { running.delete(id); }
}
export async function cancelJob(id: string) {
  const job = await repo.job(id); if (!job || terminal.has(job.status)) return;
  await repo.saveJob({ ...job, status: "cancelled", updatedAt: new Date().toISOString() }); running.get(id)?.abort(); emit();
}
export async function retryJob(id: string) {
  const job = await repo.job(id); if (!job) throw new AppError("NOT_FOUND", "找不到此任务。");
  validateSources(job.draft.sources);
  const next = { ...job, id: uid("job"), status: "queued" as const, step: 0, error: undefined, resultNoteId: undefined, attempt: job.attempt + 1, startedAt: new Date().toISOString() };
  await repo.saveJob(next); return next;
}
