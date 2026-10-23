import { NextRequest, NextResponse } from "next/server";

/**
 * Gateway proxy: forwards /api/** to the NeuroVault FastAPI backend
 * (port 8000). The SPA calls relative /api paths, which land here when the
 * app is viewed through the platform preview.
 */
const BACKEND = "http://127.0.0.1:8000";

async function proxy(req: NextRequest, path: string[]) {
  const target = `${BACKEND}/api/${path.join("/")}${req.nextUrl.search}`;
  const headers = new Headers();
  const ct = req.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  const init: RequestInit = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }
  try {
    const res = await fetch(target, init);
    const resHeaders = new Headers();
    resHeaders.set("content-type", res.headers.get("content-type") ?? "application/octet-stream");
    const body = await res.arrayBuffer();
    return new NextResponse(body, { status: res.status, headers: resHeaders });
  } catch {
    return NextResponse.json(
      { error: { code: "backend_unreachable", message: "NeuroVault backend (port 8000) is not running." } },
      { status: 502 },
    );
  }
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function POST(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function OPTIONS(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
