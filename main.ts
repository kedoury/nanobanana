// main.ts — Deno Deploy 旗舰稳定版
// 特点：
// - 托管 /static 作为前端站点
// - /api/chat 与 /generate 两个 POST 接口，代理 OpenRouter
// - 支持非流式与流式（SSE）两种返回
// - CORS 统一处理
// - 对 429/5xx 做有限重试（含 Cloudflare 偶发 1105 的典型场景）
// - 避免把 Cloudflare 的整页 HTML 直接透传前端，统一 JSON 化错误
// - /health 健康检查；其余静态路由交给 serveDir

import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";

// ------------ 配置区 ------------
const STATIC_DIR = "static"; // 你的前端目录
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"; // 如需改为 /responses，自行替换
const DEFAULT_MODEL = "openai/gpt-4o-mini";
const USER_AGENT = "Nanobanana/1.1 (deno-deploy)";
// 重试次数/退避
const RETRIES = 2;
const BASE_DELAY_MS = 400;

// ------------ CORS ------------
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type,Authorization,X-Requested-With,Accept",
  "Vary": "Origin",
};

// 统一 JSON 响应
function json(
  data: unknown,
  status = 200,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
      ...extra,
    },
  });
}

// 统一 TEXT 响应（主要给健康检查或纯文本回显）
function text(
  data: string,
  status = 200,
  extra: Record<string, string> = {},
): Response {
  return new Response(data, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...CORS_HEADERS, ...extra },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 可重试 fetch（对 429/502/503/504/5xx）
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retry = RETRIES,
  baseDelay = BASE_DELAY_MS,
): Promise<Response> {
  for (let i = 0; i <= retry; i++) {
    try {
      const res = await fetch(url, init);
      const retriable =
        res.status === 429 ||
        res.status === 502 ||
        res.status === 503 ||
        res.status === 504 ||
        (res.status >= 500 && res.status <= 599);
      if (!retriable) return res;
      if (i < retry) await sleep(baseDelay * (i + 1));
      else return res; // 最后一跳也返回给上层做统一处理
    } catch (e) {
      if (i < retry) await sleep(baseDelay * (i + 1));
      else throw e;
    }
  }
  return new Response("unreachable", { status: 500 });
}

// 读 JSON，容错
async function readJson<T = any>(req: Request): Promise<T> {
  try {
    return await req.json();
  } catch {
    // @ts-ignore
    return {};
  }
}

// 从请求中解析 API Key（Authorization > body.apiKey > env）
function extractApiKey(req: Request, body: any): string {
  const auth = req.headers.get("Authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  if (typeof body?.apiKey === "string" && body.apiKey.trim()) {
    return body.apiKey.trim();
  }
  return (Deno.env.get("OPENROUTER_API_KEY") ?? "").trim();
}

// 组装请求头（含标识头）
function buildUpstreamHeaders(req: Request, apiKey: string): HeadersInit {
  const referer =
    req.headers.get("origin") ??
    new URL(req.url).origin ??
    "https://your-app.deno.dev";

  return {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Authorization": `Bearer ${apiKey}`,
    "HTTP-Referer": referer,
    "X-Title": "Nanobanana",
    "User-Agent": USER_AGENT,
  };
}

// —— 非流式：拿完整 JSON 并封装 —— //
async function proxyNonStream(
  upstreamUrl: string,
  headers: HeadersInit,
  payload: unknown,
): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetchWithRetry(
      upstreamUrl,
      { method: "POST", headers, body: JSON.stringify(payload) },
      RETRIES,
      BASE_DELAY_MS,
    );
  } catch (e) {
    return json({
      ok: false,
      status: 502,
      upstream: "openrouter",
      message: `Network error: ${(e as Error)?.message ?? String(e)}`,
    }, 502);
  }

  if (!upstream.ok) {
    const textBody = await upstream.text();
    const cfRay = upstream.headers.get("cf-ray") ?? undefined;
    const looksLikeHtml = /^\s*</.test(textBody);
    const safeSnippet = (looksLikeHtml ? "[html-response] " : "") + textBody.slice(0, 1200);
    return json({
      ok: false,
      status: upstream.status,
      upstream: "openrouter",
      cfRay,
      message: safeSnippet,
    }, 502);
  }

  const data = await upstream.json();
  return json({ ok: true, data }, 200);
}

// —— 流式：直通 SSE（并合并 CORS 头） —— //
async function proxyStream(
  upstreamUrl: string,
  headers: HeadersInit,
  payload: unknown,
): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetchWithRetry(
      upstreamUrl,
      { method: "POST", headers, body: JSON.stringify(payload) },
      RETRIES,
      BASE_DELAY_MS,
    );
  } catch (e) {
    return json({
      ok: false,
      status: 502,
      upstream: "openrouter",
      message: `Network error: ${(e as Error)?.message ?? String(e)}`,
    }, 502);
  }

  if (!upstream.ok || !upstream.body) {
    // 不是 2xx 或没有 body（SSE 要求有可读流）
    const textBody = await upstream.text();
    const cfRay = upstream.headers.get("cf-ray") ?? undefined;
    const looksLikeHtml = /^\s*</.test(textBody);
    const safeSnippet = (looksLikeHtml ? "[html-response] " : "") + textBody.slice(0, 1200);
    return json({
      ok: false,
      status: upstream.status,
      upstream: "openrouter",
      cfRay,
      message: safeSnippet,
    }, 502);
  }

  // 直接把上游的 SSE 流 body 透传，但要并入 CORS 头
  const upstreamHeaders = new Headers(upstream.headers);
  // 强制设定正确的 SSE 类型，同时混入 CORS
  upstreamHeaders.set("Content-Type", "text/event-stream; charset=utf-8");
  for (const [k, v] of Object.entries(CORS_HEADERS)) upstreamHeaders.set(k, v);

  // 注意：不要调用 upstream.text()/json()，保持流未被消费
  return new Response(upstream.body, {
    status: upstream.status,
    headers: upstreamHeaders,
  });
}

// 统一处理 /api/chat 与 /generate（两个路由同逻辑）
async function handleChat(req: Request): Promise<Response> {
  const body = await readJson(req);
  const apiKey = extractApiKey(req, body);
  if (!apiKey) return json({ ok: false, error: "Missing OpenRouter API key." }, 401);

  const model = (body.model as string) || DEFAULT_MODEL;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const stream = !!body.stream;

  const payload = { model, messages, stream };
  const headers = buildUpstreamHeaders(req, apiKey);

  // 根据 stream 分流
  if (stream) {
    // SSE 直通
    return await proxyStream(OPENROUTER_URL, headers, payload);
  } else {
    // 非流式 JSON
    return await proxyNonStream(OPENROUTER_URL, headers, payload);
  }
}

// 路由服务
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // 1) 预检请求：只对 /api/* 处理 CORS 预检，静态资源交给 serveDir
  if (req.method === "OPTIONS" && pathname.startsWith("/api/")) {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // 2) 健康检查（避免占用根路径）
  if (req.method === "GET" && pathname === "/health") {
    return json({ ok: true, service: "nanobanana-proxy", ts: Date.now() });
  }

  // 3) API 路由（兼容两个路径）
  if (req.method === "POST" && (pathname === "/api/chat" || pathname === "/generate")) {
    return await handleChat(req);
  }

  // 4) 其余均交由静态站点托管
  return await serveDir(req, {
    fsRoot: STATIC_DIR,     // ← 你的前端目录
    urlRoot: "",
    showDirListing: false,
    quiet: true,
  });
});
