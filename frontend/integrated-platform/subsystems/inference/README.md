# Vue 3 前端

技术栈：Vue 3、Vite、TypeScript、Vue Router。

```bash
npm install
npm run dev
```

开发服务器默认运行在 `5173`，并将 `/api` 代理到 `http://127.0.0.1:8082`。

生产构建：

```bash
npm run build
cd ..
python -m backend.app.main
```

FastAPI 会自动托管 `frontend/dist`。
