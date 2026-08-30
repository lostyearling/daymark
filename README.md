# Daymark · GitHub Issues 日程

Daymark 是一个纯前端静态日程/任务管理网页。每个任务对应一个 GitHub Issue：日期保存为 `date:YYYY-MM-DD` 标签，Issue 打开表示未完成，关闭表示已完成。网页可直接部署到 GitHub Pages 的 `main` 分支 `/docs` 目录。

## 开始使用

1. 在 GitHub 打开 **Settings → Developer settings → Personal access tokens**，创建 Fine-grained token。
2. 将 token 的 Resource owner 设为你的账号或组织，Repository access 限定到目标仓库，并授予 **Issues: Read and write** 权限（经典 token 可使用仅含 `repo` 或 `issues` 的权限）。
3. 打开 Daymark，点击右上角设置，填写 GitHub 用户名/组织、仓库名和 token。首次打开且没有本地凭据时会自动弹出设置。
4. 在页面中添加任务。任务详情写入 Issue body，日期自动写入 `date:YYYY-MM-DD` 标签。

Token 仅存储在当前浏览器的 `localStorage`，不会上传到 Daymark 或任何第三方服务器。请不要在公共电脑保存 token；可随时在设置面板清除。

## 启用 GitHub Pages

1. 将本项目推送到 GitHub 的 `main` 分支。
2. 仓库进入 **Settings → Pages**。
3. 在 **Build and deployment** 中选择 **Deploy from a branch**，分支选择 `main`，目录选择 `/docs`，保存。
4. 等待 GitHub Pages 发布后访问生成的地址。

## 安全与限制

- 认证请求会带 `Authorization: token {PAT}`；认证用户通常享有每小时 5000 次 REST API 请求额度，未认证请求通常为每小时 60 次。应用会显示 API 错误和限流错误，点击刷新可重试。
- GitHub Issues API 不提供真正删除 Issue，因此“归档”操作实际是关闭 Issue；Issue 仍保留在仓库中。
- 这是浏览器直连 GitHub API 的方案。若未来需要更安全的 OAuth 或 Actions 中转，只需替换 `docs/app.js` 中的 `api.headers()`/`api.request()` 认证适配层，页面其余部分无需改变。

## 文件结构

```text
docs/
├── index.html
├── style.css
└── app.js
README.md
```
