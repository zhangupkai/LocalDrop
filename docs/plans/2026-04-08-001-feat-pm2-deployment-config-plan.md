---
title: "feat: Add PM2 process management for server deployment"
type: feat
status: completed
date: 2026-04-08
origin: docs/brainstorms/2026-04-07-multi-user-deployment-requirements.md
---

# feat: Add PM2 process management for server deployment

部署到内网服务器后，需要 PM2 守护 Node.js 进程——自动重启崩溃进程、开机自启、日志管理。

## 验收标准

- [ ] 创建 `ecosystem.config.js`，配置应用名称、入口文件、环境变量加载
- [ ] `package.json` 添加 `pm2:start`、`pm2:stop`、`pm2:restart`、`pm2:logs` scripts
- [ ] 服务通过 `npm run pm2:start` 正常启动，`pm2 list` 显示 online 状态
- [ ] 进程崩溃后自动重启（PM2 默认行为）
- [ ] `.env` 文件中的环境变量被正确加载

## 上下文

- PM2 作为 devDependency 安装（服务器也可全局安装）
- `ecosystem.config.js` 是 PM2 标准配置文件，支持多环境
- 当前项目已使用 `dotenv`，PM2 的 `env` 配置与 `.env` 文件互补
- PM2 自带日志管理（`pm2 logs`），与现有 `morgan` combined 日志互不冲突

## MVP

### ecosystem.config.js

```javascript
module.exports = {
  apps: [{
    name: 'localdrop',
    script: 'server.js',
    env_file: '.env',
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 1000,
  }]
};
```

### package.json scripts 新增

```json
{
  "pm2:start": "pm2 start ecosystem.config.js",
  "pm2:stop": "pm2 stop localdrop",
  "pm2:restart": "pm2 restart localdrop",
  "pm2:logs": "pm2 logs localdrop"
}
```

## 参考来源

- **来源 brainstorm：** [docs/brainstorms/2026-04-07-multi-user-deployment-requirements.md](../brainstorms/2026-04-07-multi-user-deployment-requirements.md)
- PM2 docs: https://pm2.keymetrics.io/docs/usage/application-declaration/
