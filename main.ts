import { serve } from "https://deno.land/std@0.200.0/http/server.ts";
import { serveDir } from "https://deno.land/std@0.200.0/http/file_server.ts";
 

// --- 辅助函数：生成错误 JSON 响应 ---
function createJsonErrorResponse(message: string, statusCode = 500) {
    return new Response(JSON.stringify({ error: message }), {
        status: statusCode,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
}

// --- 辅助函数：休眠/等待 ---
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function safeEnvGet(name: string): string | undefined {
    try {
        // Deno Deploy/Runtime may restrict env; catch and fallback
        return Deno.env.get(name) || undefined;
    } catch (_) {
        return undefined;
    }
}
let OPENROUTER_MAX_CONCURRENCY = Number(safeEnvGet("OPENROUTER_CONCURRENCY") || 4);
let openrouterActive = 0;
const openrouterWaiters: (() => void)[] = [];
async function acquireOpenRouterSlot() {
    if (openrouterActive < OPENROUTER_MAX_CONCURRENCY) { openrouterActive++; return; }
    await new Promise<void>(resolve => openrouterWaiters.push(resolve));
    openrouterActive++;
}
function releaseOpenRouterSlot() {
    openrouterActive--; const next = openrouterWaiters.shift(); if (next) next();
}

async function fetchOpenRouterWithBackoff(payload: any, apiKey: string, maxRetries = 3): Promise<any> {
    let attempt = 0; let delay = 2000;
    while (true) {
        const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (resp.ok) { return await resp.json(); }
        const status = resp.status; const bodyText = await resp.text();
        if ((status === 429 || status >= 500) && attempt < maxRetries) {
            console.log(`API Error ${status}, waiting ${delay}ms to retry...`);
            await sleep(delay + Math.floor(Math.random() * 500)); delay *= 2; attempt++; continue;
        }
        throw new Error(`OpenRouter API error ${status}: ${bodyText}`);
    }
}


// --- 核心业务逻辑：调用 OpenRouter ---
async function callOpenRouter(messages: any[], apiKey: string): Promise<{ type: 'image' | 'text'; content: string }> {
    await acquireOpenRouterSlot();
    try {
    if (!apiKey) { throw new Error("callOpenRouter received an empty apiKey."); }
    
    // 优化提示词，确保模型明确知道需要生成图片
    const optimizedMessages = messages.map((msg, index) => {
        if (msg.role === 'user' && index === messages.length - 1) {
            // 为最后一条用户消息添加明确的图片生成指令
            const textContent = msg.content.find(c => c.type === 'text');
            if (textContent) {
                const hasImages = msg.content.some(c => c.type === 'image_url');
                if (!hasImages) {
                    // 纯文字生成图片的情况
                    textContent.text = `请根据以下描述生成一张图片（不要只是描述，要实际生成图片）：${textContent.text}`;
                } else {
                    // 有图片输入的情况
                    textContent.text = `${textContent.text}（请生成图片作为回应，不要只是文字描述）`;
                }
            }
        }
        return msg;
    });
    
    // 添加 modalities 参数确保支持图像输出
    const openrouterPayload = { 
        model: "google/gemini-3-pro-image-preview", 
        messages: optimizedMessages,
        modalities: ["image", "text"]  // 关键：声明支持图像和文本输出
    };
    console.log("Sending SMARTLY EXTRACTED payload to OpenRouter:", JSON.stringify(openrouterPayload, null, 2));
    const responseData = await fetchOpenRouterWithBackoff(openrouterPayload, apiKey, 3);
    console.log("OpenRouter Response:", JSON.stringify(responseData, null, 2));
    const message = responseData.choices?.[0]?.message;
    
    // 改进的图像检查函数，优先从 images 字段提取
    const checkForImage = (msg: any) => {
        console.log('🔍 检查响应中的图像数据:', JSON.stringify(msg, null, 2));
        
        // 1. 优先检查 OpenRouter 标准的 images 数组
        if (msg?.images && Array.isArray(msg.images) && msg.images.length > 0) {
            const imageUrl = msg.images[0]?.image_url?.url;
            if (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('data:image/')) {
                console.log('✅ 从 message.images 字段找到图片');
                return { type: 'image', content: imageUrl };
            }
        }
        
        // 2. 检查 content 是否直接是 base64 图片
        if (typeof msg?.content === 'string' && msg.content.startsWith('data:image/')) { 
            console.log('✅ 从 message.content 字段找到图片（直接格式）');
            return { type: 'image', content: msg.content }; 
        }
        
        // 3. 检查 content 中是否嵌入了 base64 图片数据
        if (typeof msg?.content === 'string') {
            const base64Match = msg.content.match(/data:image\/[^;\s]+;base64,[A-Za-z0-9+\/=]+/);
            if (base64Match) {
                console.log('✅ 从 message.content 文本中提取到图片数据');
                return { type: 'image', content: base64Match[0] };
            }
        }
        
        // 4. 检查其他可能的图片字段
        if (msg?.image || msg?.image_url) {
            const imageUrl = msg.image || msg.image_url;
            if (typeof imageUrl === 'string' && (imageUrl.startsWith('data:image/') || imageUrl.startsWith('http'))) {
                console.log('✅ 从其他图片字段找到图片');
                return { type: 'image', content: imageUrl };
            }
        }
        
        console.log('❌ 未找到图片数据');
        return null;
    };
    
    // 首先检查是否返回了图片
    const imageResult = checkForImage(message);
        if (imageResult) {
            return { ...imageResult, meta: { usedFallback: false, modelName: "google/gemini-3-pro-image-preview" } };
        }
    
    // 如果没有返回图片，但用户明确要求生成图片，则进行重试
    const userMessage = optimizedMessages[optimizedMessages.length - 1];
    const isImageGenerationRequest = userMessage?.content?.some((c: any) => 
        c.type === 'text' && (c.text.includes('生成') || c.text.includes('创作') || c.text.includes('画') || c.text.includes('绘制'))
    );
    
    if (isImageGenerationRequest && typeof message?.content === 'string') {
        console.log("模型返回了文字而不是图片，尝试重试...");
        
        // 创建带有SFW安全限定的重试提示词
        const retryMessages = [...optimizedMessages];
        const lastMessage = retryMessages[retryMessages.length - 1];
        const textContent = lastMessage.content.find((c: any) => c.type === 'text');
        if (textContent) {
            textContent.text = `IMPORTANT: You must generate an actual image, not text description. ${textContent.text}. Please create and return a safe, tasteful, non-explicit image suitable for all audiences. Avoid nudity or graphic violence. Generate an image file, not words about an image.`;
        }
        
        // 重试请求（也添加 modalities 参数）
        const retryPayload = { 
            model: "google/gemini-3-pro-image-preview", 
            messages: retryMessages,
            modalities: ["image", "text"]  // 重试时也声明支持图像输出
        };
        console.log("🔄 使用SFW安全限定词重试...");
        
        const retryData = await fetchOpenRouterWithBackoff(retryPayload, apiKey, 3);
            console.log("Retry Response:", JSON.stringify(retryData, null, 2));
            const retryMessage = retryData.choices?.[0]?.message;
            
            const retryImageResult = checkForImage(retryMessage);
            if (retryImageResult) {
                return retryImageResult;
            }
        
        // 如果重试仍然失败，尝试使用后备模型
        console.log("🔄 主模型重试失败，尝试后备模型...");
        const fallbackModels = [
            "openai/gpt-5-image-mini",
            "google/gemini-2.5-flash-image"
        ];
        
        for (const fallbackModel of fallbackModels) {
            try {
                console.log(`🔄 尝试后备模型: ${fallbackModel}`);
                const fallbackPayload = {
                    model: fallbackModel,
                    messages: retryMessages,
                    modalities: ["image", "text"]
                };
                
                const fallbackData = await fetchOpenRouterWithBackoff(fallbackPayload, apiKey, 2);
                    console.log(`📊 后备模型 ${fallbackModel} 响应:`, JSON.stringify(fallbackData, null, 2));
                    const fallbackMessage = fallbackData.choices?.[0]?.message;
                    
                    const fallbackImageResult = checkForImage(fallbackMessage);
                    if (fallbackImageResult) {
                        console.log(`✅ 后备模型 ${fallbackModel} 成功生成图片`);
                        return { ...fallbackImageResult, meta: { usedFallback: true, modelName: fallbackModel } };
                    }
            } catch (fallbackError) {
                console.warn(`❌ 后备模型 ${fallbackModel} 失败:`, fallbackError.message);
                continue; // 尝试下一个后备模型
            }
        }
    }
    
    // 如果所有尝试都失败，返回文字内容并添加提示
    const finalContent = typeof message?.content === 'string' && message.content.trim() !== '' 
        ? message.content 
        : "[所有模型都未能生成图片，请尝试调整提示词或稍后重试]";
    
    console.log("❌ 所有图像生成尝试都失败了");
    return { type: 'text', content: finalContent, meta: { usedFallback: false, modelName: "google/gemini-3-pro-image-preview" } };
    } finally { releaseOpenRouterSlot(); }
}

// --- 主服务逻辑 ---
serve(async (req: Request) => {
    const pathname = new URL(req.url).pathname;
    
    if (req.method === 'OPTIONS') { return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization, x-goog-api-key" } }); }

    // --- 路由 1: Cherry Studio (Gemini, 流式) ---
    if (pathname.includes(":streamGenerateContent")) {
        try {
            const geminiRequest = await req.json();
            let apiKey = req.headers.get("Authorization")?.replace("Bearer ", "") || req.headers.get("x-goog-api-key") || "";
            if (!apiKey) { return createJsonErrorResponse("API key is missing.", 401); }
            if (!geminiRequest.contents?.length) { return createJsonErrorResponse("Invalid request: 'contents' array is missing.", 400); }
            
            // --- 智能提取逻辑 ---
            const fullHistory = geminiRequest.contents;
            const lastUserMessageIndex = fullHistory.findLastIndex((msg: any) => msg.role === 'user');
            let relevantHistory = (lastUserMessageIndex !== -1) ? fullHistory.slice(fullHistory.findLastIndex((msg: any, idx: number) => msg.role === 'model' && idx < lastUserMessageIndex), lastUserMessageIndex + 1) : [];
            if (relevantHistory.length === 0 && lastUserMessageIndex !== -1) relevantHistory = [fullHistory[lastUserMessageIndex]];
            if (relevantHistory.length === 0) return createJsonErrorResponse("No user message found.", 400);

            const openrouterMessages = relevantHistory.map((geminiMsg: any) => {
                const parts = geminiMsg.parts.map((p: any) => p.text ? {type: "text", text: p.text} : {type: "image_url", image_url: {url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`}});
                return { role: geminiMsg.role === 'model' ? 'assistant' : 'user', content: parts };
            });
            
            // --- 简化后的流处理 ---
            const stream = new ReadableStream({
                async start(controller) {
                    try {
                        const openRouterResult = await callOpenRouter(openrouterMessages, apiKey);
                        const sendChunk = (data: object) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
                        
                        let textToStream = (openRouterResult.type === 'image') ? "好的，图片已生成：" : openRouterResult.content;
                        for (const char of textToStream) {
                            sendChunk({ candidates: [{ content: { role: "model", parts: [{ text: char }] } }] });
                            await new Promise(r => setTimeout(r, 2));
                        }
                        
                        if (openRouterResult.type === 'image') {
                            const matches = openRouterResult.content.match(/^data:(.+);base64,(.*)$/);
                            if (matches) {
                                sendChunk({ candidates: [{ content: { role: "model", parts: [{ inlineData: { mimeType: matches[1], data: matches[2] } }] } }] });
                            }
                        }
                        
                        sendChunk({ candidates: [{ finishReason: "STOP", content: { role: "model", parts: [] } }], usageMetadata: { promptTokenCount: 264, totalTokenCount: 1578 } });
                        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
                    } catch (e) {
                        const msg = e instanceof Error ? e.message : String(e);
                        console.error("Error inside stream:", msg);
                        const errorChunk = { error: { message: msg, code: 500 } };
                        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(errorChunk)}\n\n`));
                    } finally {
                        controller.close();
                    }
                }
            });
            return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", "Access-Control-Allow-Origin": "*" } });
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return createJsonErrorResponse(msg, 500);
        }
    }

    if (pathname === "/generate-gemini") {
        try {
            let requestData: any = {};
            try { requestData = await req.json(); } catch (e) { return createJsonErrorResponse("Invalid JSON body", 400); }
            const { messageContent, parameters } = requestData || {};
            const aspect = parameters?.aspect_ratio || "16:9";
            const imageSize = parameters?.resolution === "2K" ? "2K" : "4K";
            const apiKey = safeEnvGet("GEMINI_API_KEY");
            if (!apiKey) { return createJsonErrorResponse("GEMINI_API_KEY is not set.", 500); }

            const parts = [] as any[];
            if (Array.isArray(messageContent)) {
                for (const item of messageContent) {
                    if (item && item.type === "text" && typeof item.text === "string") { parts.push({ text: item.text }); }
                    else if (item && item.type === "image_url" && item.image_url && typeof item.image_url.url === "string") {
                        const url: string = item.image_url.url;
                        const m = url.match(/^data:(.+);base64,(.*)$/);
                        if (m) { parts.push({ inlineData: { mimeType: m[1], data: m[2] } }); }
                    }
                }
            }

            const payload = {
                contents: [ { role: "user", parts } ],
                generationConfig: { responseModalities: ["TEXT","IMAGE"], imageConfig: { aspectRatio: aspect, imageSize } }
            };

            const resp = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
                body: JSON.stringify(payload)
            });
            if (!resp.ok) {
                let msg = "Gemini API error";
                try { const err = await resp.json(); msg = err?.error?.message || msg; } catch {}
                return createJsonErrorResponse(msg, 500);
            }
            const data = await resp.json();
            const candidates = data?.candidates || [];
            const content = candidates[0]?.content || {};
            const partsOut = content?.parts || [];
            for (const p of partsOut) {
                if (p.inlineData && p.inlineData.data && p.inlineData.mimeType) {
                    const imageUrl = `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`;
                    return new Response(JSON.stringify({ imageUrl, model: "gemini-3-pro-image-preview" }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
                }
            }
            for (const p of partsOut) {
                if (p.text) {
                    return new Response(JSON.stringify({ text: p.text, model: "gemini-3-pro-image-preview" }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
                }
            }
            return createJsonErrorResponse("No content returned", 500);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return createJsonErrorResponse(msg, 500);
        }
    }

    // --- 路由 2: Cherry Studio (Gemini, 非流式) ---
    if (pathname.includes(":generateContent")) {
        try {
            const geminiRequest = await req.json();
            let apiKey = req.headers.get("Authorization")?.replace("Bearer ", "") || req.headers.get("x-goog-api-key") || "";
            if (!apiKey) { return createJsonErrorResponse("API key is missing.", 401); }
            if (!geminiRequest.contents?.length) { return createJsonErrorResponse("Invalid request: 'contents' array is missing.", 400); }

            const fullHistory = geminiRequest.contents;
            const lastUserMessageIndex = fullHistory.findLastIndex((msg: any) => msg.role === 'user');
            let relevantHistory = (lastUserMessageIndex !== -1) ? fullHistory.slice(fullHistory.findLastIndex((msg: any, idx: number) => msg.role === 'model' && idx < lastUserMessageIndex), lastUserMessageIndex + 1) : [];
            if (relevantHistory.length === 0 && lastUserMessageIndex !== -1) relevantHistory = [fullHistory[lastUserMessageIndex]];
            if (relevantHistory.length === 0) return createJsonErrorResponse("No user message found.", 400);

            const openrouterMessages = relevantHistory.map((geminiMsg: any) => {
                const parts = geminiMsg.parts.map((p: any) => p.text ? {type: "text", text: p.text} : {type: "image_url", image_url: {url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`}});
                return { role: geminiMsg.role === 'model' ? 'assistant' : 'user', content: parts };
            });
            
            const openRouterResult = await callOpenRouter(openrouterMessages, apiKey);

            const finalParts = [];
            if (openRouterResult.type === 'image') {
                const matches = openRouterResult.content.match(/^data:(.+);base64,(.*)$/);
                if (matches) {
                    finalParts.push({ text: "好的，图片已生成：" });
                    finalParts.push({ inlineData: { mimeType: matches[1], data: matches[2] } });
                } else {
                    finalParts.push({ text: "[图片生成失败]" });
                }
            } else {
                finalParts.push({ text: openRouterResult.content });
            }
            const responsePayload = { candidates: [{ content: { role: "model", parts: finalParts }, finishReason: "STOP", index: 0 }], usageMetadata: { promptTokenCount: 264, totalTokenCount: 1578 } };
            return new Response(JSON.stringify(responsePayload), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            return createJsonErrorResponse(msg, 500);
        }
    }

    // --- 路由 3: 获取环境变量中的API密钥 (为前端自动填充) ---
    if (pathname === "/api/get-env-key") {
        try {
            const envApiKey = Deno.env.get("OPENROUTER_API_KEY");
            const googleApiKey = Deno.env.get("GEMINI_API_KEY");
            return new Response(JSON.stringify({ 
                hasEnvKey: !!envApiKey,
                apiKey: envApiKey || null,
                hasGoogleKey: !!googleApiKey,
                googleApiKey: googleApiKey || null
            }), {
                status: 200,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
        } catch (error) {
            return createJsonErrorResponse("Failed to get environment API key", 500);
        }
    }

    

    // --- 路由 4: 你的 Web UI (nano banana + ModelScope模型) ---
    if (pathname === "/generate") {
        try {
            let requestData: any = {};
            try {
                requestData = await req.json();
            } catch (e) {
                return createJsonErrorResponse("Invalid JSON body", 400);
            }
            const { model, apikey, prompt, images, parameters, timeout, conversationHistory } = requestData;
            
            // 如果没有指定模型或模型为nanobanana，使用原有的OpenRouter逻辑
            if (!model || model === 'nanobanana') {
                const openrouterApiKey = apikey || safeEnvGet("OPENROUTER_API_KEY");
                if (!openrouterApiKey) { 
                    return createJsonErrorResponse("OpenRouter API key is not set.", 500); 
                }
                if (!prompt) { 
                    return createJsonErrorResponse("Prompt is required.", 400); 
                }
                
                let webUiMessages;
                
                // 优先使用conversationHistory（多轮对话），否则使用传统的单轮对话格式
                if (conversationHistory && Array.isArray(conversationHistory) && conversationHistory.length > 0) {
                    console.log('🔄 使用多轮对话模式，历史消息数量:', conversationHistory.length);
                    webUiMessages = conversationHistory;
                } else {
                    console.log('📝 使用单轮对话模式（向后兼容）');
                    // 向后兼容：如果没有conversationHistory，使用原有的单消息格式
                    const imageArray = images || []; // 如果没有提供images，设置为空数组
                    
                    // 根据是否有图片构建不同的消息格式
                    let messageContent = [{type: "text", text: prompt}];
                    if (imageArray.length > 0) {
                        // 有图片时，添加图片到消息内容中
                        messageContent.push(...imageArray.map(img => ({type: "image_url", image_url: {url: img}})));
                    }
                    webUiMessages = [ { role: "user", content: messageContent } ];
                }
                
                // 调用OpenRouter API
                const result = await callOpenRouter(webUiMessages, openrouterApiKey);
                if (result && result.type === 'image') {
                    return new Response(JSON.stringify({ imageUrl: result.content, usedFallback: !!result.meta?.usedFallback, model: result.meta?.modelName || "google/gemini-3-pro-image-preview" }), { 
                        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
                    });
                } else {
                    return new Response(JSON.stringify({ text: result?.content || "", usedFallback: !!result?.meta?.usedFallback, model: result?.meta?.modelName || "google/gemini-3-pro-image-preview" }), { 
                        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
                    });
                }
            }
            // Flux 和 Krea 功能已移除
            else if (model === 'MusePublic/489_ckpt_FLUX_1' || model === 'black-forest-labs/FLUX.1-Krea-dev') {
                return createJsonErrorResponse("Unsupported model.", 400);
            }
            else {
                return createJsonErrorResponse("Unsupported model.", 400);
            }
            
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error("Error handling /generate request:", msg);
            
            return createJsonErrorResponse(msg, 500);
        }
    }

    // --- 路由 4: 静态文件服务 ---
    try {
        return await serveDir(req, { fsRoot: "static", urlRoot: "", showDirListing: true, enableCors: true });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("Static file serving error:", msg);
        return new Response("Internal static file server error", { status: 500, headers: { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" } });
    }
});
