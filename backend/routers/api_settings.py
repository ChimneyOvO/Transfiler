from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional
import os
import subprocess
from pathlib import Path
from backend.config import SUPPORTED_LANGUAGES, EXPORT_DIR
from backend.db.database import get_all_settings, update_settings_batch, update_setting
from backend.core.translator import LLMTranslator

router = APIRouter(prefix="/api/settings", tags=["settings"])

class SettingsUpdateModel(BaseModel):
    provider: Optional[str] = None
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model_name: Optional[str] = None
    export_dir: Optional[str] = None
    font_zh: Optional[str] = None
    font_en: Optional[str] = None
    layout_mode: Optional[str] = None
    source_lang: Optional[str] = None
    target_lang: Optional[str] = None
    use_glossary: Optional[str] = None
    theme: Optional[str] = None

class TestConnectionModel(BaseModel):
    api_key: str
    base_url: str
    model_name: Optional[str] = None

class FetchModelsModel(BaseModel):
    api_key: Optional[str] = None
    base_url: Optional[str] = None

class OpenExportDirModel(BaseModel):
    export_dir: Optional[str] = None

class BrowseExportDirModel(BaseModel):
    initial_dir: Optional[str] = None

@router.get("")
def get_settings():
    settings = get_all_settings()
    # 隐藏部分 key 字符保护隐私 (仅在返回时用于展示，完整 key 保持在 settings['api_key'])
    key = settings.get("api_key", "")
    masked_key = key[:4] + "*" * max(0, len(key) - 8) + key[-4:] if len(key) >= 8 else key
    return {
        "status": "success",
        "data": {
            **settings,
            "masked_key": masked_key
        }
    }

@router.post("")
def save_settings(data: SettingsUpdateModel):
    update_dict = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    update_settings_batch(update_dict)
    return {"status": "success", "message": "配置已成功保存", "data": update_dict}

@router.post("/test-connection")
async def test_connection(data: TestConnectionModel):
    settings = get_all_settings()
    model_name = (data.model_name or "").strip() or settings.get("model_name", "deepseek-chat")
    translator = LLMTranslator(api_key=data.api_key, base_url=data.base_url, model_name=model_name)
    res = await translator.test_connection()
    return res

@router.post("/fetch-models")
async def fetch_models(data: Optional[FetchModelsModel] = None):
    """从指定的或已保存的 API 服务商拉取模型列表"""
    settings = get_all_settings()
    api_key = data.api_key if (data and data.api_key is not None) else settings.get("api_key", "")
    base_url = data.base_url if (data and data.base_url is not None) else settings.get("base_url", "https://api.deepseek.com/v1")
    model_name = settings.get("model_name", "deepseek-chat")

    translator = LLMTranslator(api_key=api_key, base_url=base_url, model_name=model_name)
    res = await translator.fetch_models()
    return res

@router.get("/models")
async def get_models():
    """拉取当前已保存配置的 API 模型列表"""
    settings = get_all_settings()
    api_key = settings.get("api_key", "")
    base_url = settings.get("base_url", "https://api.deepseek.com/v1")
    model_name = settings.get("model_name", "deepseek-chat")

    translator = LLMTranslator(api_key=api_key, base_url=base_url, model_name=model_name)
    res = await translator.fetch_models()
    return res

@router.get("/check-connection")
async def check_current_connection():
    """使用当前持久化保存的设置执行开机连通性检测"""
    settings = get_all_settings()
    api_key = settings.get("api_key", "").strip()
    base_url = settings.get("base_url", "https://api.deepseek.com/v1").strip()
    model_name = settings.get("model_name", "deepseek-chat").strip()
    provider = settings.get("provider", "custom")

    is_local = "localhost" in base_url or "127.0.0.1" in base_url or ":11434" in base_url
    if not api_key and not is_local:
        return {
            "success": False,
            "status": "unconfigured",
            "message": "未配置 API Key，当前为本地模拟模式",
            "provider": provider,
            "model_name": model_name
        }

    translator = LLMTranslator(api_key=api_key, base_url=base_url, model_name=model_name)
    res = await translator.test_connection()
    res["provider"] = provider
    res["model_name"] = model_name
    return res

@router.get("/languages")
def get_languages():
    return {"status": "success", "data": SUPPORTED_LANGUAGES}

@router.get("/default-export-dir")
def get_default_export_dir():
    """获取系统默认导出路径"""
    return {"status": "success", "default_export_dir": str(EXPORT_DIR)}

@router.post("/browse-export-dir")
def browse_export_dir(data: Optional[BrowseExportDirModel] = None):
    """在 Windows 环境下弹出原生文件夹选择框，返回用户选取的路径"""
    initial = data.initial_dir if (data and data.initial_dir) else str(EXPORT_DIR)
    selected_dir = ""
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.wm_attributes('-topmost', 1)
        selected_dir = filedialog.askdirectory(initialdir=initial, title="选择 TransFiler 双语文件默认导出目录")
        root.destroy()
    except Exception:
        # Fallback: 使用 PowerShell FolderBrowserDialog
        try:
            ps_script = f"""
Add-Type -AssemblyName System.Windows.Forms
$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = '选择 TransFiler 双语文件默认导出目录'
$f.SelectedPath = '{initial}'
if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{
    Write-Output $f.SelectedPath
}}
"""
            res = subprocess.run(["powershell", "-NoProfile", "-Command", ps_script], capture_output=True, text=True)
            selected_dir = res.stdout.strip()
        except Exception:
            pass

    if selected_dir and os.path.isdir(selected_dir):
        norm_dir = os.path.normpath(selected_dir)
        return {"status": "success", "selected_dir": norm_dir}
    return {"status": "cancelled", "message": "未选择目录或已取消操作"}

@router.post("/open-export-dir")
def open_export_dir(data: Optional[OpenExportDirModel] = None):
    """在 Windows 资源管理器中打开导出目录"""
    settings = get_all_settings()
    target = data.export_dir if (data and data.export_dir) else settings.get("export_dir", str(EXPORT_DIR))
    if not target:
        target = str(EXPORT_DIR)
    
    os.makedirs(target, exist_ok=True)
    try:
        subprocess.run(f'explorer "{os.path.abspath(target)}"', shell=True)
        return {"status": "success", "message": f"已在资源管理器中打开: {target}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"打开目录失败: {str(e)}")

