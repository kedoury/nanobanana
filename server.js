// 简单的Node.js HTTP服务器，用于测试前端功能
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8000;

// MIME类型映射
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    
    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // 处理OPTIONS预检请求
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // 处理API请求
    if (req.url === '/generate' && req.method === 'POST') {
        handleGenerateAPI(req, res);
        return;
    }
    
    // 处理根路径
    if (req.url === '/') {
        req.url = '/index.html';
    }
    
    // 构建文件路径
    let filePath = path.join(__dirname, 'static', req.url);
    
    // 检查文件是否存在
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            // 文件不存在，返回404
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 - 文件未找到');
            return;
        }
        
        // 获取文件扩展名
        const ext = path.extname(filePath).toLowerCase();
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        
        // 读取并返回文件
        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('500 - 服务器内部错误');
                return;
            }
            
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        });
    });
});

// 处理生成API请求
function handleGenerateAPI(req, res) {
    let body = '';
    
    req.on('data', chunk => {
        body += chunk.toString();
    });
    
    req.on('end', async () => {
        try {
            const requestData = JSON.parse(body);
            console.log('收到API请求:', {
                hasMessages: !!requestData.messages,
                messageCount: requestData.messages ? requestData.messages.length : 0,
                hasApiKey: !!requestData.apikey
            });
            
            // 验证请求数据
            if (!requestData.apikey) {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: '缺少API密钥' }));
                return;
            }
            
            // 支持新的messages格式和旧的prompt+images格式
            let messages = [];
            if (requestData.messages) {
                // 新格式：多轮对话
                messages = requestData.messages;
            } else if (requestData.prompt) {
                // 旧格式：单轮对话
                messages = [{
                    role: 'user',
                    content: requestData.prompt,
                    images: requestData.images || []
                }];
            } else {
                res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: '缺少消息内容' }));
                return;
            }
            
            // 模拟API调用（实际项目中这里应该调用真实的AI API）
            const response = await simulateAIResponse(messages, requestData.apikey);
            
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(response));
            
        } catch (error) {
            console.error('API处理错误:', error);
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: '服务器内部错误: ' + error.message }));
        }
    });
}

// 模拟AI响应（用于测试）
async function simulateAIResponse(messages, apiKey) {
    // 模拟处理延迟
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    
    const lastMessage = messages[messages.length - 1];
    const hasImages = lastMessage.images && lastMessage.images.length > 0;
    
    // 生成模拟响应
    let responseText = '';
    if (hasImages) {
        responseText = `我看到了您发送的${lastMessage.images.length}张图片。`;
        if (lastMessage.content) {
            responseText += `关于您的问题"${lastMessage.content}"，这是一个很有趣的话题。`;
        }
        responseText += '\n\n由于这是测试环境，我无法真正分析图片内容，但在实际部署中，AI将能够详细分析图片并提供相关回答。';
    } else {
        responseText = `收到您的消息："${lastMessage.content}"\n\n这是一个模拟回复。在实际部署中，这里将是AI的真实响应。当前对话包含${messages.length}条消息。`;
    }
    
    return {
        response: responseText,
        imageUrl: hasImages ? 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzQzOGVmZiIvPjx0ZXh0IHg9IjEwMCIgeT0iNTUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxNCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiPk1vY2sgSW1hZ2U8L3RleHQ+PC9zdmc+' : null
    };
}

server.listen(PORT, () => {
    console.log(`\n🚀 服务器已启动！`);
    console.log(`📱 本地访问: http://localhost:${PORT}`);
    console.log(`\n💡 注意: 这是一个简化的测试服务器，只用于展示前端功能`);
    console.log(`   API功能需要完整的Deno环境才能正常工作\n`);
});

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n👋 服务器正在关闭...');
    server.close(() => {
        console.log('✅ 服务器已关闭');
        process.exit(0);
    });
});
