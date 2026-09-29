import os
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from backend.app import app

client = TestClient(app)

def test_settings_api():
    res = client.get("/api/settings")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert "provider" in data["data"]

    # 保存设置测试
    save_res = client.post("/api/settings", json={
        "provider": "deepseek",
        "api_key": "sk-testkey123456",
        "base_url": "https://api.deepseek.com/v1",
        "model_name": "deepseek-chat"
    })
    assert save_res.status_code == 200
    assert save_res.json()["status"] == "success"

    # 开机自动检测接口测试
    chk_res = client.get("/api/settings/check-connection")
    assert chk_res.status_code == 200
    chk_data = chk_res.json()
    assert "success" in chk_data

def test_glossary_api():
    # 获取术语列表
    res = client.get("/api/glossary")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert isinstance(data["data"], list)

    # 创建新词条
    add_res = client.post("/api/glossary", json={
        "source_term": "临时测试治具",
        "target_term": "Temporary Test Jig",
        "target_lang": "en",
        "category": "工装"
    })
    assert add_res.status_code == 200
    new_id = add_res.json()["id"]

    # 删除新词条
    del_res = client.delete(f"/api/glossary/{new_id}")
    assert del_res.status_code == 200

def test_task_workflow_end_to_end():
    sample_file = Path("sample_docs/SOP_注塑机标准作业指导书.docx")
    assert sample_file.exists()

    # 1. 上传文件
    with open(sample_file, "rb") as f:
        upload_res = client.post("/api/task/upload", files={"file": ("SOP_注塑机标准作业指导书.docx", f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")})
    
    assert upload_res.status_code == 200
    task_data = upload_res.json()
    task_id = task_data["task_id"]
    assert task_data["total_items"] > 0

    # 2. 执行处理 (测试中译英，中文在下 zh_bottom 排版)
    process_res = client.post("/api/task/process", json={
        "task_id": task_id,
        "source_lang": "zh",
        "target_lang": "en",
        "layout_mode": "zh_bottom",
        "use_glossary": True
    })
    assert process_res.status_code == 200
    proc_data = process_res.json()
    assert len(proc_data["items"]) > 0
    assert proc_data["layout_mode"] == "zh_bottom"

    # 3. 手动修改某个条目 (校对)
    first_item_id = proc_data["items"][0]["id"]
    update_res = client.post("/api/task/update-item", json={
        "task_id": task_id,
        "item_id": first_item_id,
        "target_text": "MANUAL_PROOFREAD_CORRECTION_TITLE"
    })
    assert update_res.status_code == 200

    # 4. 导出文件
    export_res = client.post("/api/task/export", json={
        "task_id": task_id,
        "layout_mode": "zh_bottom"
    })
    assert export_res.status_code == 200
    export_data = export_res.json()
    assert export_data["status"] == "success"
    assert os.path.exists(export_data["export_path"])

def test_foreign_to_chinese_workflow():
    sample_file = Path("sample_docs/工艺参数表_模具点检.xlsx")
    assert sample_file.exists()

    # 上传 Excel
    with open(sample_file, "rb") as f:
        upload_res = client.post("/api/task/upload", files={"file": ("工艺参数表_模具点检.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
    assert upload_res.status_code == 200
    task_id = upload_res.json()["task_id"]

    # 测试外语 -> 中文 (如 en -> zh) 处理
    proc_res = client.post("/api/task/process", json={
        "task_id": task_id,
        "source_lang": "en",
        "target_lang": "zh",
        "layout_mode": "zh_top",
        "use_glossary": True
    })
    assert proc_res.status_code == 200
    proc_data = proc_res.json()
    assert proc_data["source_lang"] == "en"
    assert proc_data["target_lang"] == "zh"

def test_pptx_api_workflow():
    sample_file = Path("sample_docs/注塑车间生产工艺与安全培训课件.pptx")
    assert sample_file.exists()

    # 上传 PPTX
    with open(sample_file, "rb") as f:
        upload_res = client.post(
            "/api/task/upload",
            files={"file": ("注塑车间生产工艺与安全培训课件.pptx", f, "application/vnd.openxmlformats-officedocument.presentationml.presentation")}
        )
    assert upload_res.status_code == 200
    up_data = upload_res.json()
    assert up_data["file_type"] == "pptx"
    task_id = up_data["task_id"]
    assert up_data["total_items"] > 0

    # 翻译任务处理
    proc_res = client.post("/api/task/process", json={
        "task_id": task_id,
        "source_lang": "zh",
        "target_lang": "en",
        "layout_mode": "zh_top",
        "use_glossary": True
    })
    assert proc_res.status_code == 200

    # 导出 PPTX
    export_res = client.post("/api/task/export", json={
        "task_id": task_id,
        "layout_mode": "zh_top"
    })
    assert export_res.status_code == 200
    exp_data = export_res.json()
    assert exp_data["status"] == "success"
    assert os.path.exists(exp_data["export_path"])

def test_gemini_settings_api():
    # 测试保存 Gemini 配置
    save_res = client.post("/api/settings", json={
        "provider": "gemini",
        "api_key": "AIzaSyFakeTestKeyForGemini123456",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "model_name": "gemini-3.8-flash"
    })
    assert save_res.status_code == 200
    assert save_res.json()["status"] == "success"

    # 读取验证
    get_res = client.get("/api/settings")
    assert get_res.status_code == 200
    st = get_res.json()["data"]
    assert st["provider"] == "gemini"
    assert st["model_name"] == "gemini-3.8-flash"

def test_complex_job_description_docx_workflow():
    sample_file = Path("sample_docs/职位说明书（体系专员）.docx")
    assert sample_file.exists()

    with open(sample_file, "rb") as f:
        upload_res = client.post(
            "/api/task/upload",
            files={"file": ("职位说明书（体系专员）.docx", f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
        )
    assert upload_res.status_code == 200
    up_data = upload_res.json()
    assert up_data["file_type"] == "docx"
    assert up_data["total_items"] >= 160, f"Expected >= 160 items, got {up_data['total_items']}"
    task_id = up_data["task_id"]

    # 翻译任务处理
    proc_res = client.post("/api/task/process", json={
        "task_id": task_id,
        "source_lang": "zh",
        "target_lang": "en",
        "layout_mode": "zh_top",
        "use_glossary": True
    })
    assert proc_res.status_code == 200
    assert len(proc_res.json()["items"]) >= 160

    # 导出并验证
    export_res = client.post("/api/task/export", json={
        "task_id": task_id,
        "layout_mode": "zh_top"
    })
    assert export_res.status_code == 200
    exp_data = export_res.json()
    assert exp_data["status"] == "success"
    assert os.path.exists(exp_data["export_path"])

def test_v125_settings_and_export_dir_api():
    # 1. 测试获取系统默认导出目录
    def_res = client.get("/api/settings/default-export-dir")
    assert def_res.status_code == 200
    def_data = def_res.json()
    assert def_data["status"] == "success"
    assert "default_export_dir" in def_data
    assert os.path.isabs(def_data["default_export_dir"])

    # 2. 测试保存自定义导出目录与主题
    custom_dir = str(Path("exported_docs").resolve())
    save_res = client.post("/api/settings", json={
        "provider": "gemini",
        "api_key": "AIzaSyTestKey125",
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "model_name": "gemini-3.8-flash",
        "export_dir": custom_dir,
        "theme": "light"
    })
    assert save_res.status_code == 200
    assert save_res.json()["status"] == "success"

    # 读取验证
    get_res = client.get("/api/settings")
    assert get_res.status_code == 200
    st = get_res.json()["data"]
    assert st["export_dir"] == custom_dir
    assert st["theme"] == "light"

    # 3. 测试打开导出目录接口
    open_res = client.post("/api/settings/open-export-dir", json={
        "export_dir": custom_dir
    })
    assert open_res.status_code == 200
    assert open_res.json()["status"] == "success"

def test_v126_model_fetching_and_decoupled_api():
    # 1. 测试在取消预设平台选项后，仅配置 base_url 与 api_key
    save_res = client.post("/api/settings", json={
        "base_url": "https://api.deepseek.com/v1",
        "api_key": "sk-mock-key-v126",
        "model_name": "deepseek-chat"
    })
    assert save_res.status_code == 200
    assert save_res.json()["status"] == "success"

    # 2. 读取验证
    get_res = client.get("/api/settings")
    assert get_res.status_code == 200
    st = get_res.json()["data"]
    assert st["base_url"] == "https://api.deepseek.com/v1"
    assert st["model_name"] == "deepseek-chat"

    # 3. 测试拉取模型接口 POST /api/settings/fetch-models
    fetch_res = client.post("/api/settings/fetch-models", json={
        "base_url": "http://127.0.0.1:9999/v1",
        "api_key": ""
    })
    assert fetch_res.status_code == 200
    fetch_data = fetch_res.json()
    assert "success" in fetch_data
    assert "models" in fetch_data

    # 4. 测试 GET /api/settings/models 路由
    get_models_res = client.get("/api/settings/models")
    assert get_models_res.status_code == 200
    assert "models" in get_models_res.json()

    # 5. 测试根据 API 选择并更新模型
    sel_res = client.post("/api/settings", json={
        "model_name": "deepseek-reasoner"
    })
    assert sel_res.status_code == 200
    chk_settings = client.get("/api/settings").json()["data"]
    assert chk_settings["model_name"] == "deepseek-reasoner"



