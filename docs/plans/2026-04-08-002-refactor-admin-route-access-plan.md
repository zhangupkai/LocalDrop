---
title: "refactor: Move admin UI from footer button to /admin route"
type: refactor
status: completed
date: 2026-04-08
---

# refactor: Move admin UI from footer button to /admin route

将管理员功能从主页 footer 的按钮入口改为独立的 `/admin` 路由页面。普通用户在主页完全看不到管理员相关 UI。

## 验收标准

- [ ] 主页 footer 不再包含管理员按钮、登录面板、统计面板
- [ ] 访问 `/admin` 显示管理员页面（登录框、统计、清空操作）
- [ ] 管理员页面复用现有 admin API（login/logout/status/stats）
- [ ] 已登录管理员在 `/admin` 页面可执行清空消息和文件操作
- [ ] 主页的"清空"按钮完全移除（管理操作统一在 /admin 页面）
- [ ] `/admin` 页面提供返回主页的链接

## 上下文

**涉及文件：**

| 文件 | 变更 |
|------|------|
| `public/admin.html` | **新建** — 管理员页面 |
| `public/admin.js` | **新建** — 管理员页面逻辑 |
| `public/index.html` | 移除 footer 中的 admin-section |
| `public/script.js` | 移除 `checkAdminStatus()`、`showAdminFeatures()`、`hideAdminFeatures()` 及相关事件绑定；移除 clearBtn 相关逻辑 |
| `server.js` | 添加 `GET /admin` 路由返回 `admin.html` |

**后端 API 无需改动** — 现有的 `/api/admin/login`、`/api/admin/logout`、`/api/admin/status`、`/api/admin/stats`、`DELETE /api/messages`、`DELETE /api/files` 全部保留原样。

## 参考来源

- 现有管理员 UI: `public/index.html:93-103`
- 现有管理员 JS: `public/script.js` checkAdminStatus/showAdminFeatures/hideAdminFeatures
- 管理员 API: `server.js` /api/admin/* 端点
