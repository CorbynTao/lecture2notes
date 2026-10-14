import { checkRequest, errorResponse, generate } from "@/lib/lecture/server-ai";
export async function POST(request: Request) {
  let release: (() => void) | undefined;
  try {
    release = checkRequest(request);
    if (Number(request.headers.get("content-length") ?? 0) > 512000) return Response.json({ error: { code: "INPUT_TOO_LONG", message: "请求体过大，请拆分素材。" } }, { status: 413 });
    const text = await request.text(); if (text.length > 512000) return Response.json({ error: { code: "INPUT_TOO_LONG", message: "请求体过大。" } }, { status: 413 });
    return Response.json(await generate(JSON.parse(text), request.signal));
  } catch (e) { return errorResponse(e); } finally { release?.(); }
}
