const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const os = require('os');
const multer = require('multer');
const fs = require('fs');
const readline = require('readline');

const app = express();
const PORT = 9999;

// 全局错误处理
process.on('uncaughtException', (error) => {
    console.error('\n❌ 程序遇到未处理的异常:');
    console.error(error.message);
    console.error('\n详细错误信息:');
    console.error(error.stack);
    waitForUserInput('按任意键退出...');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('\n❌ 程序遇到未处理的 Promise 拒绝:');
    console.error('原因:', reason);
    waitForUserInput('按任意键退出...');
});

// 等待用户输入的辅助函数
function waitForUserInput(message) {
    if (process.pkg) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        console.log('\n' + '='.repeat(60));
        console.log(message);
        console.log('='.repeat(60));
        
        rl.question('', () => {
            rl.close();
            process.exit(1);
        });
    } else {
        console.log(message);
        process.exit(1);
    }
}

// 中间件配置
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 静态文件服务
if (process.pkg) {
    // 在打包环境中，从 exe 内部提供静态文件
    // pkg 会将 public 目录打包到快照中，路径为 __dirname/public
    const publicPath = path.join(__dirname, 'public');
    console.log(`📁 静态文件路径: ${publicPath}`);
    app.use(express.static(publicPath));
} else {
    // 在开发环境中，使用项目目录
    app.use(express.static('public'));
}

// 内存存储文本内容
let textMessages = [];
let messageId = 1;

// 内存存储文件信息
let uploadedFiles = [];
let fileId = 1;

// 创建uploads目录
let uploadsDir;
if (process.pkg) {
    // 在打包环境中，使用 exe 文件所在目录下的 LocalDrop 文件夹
    const exeDir = path.dirname(process.execPath);
    uploadsDir = path.join(exeDir, 'LocalDrop', 'uploads');
} else {
    // 在开发环境中，使用项目目录
    uploadsDir = path.join(__dirname, 'uploads');
}

// 确保目录存在
if (!fs.existsSync(uploadsDir)) {
    try {
        fs.mkdirSync(uploadsDir, { recursive: true });
        console.log(`📁 创建上传目录: ${uploadsDir}`);
    } catch (error) {
        console.error('❌ 无法创建上传目录:', error.message);
        // 如果无法创建用户目录，尝试使用临时目录
        uploadsDir = path.join(os.tmpdir(), 'LocalDrop', 'uploads');
        try {
            fs.mkdirSync(uploadsDir, { recursive: true });
            console.log(`📁 使用临时目录: ${uploadsDir}`);
        } catch (tmpError) {
            console.error('❌ 无法创建临时目录:', tmpError.message);
            throw new Error('无法创建文件上传目录，请检查权限设置');
        }
    }
}

// 配置multer文件上传
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        // 生成唯一文件名：时间戳_原文件名
        const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '_' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 限制文件大小为50MB
    },
    fileFilter: function (req, file, cb) {
        // 允许所有文件类型，但可以在这里添加限制
        cb(null, true);
    }
});

// 获取本机IP地址
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

// 路由配置

// 主页路由
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 获取所有文本消息
app.get('/api/messages', (req, res) => {
    res.json({
        success: true,
        data: textMessages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    });
});

// 提交新的文本消息
app.post('/api/messages', (req, res) => {
    const { content, author } = req.body;
    
    if (!content || content.trim() === '') {
        return res.status(400).json({
            success: false,
            message: '文本内容不能为空'
        });
    }
    
    const newMessage = {
        id: messageId++,
        content: content.trim(),
        author: author || '匿名用户',
        timestamp: new Date().toISOString(),
        ip: req.ip || req.connection.remoteAddress
    };
    
    textMessages.push(newMessage);
    
    res.json({
        success: true,
        message: '提交成功',
        data: newMessage
    });
});

// 删除消息
app.delete('/api/messages/:id', (req, res) => {
    const messageId = parseInt(req.params.id);
    const messageIndex = textMessages.findIndex(msg => msg.id === messageId);
    
    if (messageIndex === -1) {
        return res.status(404).json({
            success: false,
            message: '消息不存在'
        });
    }
    
    textMessages.splice(messageIndex, 1);
    
    res.json({
        success: true,
        message: '删除成功'
    });
});

// 清空所有消息
app.delete('/api/messages', (req, res) => {
    textMessages = [];
    messageId = 1;
    
    res.json({
        success: true,
        message: '已清空所有消息'
    });
});

// 文件上传路由
app.post('/api/files', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: '没有选择文件'
        });
    }
    
    const newFile = {
        id: fileId++,
        originalName: req.file.originalname,
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype,
        uploader: req.body.uploader || '匿名用户',
        timestamp: new Date().toISOString(),
        ip: req.ip || req.connection.remoteAddress
    };
    
    uploadedFiles.push(newFile);
    
    res.json({
        success: true,
        message: '文件上传成功',
        data: newFile
    });
});

// 获取所有文件
app.get('/api/files', (req, res) => {
    res.json({
        success: true,
        data: uploadedFiles.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    });
});

// 下载文件
app.get('/api/files/:id/download', (req, res) => {
    const fileId = parseInt(req.params.id);
    const file = uploadedFiles.find(f => f.id === fileId);
    
    if (!file) {
        return res.status(404).json({
            success: false,
            message: '文件不存在'
        });
    }
    
    const filePath = path.join(uploadsDir, file.filename);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            message: '文件已丢失'
        });
    }
    
    res.download(filePath, file.originalName);
});

// 删除文件
app.delete('/api/files/:id', (req, res) => {
    const fileId = parseInt(req.params.id);
    const fileIndex = uploadedFiles.findIndex(f => f.id === fileId);
    
    if (fileIndex === -1) {
        return res.status(404).json({
            success: false,
            message: '文件不存在'
        });
    }
    
    const file = uploadedFiles[fileIndex];
    const filePath = path.join(uploadsDir, file.filename);
    
    // 删除物理文件
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
    
    // 从数组中删除
    uploadedFiles.splice(fileIndex, 1);
    
    res.json({
        success: true,
        message: '文件删除成功'
    });
});

// 清空所有文件
app.delete('/api/files', (req, res) => {
    // 删除所有物理文件
    uploadedFiles.forEach(file => {
        const filePath = path.join(uploadsDir, file.filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    });
    
    uploadedFiles = [];
    fileId = 1;
    
    res.json({
        success: true,
        message: '已清空所有文件'
    });
});

// 显示启动信息
function showStartupInfo() {
    console.clear();
    console.log('══════════════════════════════════════════════════════════════');
    console.log('                    🚀 LocalDrop 服务启动器                    ');
    console.log('                                                              ');
    console.log('  📝 功能: 局域网内容分享平台                                  ');
    console.log('  🌐 支持: 文本消息分享和文件上传下载                          ');
    console.log('  📱 兼容: 支持手机、平板、电脑等设备访问                      ');
    console.log('                                                            ');
    console.log('  📁 文件存储位置:');
    if (process.pkg) {
        const exeDir = path.dirname(process.execPath);
        const uploadPath = path.join(exeDir, 'LocalDrop', 'uploads');
        console.log(`     ${uploadPath.padEnd(58)} `);
    } else {
        console.log(`     ${uploadsDir.padEnd(58)} `);
    }
    console.log('                                                              ');
    console.log('  ⚠️  注意事项:                                               ');
    console.log('     • 确保防火墙允许 9999 端口访问                            ');
    console.log('     • 服务重启后数据会清空（内存存储）                        ');
    console.log('     • 文件最大支持 50MB                                      ');
    console.log('     • 上传的文件保存在上述目录中                             ');
    console.log('                                                              ');
    console.log('  🎯 即将启动服务，请稍候...                                  ');
    console.log('══════════════════════════════════════════════════════════════');
    console.log('');
}

// 启动服务器
function startServer() {
    try {
        const server = app.listen(PORT, '0.0.0.0', () => {
            const localIP = getLocalIP();
            console.log('══════════════════════════════════════════════════════════════');
            console.log('                    ✅ 服务启动成功!                          ');
            console.log('                                                              ');
            console.log(`  📱 本机访问: http://localhost:${PORT}                        `);
            console.log(`  🌐 局域网访问: http://${localIP}:${PORT}                     `);
            console.log('                                                              ');
            console.log('  💡 提示:                                                    ');
            console.log('     • 局域网内其他设备可通过局域网地址访问                  ');
            console.log('     • 按 Ctrl+C 停止服务                                    ');
            console.log('     • 关闭此窗口将停止服务                                  ');
            console.log('                                                              ');
            console.log('  🎉 开始使用 LocalDrop 吧!                                 ');
            console.log('══════════════════════════════════════════════════════════════');
            console.log('');
        });

        // 处理服务器错误
        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                console.error('\n❌ 端口 9999 已被占用!');
                console.error('请关闭占用该端口的程序，或修改 server.js 中的 PORT 变量。');
            } else if (error.code === 'EACCES') {
                console.error('\n❌ 权限不足，无法绑定端口 9999!');
                console.error('请以管理员身份运行程序。');
            } else {
                console.error('\n❌ 服务器启动失败:');
                console.error(error.message);
            }
            waitForUserInput('按任意键退出...');
        });

    } catch (error) {
        console.error('\n❌ 创建服务器时发生错误:');
        console.error(error.message);
        waitForUserInput('按任意键退出...');
    }
}

// 检查是否为可执行文件环境
if (process.pkg) {
    // 在打包后的 exe 中，显示启动信息并启动
    try {
        showStartupInfo();
        setTimeout(() => {
            try {
                startServer();
            } catch (error) {
                console.error('\n❌ 启动服务器时发生错误:');
                console.error(error.message);
                console.error('\n可能的原因:');
                console.error('• 端口 9999 已被其他程序占用');
                console.error('• 防火墙阻止了程序访问网络');
                console.error('• 权限不足');
                console.error('\n请检查上述问题后重试。');
                waitForUserInput('按任意键退出...');
            }
        }, 2000); // 等待2秒让用户看到启动信息
    } catch (error) {
        console.error('\n❌ 程序初始化时发生错误:');
        console.error(error.message);
        console.error('\n详细错误信息:');
        console.error(error.stack);
        waitForUserInput('按任意键退出...');
    }
} else {
    // 在开发环境中，直接启动
    try {
        startServer();
    } catch (error) {
        console.error('启动失败:', error.message);
        process.exit(1);
    }
}
