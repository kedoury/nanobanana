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