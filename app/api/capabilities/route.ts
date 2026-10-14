import { capabilities } from "@/lib/lecture/server-ai";
export async function GET() { return Response.json(await capabilities()); }
