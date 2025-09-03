const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const os = require('os');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = 9999;

// 中间件配置
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// 内存存储文本内容
let textMessages = [];
let messageId = 1;

// 内存存储文件信息
let uploadedFiles = [];
let fileId = 1;

// 创建uploads目录
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
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

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log('🚀 LocalDrop 服务已启动!');
    console.log(`📱 本机访问: http://localhost:${PORT}`);
    console.log(`🌐 局域网访问: http://${localIP}:${PORT}`);
    console.log(`📝 功能: 文本分享和文件上传`);
    console.log('按 Ctrl+C 停止服务');
});
