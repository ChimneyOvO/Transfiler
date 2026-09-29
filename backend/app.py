import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse

from backend.db.database import init_db, get_all_settings
from backend.routers import api_settings, api_glossary, api_translate, api_history
from backend.config import BASE_DIR, FRONTEND_DIR

# 初始化 SQLite 数据库
init_db()

app = FastAPI(
    title="TransFiler 制造业文档双语智能转换系统",
    description="专为工业 SOP、工艺文件、参数表格打造的高保真双语制作系统",
    version="1.2.6"
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册 API 路由
app.include_router(api_settings.router)
app.include_router(api_glossary.router)
app.include_router(api_translate.router)
app.include_router(api_history.router)

# 挂载前端静态文件
frontend_dir = FRONTEND_DIR
if frontend_dir.exists():
    app.mount("/static", StaticFiles(directory=str(frontend_dir)), name="static")

@app.get("/")
def serve_index():
    index_file = frontend_dir / "index.html"
    if index_file.exists():
        with open(index_file, "r", encoding="utf-8") as f:
            content = f.read()
        # 服务端直接注入已持久化保存的主题，实现零延迟、无闪烁的主题记忆恢复
        settings = get_all_settings()
        saved_theme = settings.get("theme", "dark")
        if saved_theme not in ["dark", "light"]:
            saved_theme = "dark"
        content = content.replace('data-theme="dark"', f'data-theme="{saved_theme}"').replace('data-theme="light"', f'data-theme="{saved_theme}"')
        return HTMLResponse(content)
    return {"status": "ok", "message": "TransFiler 后端 API 服务运行中"}

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "TransFiler", "version": "1.2.6"}
