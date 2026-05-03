# 卢浮宫精选藏品音频讲解（静态网页）

本项目是纯静态网页（不需要后端），适配手机，并支持离线缓存（PWA Service Worker）。

## 目录结构

- `index.html`：入口页面
- `app.js` / `app.css`：前端逻辑与样式
- `sw.js`：离线缓存 Service Worker
- `assets/audio/`：讲解音频（`.mp3`）
- `assets/img/original/`：藏品原图（`.png/.jpg`）
- `assets/img/thumbs/`：缩略图（脚本生成）
- `assets/maps/`：卢浮宫地图（`.png`）
- `data/items.json`：藏品清单（脚本生成）
- `data/maps.json`：地图清单（脚本生成）

## 初始化（整理文件 + 生成索引）

1) 把本目录下的音频/图片/地图整理进 `assets/`：

```bash
node scripts/organize-assets.mjs
```

2) 生成缩略图（提升手机端加载速度）：

```bash
node scripts/make-thumbs.mjs
```

3) 生成 `data/items.json` 和 `data/maps.json`：

```bash
node scripts/build-index.mjs
```

> 以后如果新增/替换音频或图片，重复执行第 2) 3) 步即可。

## 本地预览

浏览器的 Service Worker 需要在 HTTP 环境下运行（不能直接双击打开 `index.html`）。

任选一种方式启动静态服务：

```bash
python3 -m http.server 8080
```

然后打开：
- `http://localhost:8080/`

## 部署到 GitHub Pages（含全量音频/图片）

1) 新建 GitHub 仓库，把本目录全部文件 push 上去。
2) GitHub 仓库设置：Settings → Pages
   - Source: Deploy from a branch
   - Branch: `main` / `root`
3) 等待部署完成即可访问。

## 部署到你自己的服务器（mugenlab.com）

把整个目录上传到服务器的静态站点目录即可（保持目录结构不变），例如：
- `index.html`
- `app.js`
- `app.css`
- `sw.js`
- `assets/`
- `data/`

如果你用 Nginx，确保该目录被作为静态文件根目录（root）并正确返回文件。
> 注意：Service Worker（离线缓存）需要在 `https://`（或本机 `http://localhost`）下才能工作；如果你的站点是纯 `http://`，离线缓存会被浏览器禁用。

### 上传示例（可选）

不同服务器目录不一样，你只需要把本目录完整上传到站点根目录即可。常见方式：

- `scp`（最简单）
  - `scp -r ./ <user>@<server>:/path/to/site-root/`
- `rsync`（增量更新更快）
  - `rsync -av --delete ./ <user>@<server>:/path/to/site-root/`

## 文字稿（可选）

如果你想给某个音频加文字稿，在 `assets/transcript/` 放同名 `.txt`：

- `assets/transcript/蒙娜丽莎-Denon1-711.txt`

网页会自动在音频下方展示文字稿（没有文件就不显示）。

## 访问码

页面访问码写死为：`louvre2026`

说明：GitHub Pages 上的访问码是前端门槛，不是强安全。
