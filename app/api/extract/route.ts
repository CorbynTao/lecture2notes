import { checkRequest, errorResponse, extractImage } from "@/lib/lecture/server-ai";
export async function POST(request: Request) {
  let release: (() => void) | undefined;
  try { release = checkRequest(request); const data = await request.formData(); const file = data.get("file"); if (!(file instanceof File)) throw new Error("missing file"); return Response.json(await extractImage(file, request.signal)); }
  catch (e) { return errorResponse(e); } finally { release?.(); }
}
