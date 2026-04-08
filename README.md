# LocalDrop - 局域网内容分享平台

一个 Node.js 局域网内容分享工具，支持多人共用。通过 Web 界面分享文本和文件，免登录、实时同步、权限隔离。

## 功能特性

- 🌐 **局域网访问**: 支持局域网内所有设备访问
- 📝 **文本分享**: 提交和查看文本内容
- 📁 **文件上传**: 支持文件上传和下载（最大 5GB，可配置）
- 📊 **上传进度**: 大文件上传显示进度条，支持取消
- 🖼️ **图片预览**: 支持图片文件在线预览
- 👤 **免登录身份**: Cookie 自动识别用户，首次访问设置昵称
- 🔐 **权限隔离**: 用户仅能删除自己的内容，他人内容仅可查看/下载
- 🛡️ **管理员模式**: 通过密钥激活，可清空全部内容、查看统计
- ⚡ **实时推送**: SSE 实时推送，无需手动刷新
- 💾 **数据持久化**: JSON 文件存储，服务重启后数据不丢失
- 🗑️ **自动清理**: 过期内容自动清理（默认 7 天），存储配额保护
- 📱 **响应式设计**: 支持手机、平板等移动设备
- ⌨️ **快捷键支持**: 支持键盘快捷键操作
- 🎨 **拖拽上传**: 支持拖拽文件到上传区域

## 快速开始

### 安装

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 服务器部署

#### 1. 上传项目到服务器

```bash
# 方式一：git clone
git clone <repo-url> /opt/localdrop
cd /opt/localdrop
npm install --production

# 方式二：打包上传
# 本地打包（不含 node_modules）后上传到服务器
scp -r ./ user@server:/opt/localdrop
ssh user@server "cd /opt/localdrop && npm install --production"
```

#### 2. 配置环境变量

```bash
cp .env.example .env
vi .env
```

必须配置的项：
```bash
ADMIN_KEY=your-secret-key-here   # 管理员密钥，多人使用时必须设置
```

可选配置：
```bash
PORT=9999                         # 服务端口
UPLOADS_DIR=./uploads             # 文件存储路径
MAX_FILE_SIZE=5368709120          # 单文件上限（默认 5GB）
MAX_TOTAL_STORAGE=53687091200     # 总存储上限（默认 50GB）
EXPIRE_DAYS=7                     # 内容自动过期天数
```

#### 3. 使用 PM2 启动

```bash
# 全局安装 PM2（一次性操作）
npm install -g pm2

# 启动服务
npm run pm2:start

# 查看运行状态
pm2 list

# 设置开机自启（按提示执行生成的命令）
pm2 startup
pm2 save
```

#### 4. 防火墙放行

```bash
# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=9999/tcp
sudo firewall-cmd --reload

# Ubuntu/Debian
sudo ufw allow 9999/tcp
```

#### 5. 可选：Nginx 反向代理

如需通过 80/443 端口访问或添加 HTTPS：

```nginx
server {
    listen 80;
    server_name localdrop.internal;

    location / {
        proxy_pass http://127.0.0.1:9999;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;

        # SSE 必须关闭缓冲
        proxy_buffering off;
        proxy_read_timeout 86400s;
    }

    client_max_body_size 5g;  # 与 MAX_FILE_SIZE 一致
}
```

### 访问

启动后，控制台会显示访问地址：

- **本机访问**: http://localhost:9999
- **局域网访问**: http://[你的IP地址]:9999

## 配置

通过 `.env` 文件或环境变量配置（参考 `.env.example`）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 9999 | 服务端口 |
| `UPLOADS_DIR` | ./uploads | 文件存储目录 |
| `ADMIN_KEY` | _(空)_ | 管理员密钥，未设置则管理功能不可用 |
| `ADMIN_SESSION_TTL` | 4 | 管理员 session 有效期（小时） |
| `MAX_FILE_SIZE` | 5368709120 | 单文件大小上限（字节，默认 5GB） |
| `MAX_TOTAL_STORAGE` | 53687091200 | 总存储上限（字节，默认 50GB） |
| `EXPIRE_DAYS` | 7 | 内容自动过期天数 |

## 使用说明

### 文本分享

1. 首次访问时设置昵称（自动保存，同设备无需重复设置）
2. 在"文本"标签页输入内容并提交
3. 提交后所有在线用户实时看到新消息

### 文件分享

1. 在"文件"标签页选择文件或拖拽文件到上传区域
2. 大文件上传时显示进度条，可随时取消
3. 上传后所有在线用户实时看到新文件

### 权限说明

- **普通用户**: 可查看/下载所有内容，仅能删除自己发布的消息和文件
- **管理员**: 点击页面底部"管理员"按钮，输入密钥登录后可删除任意内容、清空全部、查看统计

### 快捷键

- `Ctrl + R` / `F5`: 刷新（重连 SSE）
- `Ctrl + Enter`: 在文本框中提交消息
- `ESC`: 关闭图片预览弹窗

## PM2 运维手册

### 常用命令

```bash
npm run pm2:start      # 启动服务
npm run pm2:stop       # 停止服务
npm run pm2:restart    # 重启服务
npm run pm2:logs       # 查看实时日志
```

### 直接使用 PM2 命令

```bash
pm2 list               # 查看所有进程状态
pm2 monit              # 实时监控（CPU/内存）
pm2 logs localdrop     # 查看日志（Ctrl+C 退出）
pm2 logs localdrop --lines 100  # 查看最近 100 行日志
pm2 restart localdrop  # 重启
pm2 reload localdrop   # 零停机重载
pm2 delete localdrop   # 删除进程
```

### 更新部署

```bash
cd /opt/localdrop
git pull                # 拉取最新代码
npm install --production
pm2 restart localdrop   # 重启生效
```

### 数据备份

```bash
# 备份持久化数据和上传文件
tar -czf localdrop-backup-$(date +%Y%m%d).tar.gz data/ uploads/
```

## 技术栈

- **后端**: Node.js + Express
- **前端**: HTML5 + CSS3 + Vanilla JavaScript
- **身份**: HTTP-only Cookie（token + publicId 双 ID 设计）
- **实时推送**: Server-Sent Events (SSE)
- **持久化**: JSON 文件（防抖写入 + write-to-temp-then-rename 原子性）
- **进程管理**: PM2
- **依赖**: cookie-parser, dotenv, morgan, multer, cors, body-parser

## 项目结构

```
LocalDrop/
├── server.js              # 主服务器（API + 中间件 + SSE + 存储管理）
├── ecosystem.config.js    # PM2 配置
├── .env.example           # 环境变量模板
├── package.json           # 项目配置和依赖
├── public/                # 静态文件
│   ├── index.html         # 主页面
│   ├── style.css          # 样式
│   └── script.js          # 前端逻辑（SSE + 身份 + 管理员 UI）
├── data/                  # 持久化数据（自动创建）
│   ├── messages.json
│   ├── files.json
│   └── users.json
├── uploads/               # 上传文件存储
└── docs/                  # 文档
    ├── brainstorms/       # 需求探索
    └── plans/             # 实施计划
```

## API 接口

### 用户
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/user` | 获取当前用户 publicId 和昵称 |
| POST | `/api/user/nickname` | 设置/更新昵称 |

### 消息
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/messages` | 获取所有消息（含 isOwner） |
| POST | `/api/messages` | 提交新消息 |
| DELETE | `/api/messages/:id` | 删除消息（仅 owner 或 admin） |
| DELETE | `/api/messages` | 清空所有消息（仅 admin） |

### 文件
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/files` | 获取所有文件（含 isOwner） |
| POST | `/api/files` | 上传文件 |
| GET | `/api/files/:id/download` | 下载文件 |
| DELETE | `/api/files/:id` | 删除文件（仅 owner 或 admin） |
| DELETE | `/api/files` | 清空所有文件（仅 admin） |

### 管理员
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/admin/login` | 管理员登录（限速 5 次/分钟/IP） |
| POST | `/api/admin/logout` | 管理员登出 |
| GET | `/api/admin/status` | 检查管理员状态 |
| GET | `/api/admin/stats` | 获取统计信息（仅 admin） |

### 实时推送
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/events` | SSE 事件流（init / messages-updated / files-updated） |

## 安全设计

- **双 ID 隔离**: 用户 token（机密，HTTP-only cookie）与 publicId（非机密）分离，SSE 广播仅含 publicId
- **XSS 防护**: 昵称长度限制 + HTML 标签剥离，前端用 textContent 渲染用户内容
- **管理员安全**: timingSafeEqual 密钥比较，登录限速，session 自动过期
- **IP 隐私**: API 响应和 SSE 广播不包含用户 IP，仅保留在服务端日志

## 注意事项

- 多人部署时**必须设置 `ADMIN_KEY`**，否则孤儿内容只能等自动过期清理
- 用户清除 Cookie 或换浏览器后被视为新用户，历史内容成为孤儿（仅管理员可删）
- 如部署在 nginx 后需自行配置 SSE 透传（`proxy_buffering off`）
- 文件存储在 uploads 目录，JSON 数据在 data 目录，备份时需同时备份两者

## 许可证

MIT License
