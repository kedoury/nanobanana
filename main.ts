// main.ts — Deno Deploy 版
// 功能：/api/* 代理到 OpenRouter（带重试+错误JSON封装+CORS）
//      其它路径静态托管你的前端（index.html、JS、CSS）

import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"; // 或 /responses
const DEF_MODEL = "openai/gpt-4o-mini";

// ---- CORS ----
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type,Authorization,X-Requested-With,Accept",
  "Vary": "Origin",
};

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retry = 2,
  baseDelay = 300,
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
      else return res;
    } catch (e) {
      if (i < retry) await sleep(baseDelay * (i + 1));
      else throw e;
    }
  }
  // 理论到不了
  return new Response("unreachable", { status: 500 });
}

async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

async function handleChat(req: Request): Promise<Response> {
  const body = await readJson(req);

  // 优先 Authorization，其次 body.apiKey，最后环境变量
  let apiKey = "";
  const authHeader = req.headers.get("Authorization") ?? "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    apiKey = authHeader.slice(7).trim();
  } else if (typeof body.apiKey === "string" && body.apiKey.trim()) {
    apiKey = body.apiKey.trim();
  } else {
    apiKey = (Deno.env.get("OPENROUTER_API_KEY") ?? "").trim();
  }
  if (!apiKey) return json({ ok: false, error: "Missing OpenRouter API key." }, 401);

  const model = (body.model as string) || DEF_MODEL;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const stream = !!body.stream;

  const referer =
    req.headers.get("origin") ??
    new URL(req.url).origin ??
    "https://your-app.deno.dev";

  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Authorization": `Bearer ${apiKey}`,
    "HTTP-Referer": referer,
    "X-Title": "Nanobanana",
    "User-Agent": "Nanobanana/1.0 (deno-deploy)",
  };

  const upstreamPayload = { model, messages, stream };

  let upstream: Response;
  try {
    upstream = await fetchWithRetry(
      OPENROUTER_URL,
      { method: "POST", headers, body: JSON.stringify(upstreamPayload) },
      2,
      400,
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
    const text = await upstream.text();
    const cfRay = upstream.headers.get("cf-ray") ?? undefined;
    const looksLikeHtml = /^\s*</.test(text);
    const safeSnippet = (looksLikeHtml ? "[html-response] " : "") + text.slice(0, 800);
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

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // 处理预检
  if (req.method === "OPTIONS" && pathname.startsWith("/api/")) {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // 健康检查（可选：改到 /health，避免占用根路径）
  if (req.method === "GET" && pathname === "/health") {
    return json({ ok: true, service: "nanobanana-proxy", ts: Date.now() });
  }

  // API 路由
  if (req.method === "POST" && (pathname === "/api/chat" || pathname === "/generate")) {
    return await handleChat(req);
  }

  // 静态站点（把你的 index.html/静态资源托管出来）
  // fsRoot 默认当前仓库根目录；如果你的前端在 /public，就把 fsRoot 改成 "public"
  return await serveDir(req, {
    fsRoot: ".",          // ← 如果你的页面在 /public，请改为 "public"
    urlRoot: "",
    showDirListing: false,
    quiet: true,
  });
});
