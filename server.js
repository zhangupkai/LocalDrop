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
const crypto = require('crypto');

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

// ─── Data persistence ───────────────────────────────────────────────────────
const dataDir = path.join(path.dirname(uploadsDir), 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dataFiles = {
    messages: path.join(dataDir, 'messages.json'),
    files: path.join(dataDir, 'files.json'),
    users: path.join(dataDir, 'users.json'),
};

function loadJSON(filePath, fallback) {
    try {
        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(raw);
        }
    } catch (err) {
        console.warn(`Warning: failed to load ${filePath}, using fallback. Error: ${err.message}`);
    }
    return fallback;
}

function createDebouncedSaver(filePath) {
    let timer = null;
    return function save(data) {
        clearTimeout(timer);
        timer = setTimeout(() => {
            const tmpPath = filePath + '.tmp';
            const json = JSON.stringify(data, null, 2);
            fs.writeFile(tmpPath, json, (err) => {
                if (err) {
                    console.error(`Failed to write ${tmpPath}:`, err.message);
                    return;
                }
                fs.rename(tmpPath, filePath, (err2) => {
                    if (err2) console.error(`Failed to rename ${tmpPath}:`, err2.message);
                });
            });
        }, 500);
    };
}

// ─── In-memory storage (loaded from disk) ───────────────────────────────────
let textMessages = loadJSON(dataFiles.messages, []);
let messageId = textMessages.length > 0 ? Math.max(...textMessages.map(m => m.id)) + 1 : 1;

let uploadedFiles = loadJSON(dataFiles.files, []);
let fileId = uploadedFiles.length > 0 ? Math.max(...uploadedFiles.map(f => f.id)) + 1 : 1;

let users = loadJSON(dataFiles.users, {});

const saveMessages = createDebouncedSaver(dataFiles.messages);
const saveFiles = createDebouncedSaver(dataFiles.files);
const saveUsers = createDebouncedSaver(dataFiles.users);

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

// ─── Identity middleware ─────────────────────────────────────────────────────
function stripHtml(str) {
    return String(str).replace(/<[^>]*>/g, '');
}

app.use('/api', (req, res, next) => {
    let token = req.cookies.token;
    if (!token) {
        token = crypto.randomUUID();
        res.cookie('token', token, {
            httpOnly: true,
            maxAge: 365 * 24 * 60 * 60 * 1000,
            sameSite: 'lax',
        });
    }
    if (!users[token]) {
        users[token] = {
            publicId: crypto.randomUUID(),
            nickname: '',
            createdAt: new Date().toISOString(),
        };
        saveUsers(users);
    }
    req.userToken = token;
    req.publicId = users[token].publicId;
    req.nickname = users[token].nickname || '匿名用户';
    next();
});

// ─── User routes ────────────────────────────────────────────────────────────
app.get('/api/user', (req, res) => {
    res.json({
        success: true,
        data: {
            publicId: req.publicId,
            nickname: users[req.userToken].nickname,
        }
    });
});

app.post('/api/user/nickname', (req, res) => {
    let { nickname } = req.body;
    if (!nickname || typeof nickname !== 'string') {
        return res.status(400).json({ success: false, message: '昵称不能为空' });
    }
    nickname = stripHtml(nickname.trim()).slice(0, 20);
    if (!nickname) {
        return res.status(400).json({ success: false, message: '昵称不能为空' });
    }
    users[req.userToken].nickname = nickname;
    saveUsers(users);
    res.json({ success: true, data: { nickname } });
});

// ─── Admin state ────────────────────────────────────────────────────────────
const adminSessions = new Map(); // token → { createdAt }
const loginAttempts = new Map(); // ip → { count, lastAttempt }

// Clean up expired login attempts every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of loginAttempts) {
        if (now - data.lastAttempt > 60000) loginAttempts.delete(ip);
    }
}, 5 * 60 * 1000);

// Admin middleware: check admin session
app.use('/api', (req, res, next) => {
    req.isAdmin = false;
    const adminToken = req.cookies.adminToken;
    if (adminToken && adminSessions.has(adminToken)) {
        const session = adminSessions.get(adminToken);
        if (Date.now() - new Date(session.createdAt).getTime() < config.ADMIN_SESSION_TTL) {
            req.isAdmin = true;
        } else {
            adminSessions.delete(adminToken);
            res.clearCookie('adminToken');
        }
    }
    next();
});

// ─── Admin routes ───────────────────────────────────────────────────────────
app.post('/api/admin/login', (req, res) => {
    if (!config.ADMIN_KEY) {
        return res.status(404).json({ success: false, message: '管理员功能未启用' });
    }

    // Rate limiting
    const ip = req.ip;
    const now = Date.now();
    const attempts = loginAttempts.get(ip);
    if (attempts) {
        if (now - attempts.lastAttempt < 60000 && attempts.count >= 5) {
            return res.status(429).json({ success: false, message: '尝试次数过多，请稍后再试' });
        }
        if (now - attempts.lastAttempt > 60000) {
            loginAttempts.delete(ip);
        }
    }

    const { key } = req.body;
    if (!key || typeof key !== 'string') {
        return res.status(400).json({ success: false, message: '请提供密钥' });
    }

    const keyBuffer = Buffer.from(key);
    const adminBuffer = Buffer.from(config.ADMIN_KEY);
    const valid = keyBuffer.length === adminBuffer.length &&
        crypto.timingSafeEqual(keyBuffer, adminBuffer);

    if (!valid) {
        const entry = loginAttempts.get(ip) || { count: 0, lastAttempt: now };
        entry.count++;
        entry.lastAttempt = now;
        loginAttempts.set(ip, entry);
        return res.status(401).json({ success: false, message: '密钥错误' });
    }

    // Success — reset attempts, create session
    loginAttempts.delete(ip);
    const adminToken = crypto.randomUUID();
    adminSessions.set(adminToken, { createdAt: new Date().toISOString() });
    res.cookie('adminToken', adminToken, {
        httpOnly: true,
        maxAge: config.ADMIN_SESSION_TTL,
        sameSite: 'lax',
    });
    res.json({ success: true, message: '管理员登录成功' });
});

app.post('/api/admin/logout', (req, res) => {
    const adminToken = req.cookies.adminToken;
    if (adminToken) {
        adminSessions.delete(adminToken);
        res.clearCookie('adminToken');
    }
    res.json({ success: true, message: '已登出' });
});

app.get('/api/admin/status', (req, res) => {
    res.json({ success: true, data: { isAdmin: req.isAdmin } });
});

app.get('/api/admin/stats', (req, res) => {
    if (!req.isAdmin) {
        return res.status(403).json({ success: false, message: '需要管理员权限' });
    }
    const totalStorage = uploadedFiles.reduce((sum, f) => sum + (f.size || 0), 0);
    res.json({
        success: true,
        data: {
            messageCount: textMessages.length,
            fileCount: uploadedFiles.length,
            totalStorage,
            userCount: Object.keys(users).length,
        }
    });
});

// ─── Helper: strip private fields for API responses ─────────────────────────
function sanitizeRecord(record, reqUserToken) {
    const { ownerToken, ip, ...safe } = record;
    safe.isOwner = ownerToken === reqUserToken;
    return safe;
}

// ─── SSE (Server-Sent Events) ──────────────────────────────────────────────
const sseClients = [];

function sanitizeForBroadcast(records) {
    return records.map(({ ownerToken, ip, ...safe }) => safe);
}

function broadcast(eventType) {
    if (sseClients.length === 0) return;

    let data;
    if (eventType === 'messages-updated') {
        const sorted = [...textMessages].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        data = sanitizeForBroadcast(sorted);
    } else if (eventType === 'files-updated') {
        const sorted = [...uploadedFiles].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        data = sanitizeForBroadcast(sorted);
    }

    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;

    for (let i = sseClients.length - 1; i >= 0; i--) {
        try {
            sseClients[i].write(payload);
        } catch (err) {
            sseClients.splice(i, 1);
        }
    }
}

// ─── Storage management ─────────────────────────────────────────────────────
const activeDownloads = new Map(); // fileId → count

function getTotalStorage() {
    return uploadedFiles.reduce((sum, f) => sum + (f.size || 0), 0);
}

function cleanExpiredData() {
    if (config.EXPIRE_DAYS <= 0) return;
    const cutoff = Date.now() - config.EXPIRE_DAYS * 24 * 60 * 60 * 1000;
    let messagesChanged = false;
    let filesChanged = false;

    // Clean messages
    const beforeMsgCount = textMessages.length;
    textMessages = textMessages.filter(m => new Date(m.timestamp).getTime() > cutoff);
    if (textMessages.length !== beforeMsgCount) {
        messagesChanged = true;
        saveMessages(textMessages);
    }

    // Clean files (skip actively downloading)
    const beforeFileCount = uploadedFiles.length;
    const toRemove = uploadedFiles.filter(f => {
        if (new Date(f.timestamp).getTime() > cutoff) return false;
        if ((activeDownloads.get(f.id) || 0) > 0) return false;
        return true;
    });

    for (const file of toRemove) {
        const filePath = path.join(uploadsDir, file.filename);
        if (fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
        }
    }

    if (toRemove.length > 0) {
        const removeIds = new Set(toRemove.map(f => f.id));
        uploadedFiles = uploadedFiles.filter(f => !removeIds.has(f.id));
        filesChanged = true;
        saveFiles(uploadedFiles);
    }

    if (messagesChanged) broadcast('messages-updated');
    if (filesChanged) broadcast('files-updated');

    if (messagesChanged || filesChanged) {
        console.log(`Cleanup: removed ${beforeMsgCount - textMessages.length} messages, ${toRemove.length} files`);
    }
}

// Run cleanup on startup and every hour
cleanExpiredData();
setInterval(cleanExpiredData, 60 * 60 * 1000);

// ─── SSE endpoint ──────────────────────────────────────────────────────────
app.get('/api/events', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    // Send initial data
    const sortedMessages = [...textMessages].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const sortedFiles = [...uploadedFiles].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const initPayload = {
        messages: sanitizeForBroadcast(sortedMessages),
        files: sanitizeForBroadcast(sortedFiles),
    };
    res.write(`event: init\ndata: ${JSON.stringify(initPayload)}\n\n`);

    sseClients.push(res);

    req.on('close', () => {
        const idx = sseClients.indexOf(res);
        if (idx !== -1) sseClients.splice(idx, 1);
    });
});

// ─── Routes ─────────────────────────────────────────────────────────────────

// Home
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Admin page
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Get all messages
app.get('/api/messages', (req, res) => {
    const sorted = textMessages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json({
        success: true,
        data: sorted.map(m => sanitizeRecord(m, req.userToken))
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
        author: req.nickname,
        ownerToken: req.userToken,
        ownerPublicId: req.publicId,
        timestamp: new Date().toISOString(),
    };

    textMessages.push(newMessage);
    saveMessages(textMessages);
    broadcast('messages-updated');

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
        return res.status(404).json({ success: false, message: '消息不存在' });
    }

    const msg = textMessages[messageIndex];
    if (!req.isAdmin && msg.ownerToken !== req.userToken) {
        return res.status(403).json({ success: false, message: '无权限删除他人的消息' });
    }

    textMessages.splice(messageIndex, 1);
    saveMessages(textMessages);
    broadcast('messages-updated');

    res.json({ success: true, message: '删除成功' });
});

// Clear all messages (admin only)
app.delete('/api/messages', (req, res) => {
    if (!req.isAdmin) {
        return res.status(403).json({ success: false, message: '需要管理员权限' });
    }
    textMessages = [];
    messageId = 1;
    saveMessages(textMessages);
    broadcast('messages-updated');

    res.json({ success: true, message: '已清空所有消息' });
});

// Upload file — with quota pre-check and post-check
function quotaPreCheck(req, res, next) {
    const contentLength = parseInt(req.headers['content-length'], 10);
    if (contentLength && (getTotalStorage() + contentLength > config.MAX_TOTAL_STORAGE)) {
        return res.status(413).json({
            success: false,
            message: `存储空间不足。当前已用 ${formatBytes(getTotalStorage())}，上限 ${formatBytes(config.MAX_TOTAL_STORAGE)}`
        });
    }
    next();
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

app.post('/api/files', quotaPreCheck, upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: '没有选择文件'
        });
    }

    // Post-upload precise quota check
    if (getTotalStorage() + req.file.size > config.MAX_TOTAL_STORAGE) {
        // Over quota — delete the uploaded file
        const filePath = path.join(uploadsDir, req.file.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        return res.status(413).json({
            success: false,
            message: `存储空间不足。当前已用 ${formatBytes(getTotalStorage())}，上限 ${formatBytes(config.MAX_TOTAL_STORAGE)}`
        });
    }

    const newFile = {
        id: fileId++,
        originalName: req.file.originalname,
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype,
        uploader: req.nickname,
        ownerToken: req.userToken,
        ownerPublicId: req.publicId,
        timestamp: new Date().toISOString(),
    };

    uploadedFiles.push(newFile);
    saveFiles(uploadedFiles);
    broadcast('files-updated');

    res.json({
        success: true,
        message: '文件上传成功',
        data: newFile
    });
});

// Get all files
app.get('/api/files', (req, res) => {
    const sorted = uploadedFiles.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json({
        success: true,
        data: sorted.map(f => sanitizeRecord(f, req.userToken))
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

    // Track active downloads for cleanup protection
    activeDownloads.set(file.id, (activeDownloads.get(file.id) || 0) + 1);
    const onFinish = () => {
        const count = (activeDownloads.get(file.id) || 1) - 1;
        if (count <= 0) activeDownloads.delete(file.id);
        else activeDownloads.set(file.id, count);
    };
    res.on('finish', onFinish);
    res.on('close', onFinish);

    res.download(filePath, file.originalName);
});

// Delete single file
app.delete('/api/files/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const fileIndex = uploadedFiles.findIndex(f => f.id === id);

    if (fileIndex === -1) {
        return res.status(404).json({ success: false, message: '文件不存在' });
    }

    const file = uploadedFiles[fileIndex];
    if (!req.isAdmin && file.ownerToken !== req.userToken) {
        return res.status(403).json({ success: false, message: '无权限删除他人的文件' });
    }

    const filePath = path.join(uploadsDir, file.filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }

    uploadedFiles.splice(fileIndex, 1);
    saveFiles(uploadedFiles);
    broadcast('files-updated');

    res.json({ success: true, message: '文件删除成功' });
});

// Clear all files (admin only)
app.delete('/api/files', (req, res) => {
    if (!req.isAdmin) {
        return res.status(403).json({ success: false, message: '需要管理员权限' });
    }
    uploadedFiles.forEach(file => {
        const filePath = path.join(uploadsDir, file.filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    });

    uploadedFiles = [];
    fileId = 1;
    saveFiles(uploadedFiles);
    broadcast('files-updated');

    res.json({ success: true, message: '已清空所有文件' });
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
