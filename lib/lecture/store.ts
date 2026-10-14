import { AppError, type Draft, type Job, type NoteRecord, type NoteExport, current, checkExport, uid } from "./schema";
const DB_NAME = "lecture2notes-v1";
let dbPromise: Promise<IDBDatabase> | null = null;
export function database(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { for (const name of ["notes", "drafts", "jobs", "assets"]) r.result.createObjectStore(name, { keyPath: "id" }); };
    r.onsuccess = () => { r.result.onversionchange = () => { r.result.close(); dbPromise = null; }; resolve(r.result); };
    r.onerror = () => { dbPromise = null; reject(new AppError("STORAGE_UNAVAILABLE", "无法打开本地存储。请检查浏览器存储权限。")); };
    r.onblocked = () => reject(new AppError("STORAGE_BLOCKED", "请关闭其他旧版本页面后重试。"));
  });
  return dbPromise;
}
async function read<T>(store: string, id?: string): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => { const tx = db.transaction(store, "readonly"); const r = id ? tx.objectStore(store).get(id) : tx.objectStore(store).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
async function write(store: string, value: unknown) {
  const db = await database();
  return new Promise<void>((resolve, reject) => { const tx = db.transaction(store, "readwrite"); tx.objectStore(store).put(value); tx.oncomplete = () => resolve(); tx.onabort = () => reject(new AppError("SAVE_FAILED", "保存失败，可能是本地存储空间不足。")); });
}
export const repo = {
  notes: () => read<NoteRecord[]>("notes"), note: (id: string) => read<NoteRecord | undefined>("notes", id),
  drafts: () => read<Draft[]>("drafts"), draft: (id: string) => read<Draft | undefined>("drafts", id), saveDraft: (d: Draft) => write("drafts", d),
  jobs: () => read<Job[]>("jobs"), job: (id: string) => read<Job | undefined>("jobs", id), saveJob: (j: Job) => write("jobs", j),
  asset: (id: string) => read<{ id: string; blob: Blob } | undefined>("assets", id), saveAsset: (id: string, blob: Blob) => write("assets", { id, blob }),
  async removeDraft(id: string) { const db = await database(); await new Promise<void>((resolve, reject) => { const tx = db.transaction("drafts", "readwrite"); tx.objectStore("drafts").delete(id); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); }); },
  async saveNote(note: NoteRecord, expectedRevision: number) {
    const db = await database();
    return new Promise<NoteRecord>((resolve, reject) => {
      const tx = db.transaction("notes", "readwrite"); const store = tx.objectStore("notes"); const r = store.get(note.id);
      let conflict = false;
      r.onsuccess = () => {
        const old = r.result as NoteRecord | undefined;
        if (!old || old.revision !== expectedRevision) { conflict = true; tx.abort(); return; }
        const saved = { ...note, revision: expectedRevision + 1, updatedAt: new Date().toISOString() };
        const v = current(saved); v.revision = saved.revision; v.title = saved.title; v.course = saved.course; v.tags = saved.tags; v.generation.editedAt = saved.updatedAt;
        checkExport(v); store.put(saved); note = saved;
      };
      tx.oncomplete = () => { resolve(note); window.dispatchEvent(new Event("lecture-updated")); };
      tx.onabort = () => reject(new AppError(conflict ? "REVISION_CONFLICT" : "SAVE_FAILED", conflict ? "这份笔记已在其他页面修改。请重新载入或另存副本。" : "保存失败，请重试或下载备份。"));
    });
  },
  async commitResult(job: Job, version: NoteExport) {
    const db = await database();
    return new Promise<string>((resolve, reject) => {
      const tx = db.transaction(["notes", "jobs", "drafts"], "readwrite");
      const jobs = tx.objectStore("jobs"); const notes = tx.objectStore("notes"); const r = jobs.get(job.id); let resultId = version.noteId;
      r.onsuccess = () => {
        const latest = r.result as Job;
        if (!latest || ["cancelled", "cancelling"].includes(latest.status)) { tx.abort(); return; }
        const existing = notes.get(version.noteId);
        existing.onsuccess = () => {
          let note = existing.result as NoteRecord | undefined;
          if (note) {
            version.revision = note.revision + 1; note.versions.push(version);
            if (note.revision === job.draft.baseRevision) note.currentVersionId = version.versionId;
            note.revision += 1; note.updatedAt = new Date().toISOString();
          } else note = { id: version.noteId, title: version.title, course: version.course, tags: version.tags, revision: 1, currentVersionId: version.versionId, versions: [version], createdAt: version.generation.generatedAt, updatedAt: version.generation.generatedAt };
          notes.put(note); jobs.put({ ...latest, status: "succeeded", step: 5, resultNoteId: resultId, updatedAt: new Date().toISOString() }); tx.objectStore("drafts").delete(job.draft.id);
        };
      };
      tx.oncomplete = () => { window.dispatchEvent(new Event("lecture-updated")); resolve(resultId); };
      tx.onabort = () => reject(new AppError("SAVE_FAILED", "未完成保存，任务可能已取消或本地空间不足。"));
    });
  },
  async deleteNote(id: string) {
    const db = await database();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["notes", "jobs", "drafts", "assets"], "readwrite");
      tx.objectStore("notes").delete(id);
      const nr = tx.objectStore("notes").getAll(); const dr = tx.objectStore("drafts").getAll(); const jr = tx.objectStore("jobs").getAll();
      let all: NoteRecord[] | undefined, drafts: Draft[] | undefined, jobs: Job[] | undefined;
      const cleanup = () => { if (!all || !drafts || !jobs) return; const used = new Set(all.flatMap(n => n.versions.flatMap(v => v.sources.map(s => s.id)))); for (const d of drafts) for (const s of d.sources) used.add(s.id); for (const j of jobs) { if (j.resultNoteId === id || j.draft.noteId === id) tx.objectStore("jobs").delete(j.id); else if (!j.resultNoteId) for (const s of j.draft.sources) used.add(s.id); } const cursor = tx.objectStore("assets").openCursor(); cursor.onsuccess = () => { const c = cursor.result; if (c) { if (!used.has(String(c.key))) c.delete(); c.continue(); } }; };
      nr.onsuccess = () => { all = nr.result; cleanup(); }; dr.onsuccess = () => { drafts = dr.result; cleanup(); }; jr.onsuccess = () => { jobs = jr.result; cleanup(); };
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
    });
  },
  async importVersion(data: unknown, asCopy = false) {
    const v = checkExport(data);
    const id = asCopy ? uid("note") : v.noteId;
    const existing = await this.note(id);
    if (existing) throw new AppError("ALREADY_EXISTS", "相同笔记已存在，请选择另存副本。");
    const version = { ...v, noteId: id, versionId: uid("version"), revision: 1 };
    await write("notes", { id, title: version.title, course: version.course, tags: version.tags, revision: 1, currentVersionId: version.versionId, versions: [version], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } satisfies NoteRecord);
    return id;
  },
};
