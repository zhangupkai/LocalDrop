require('dotenv/config');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const path = require('path');
const os = require('os');
const multer = require('multer');
const fs = require('fs');

const app = express();

// ─── Configuration ──────────────────────────────────────────────────────────
const config = {
    PORT: parseInt(process.env.PORT, 10) || 9999,
    UPLOADS_DIR: process.env.UPLOADS_DIR
        ? path.resolve(process.env.UPLOADS_DIR)
        : path.join(__dirname, 'uploads'),
    ADMIN_KEY: process.env.ADMIN_KEY || '',
    ADMIN_SESSION_TTL: (parseInt(process.env.ADMIN_SESSION_TTL, 10) || 4) * 60 * 60 * 1000,
    MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE, 10) || 5 * 1024 * 1024 * 1024,
    MAX_TOTAL_STORAGE: parseInt(process.env.MAX_TOTAL_STORAGE, 10) || 50 * 1024 * 1024 * 1024,
    EXPIRE_DAYS: parseInt(process.env.EXPIRE_DAYS, 10) ?? 7,
};

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(morgan('combined'));
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// ─── Uploads directory ──────────────────────────────────────────────────────
const uploadsDir = config.UPLOADS_DIR;
if (!fs.existsSync(uploadsDir)) {
    try {
        fs.mkdirSync(uploadsDir, { recursive: true });
        console.log(`Created uploads directory: ${uploadsDir}`);
    } catch (error) {
        console.error('Failed to create uploads directory:', error.message);
        process.exit(1);
    }
}

// ─── In-memory storage ──────────────────────────────────────────────────────
let textMessages = [];
let messageId = 1;
let uploadedFiles = [];
let fileId = 1;

// ─── Multer config ──────────────────────────────────────────────────────────
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '_' + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: config.MAX_FILE_SIZE
    }
});

// ─── Helper: get local IP ───────────────────────────────────────────────────
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

// ─── Routes ─────────────────────────────────────────────────────────────────

// Home
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Get all messages
app.get('/api/messages', (req, res) => {
    res.json({
        success: true,
        data: textMessages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    });
});

// Post new message
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
    };

    textMessages.push(newMessage);

    res.json({
        success: true,
        message: '提交成功',
        data: newMessage
    });
});

// Delete single message
app.delete('/api/messages/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const messageIndex = textMessages.findIndex(msg => msg.id === id);

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

// Clear all messages
app.delete('/api/messages', (req, res) => {
    textMessages = [];
    messageId = 1;

    res.json({
        success: true,
        message: '已清空所有消息'
    });
});

// Upload file
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
    };

    uploadedFiles.push(newFile);

    res.json({
        success: true,
        message: '文件上传成功',
        data: newFile
    });
});

// Get all files
app.get('/api/files', (req, res) => {
    res.json({
        success: true,
        data: uploadedFiles.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    });
});

// Download file
app.get('/api/files/:id/download', (req, res) => {
    const id = parseInt(req.params.id);
    const file = uploadedFiles.find(f => f.id === id);

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

// Delete single file
app.delete('/api/files/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const fileIndex = uploadedFiles.findIndex(f => f.id === id);

    if (fileIndex === -1) {
        return res.status(404).json({
            success: false,
            message: '文件不存在'
        });
    }

    const file = uploadedFiles[fileIndex];
    const filePath = path.join(uploadsDir, file.filename);

    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }

    uploadedFiles.splice(fileIndex, 1);

    res.json({
        success: true,
        message: '文件删除成功'
    });
});

// Clear all files
app.delete('/api/files', (req, res) => {
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

// ─── Start server ───────────────────────────────────────────────────────────
const server = app.listen(config.PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log('══════════════════════════════════════════════════════════════');
    console.log('                    LocalDrop 服务已启动                      ');
    console.log('');
    console.log(`  本机访问:     http://localhost:${config.PORT}`);
    console.log(`  局域网访问:   http://${localIP}:${config.PORT}`);
    console.log(`  文件存储:     ${uploadsDir}`);
    console.log(`  管理员功能:   ${config.ADMIN_KEY ? '已启用' : '未配置 ADMIN_KEY'}`);
    console.log('');
    console.log('  按 Ctrl+C 停止服务');
    console.log('══════════════════════════════════════════════════════════════');
});

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${config.PORT} is already in use.`);
    } else if (error.code === 'EACCES') {
        console.error(`Permission denied for port ${config.PORT}.`);
    } else {
        console.error('Server error:', error.message);
    }
    process.exit(1);
});
