// main.ts — for Deno Deploy
// 目标：稳妥转发到 OpenRouter；带齐 headers；错误做 JSON 封装；对偶发 1105/网络波动做有限重试；统一 CORS。

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"; // 或换成 /responses
const DEF_MODEL = "openai/gpt-4o-mini"; // 你常用的模型，前端可覆盖

// ---- 小工具：CORS 头 ----
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type,Authorization,X-Requested-With,Accept",
  "Vary": "Origin",
};

// ---- 小工具：JSON 响应 ----
function json(
  data: unknown,
  status = 200,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS, ...extra },
  });
}

// ---- 小工具：睡眠 ----
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- 核心：带重试的 fetch（对偶发 1105、502、网络抖动更稳）----
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retry = 2,
  baseDelay = 300,
): Promise<Response> {
  let lastErr: unknown = null;

  for (let i = 0; i <= retry; i++) {
    try {
      const res = await fetch(url, init);

      // 1105/5xx/429 等可重试
      const retriable =
        res.status === 429 ||
        res.status === 502 ||
        res.status === 503 ||
        res.status === 504 ||
        // 部分边缘节点把 1105 写在文本里，这里只要不是 2xx 就考虑重试
        (res.status >= 500 && res.status <= 599);

      if (!retriable) return res;

      if (i < retry) {
        // 退避
        await sleep(baseDelay * (i + 1));
        continue;
      }
      return res; // 最后一次也返回给上层统一处理
    } catch (e) {
      lastErr = e;
      if (i < retry) {
        await sleep(baseDelay * (i + 1));
        continue;
      }
      throw e;
    }
  }
  // 理论到不了这
  throw lastErr ?? new Error("fetchWithRetry: unknown error");
}

// ---- 解析请求体，容错 ----
async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

// ---- 处理与 OpenRouter 的交互 ----
async function handleChat(req: Request): Promise<Response> {
  const body = await readJson(req);

  // 1) API Key：优先 Authorization: Bearer xxx；然后 body.apiKey；最后 env
  let authHeader = req.headers.get("Authorization") ?? "";
  let apiKey = "";
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    apiKey = authHeader.slice(7).trim();
  } else if (typeof body.apiKey === "string" && body.apiKey.trim()) {
    apiKey = body.apiKey.trim();
  } else {
    apiKey = (Deno.env.get("OPENROUTER_API_KEY") ?? "").trim();
  }
  if (!apiKey) {
    return json({ ok: false, error: "Missing OpenRouter API key." }, 401);
  }

  // 2) 组装消息体
  const model = (body.model as string) || DEF_MODEL;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const stream = !!body.stream; // 这里默认非流式，可由前端决定

  const upstreamPayload = {
    model,
    messages,
    stream,
    // 你也可以把其它 openrouter 字段透传，例如 route, provider等
    // ...body.extra
  };

  // 3) 组装请求头（带齐标识，有助于通过 Cloudflare 检查）
  const referer =
    req.headers.get("origin") ??
    new URL(req.url).origin ??
    "https://your-deno-deploy-app.deno.dev";

  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Authorization": `Bearer ${apiKey}`,
    // OpenRouter 推荐的两个标识头（可帮助通过风控、方便他们侧定位）：
    "HTTP-Referer": referer,
    "X-Title": "Nanobanana",
    // 额外给一个 UA
    "User-Agent": "Nanobanana/1.0 (deno-deploy)",
  };

  // 4) 请求上游（带重试）
  let upstream: Response;
  try {
    upstream = await fetchWithRetry(OPENROUTER_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(upstreamPayload),
    }, 2, 400);
  } catch (e) {
    return json({
      ok: false,
      status: 502,
      upstream: "openrouter",
      message: `Network error: ${(e as Error)?.message ?? String(e)}`,
    }, 502);
  }

  // 5) 统一错误封装（避免把整页 HTML 透传给前端）
  if (!upstream.ok) {
    const text = await upstream.text();
    // 尝试抽取 cf-ray 方便排查
    const cfRay = upstream.headers.get("cf-ray") ?? undefined;

    // 尝试识别是否是 HTML
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

  // 6) 成功：正常转 JSON（如果要做流式，在这里改为直接管道转发）
  const data = await upstream.json();
  return json({ ok: true, data }, 200);
}

// ---- 路由 ----
Deno.serve(async (req: Request) => {
  const { pathname } = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // 健康检查
  if (req.method === "GET" && pathname === "/") {
    return json({ ok: true, service: "nanobanana-proxy", ts: Date.now() });
  }

  // 对应你的前端调用路径（按你的项目改：如 /api/chat、/generate 等）
  if (req.method === "POST" && (pathname === "/api/chat" || pathname === "/generate")) {
    return await handleChat(req);
  }

  return json({ ok: false, error: "Not Found" }, 404);
});
