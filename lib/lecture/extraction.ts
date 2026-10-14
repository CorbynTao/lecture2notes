import { AppError, uid, type UploadSource } from "./schema";
import { sha, textSource } from "./fixtures";
import { repo } from "./store";

const MIB = 1024 * 1024;
export async function extractFile(file: File, order: number, visionEnabled = false): Promise<UploadSource> {
  if (file.size > 20 * MIB) throw new AppError("FILE_TOO_LARGE", "单文件不能超过 20 MiB。");
  if (!["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain"].includes(file.type)) throw new AppError("INVALID_FILE_TYPE", "支持 PDF、PNG、JPEG、WebP 和 TXT 文件。");
  const bytes = await file.arrayBuffer();
  const hash = await sha(bytes);
  const id = uid("source");
  const kind = file.type === "application/pdf" ? "pdf" : file.type === "text/plain" ? "text" : "image";
  let source: UploadSource = { id, hash, kind, name: file.name, order, parseVersion: "pending", segments: [], sizeBytes: file.size, mime: file.type, ready: false };
  await repo.saveAsset(id, file);
  try {
    if (kind === "text") {
      const text = await file.text();
      if ([...text].length > 30000) throw new AppError("INPUT_TOO_LONG", "文字不能超过 30,000 字符。");
      if (!text.trim()) throw new AppError("EMPTY_EXTRACTION", "文件中没有可用文字。");
      source = { ...source, ...await textSource(text, file.name, order), id, hash, ready: true };
    } else if (kind === "pdf") {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.mjs";
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes), cMapUrl: "/vendor/cmaps/", cMapPacked: true, standardFontDataUrl: "/vendor/standard_fonts/" });
      const pdf = await loadingTask.promise;
      try {
        if (pdf.numPages > 50) throw new AppError("PAGE_LIMIT_EXCEEDED", "PDF 不能超过 50 页，请拆分材料。");
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i); const content = await page.getTextContent();
          const text = content.items.map(p => "str" in p ? p.str + (p.hasEOL ? "\n" : " ") : "").join("").trim();
          if (text) source.segments.push({ id: uid("segment"), page: i, text, locator: { kind: "page", page: i }, qualityFlags: [] });
        }
        if (!source.segments.length) throw new AppError("EMPTY_EXTRACTION", "此 PDF 没有可读取的文字层，可能需要 OCR。当前请改用截图或粘贴文字。");
        source.parseVersion = "pdfjs-text-v1"; source.ready = true;
      } finally { await loadingTask.destroy(); }
    } else {
      const manifest = await fetch("/samples/manifest.json").then(r => r.json()) as { images: { hash: string; text: string; fixtureId: string }[] };
      const fixture = manifest.images.find(f => f.hash === hash);
      if (fixture) {
        source.segments = [{ id: uid("segment"), page: 1, text: fixture.text, locator: { kind: "page", page: 1 }, qualityFlags: [] }];
        source.fixtureId = fixture.fixtureId; source.parseVersion = "fixture-extract-v1"; source.ready = true;
      } else if (visionEnabled) {
        const form = new FormData(); form.append("file", file);
        const response = await fetch("/api/extract", { method: "POST", body: form }); const result = await response.json() as { text: string; error?: { code?: string; message?: string } };
        if (!response.ok) throw new AppError(result.error?.code ?? "OCR_FAILED", result.error?.message ?? "图片识别失败。");
        source.segments = [{ id: uid("segment"), page: 1, text: result.text, locator: { kind: "page", page: 1 }, qualityFlags: ["vision_unverified"] }];
        source.parseVersion = "vision-v1"; source.ready = true;
      } else throw new AppError("OCR_UNAVAILABLE", "当前未配置图片识别。可使用内置样例截图，或粘贴图片中的文字。");
    }
  } catch (e) {
    source.error = e instanceof Error && e.name === "PasswordException" ? "该 PDF 需要密码，请上传未加密版本。" : e instanceof Error && e.name === "InvalidPDFException" ? "PDF 已损坏或格式无效，请重新导出后上传。" : e instanceof Error ? e.message : "无法解析该文件。";
  }
  return source;
}

export function validateSources(sources: UploadSource[]) {
  if (!sources.length || sources.some(s => !s.ready || !s.segments.length)) throw new AppError("INVALID_SOURCE", "请移除无法解析的素材，或补充可用文字。");
  if (sources.length > 10) throw new AppError("SOURCE_LIMIT", "一次最多添加 10 份素材。");
  if (sources.reduce((n, s) => n + s.sizeBytes, 0) > 50 * MIB) throw new AppError("TOTAL_TOO_LARGE", "材料总大小不能超过 50 MiB。");
  if (sources.filter(s => s.kind === "pdf").reduce((n, s) => n + Math.max(0, ...s.segments.map(p => p.page ?? 0)), 0) > 50) throw new AppError("PAGE_LIMIT_EXCEEDED", "PDF 合计不能超过 50 页。");
  const textCount = sources.filter(s => s.kind === "text").reduce((n, s) => n + s.segments.reduce((a, p) => a + [...p.text].length, 0), 0);
  if (textCount > 30000) throw new AppError("INPUT_TOO_LONG", "粘贴文字合计不能超过 30,000 字符。");
  const total = sources.reduce((n, s) => n + s.segments.reduce((a, p) => a + [...p.text].length, 0), 0);
  if (total > 16000) throw new AppError("INPUT_TOO_LONG", "当前单次整理最多接受约 16,000 字符，请拆分素材。此为保守上下文预算。");
}
