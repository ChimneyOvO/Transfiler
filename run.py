import sys
import os
import time
import socket
import threading
import webbrowser
import uvicorn
import io

# 针对 noconsole 模式保护 stdout / stderr
if sys.stdout is None:
    sys.stdout = io.StringIO()
if sys.stderr is None:
    sys.stderr = io.StringIO()

# 确保项目根目录在 sys.path 中
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from backend.config import DATA_DIR

PORT = 8765
HOST = "127.0.0.1"
URL = f"http://{HOST}:{PORT}"

def is_port_in_use(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex((HOST, port)) == 0

def start_server():
    from backend.app import app
    config = uvicorn.Config(
        app=app,
        host=HOST,
        port=PORT,
        log_level="warning"
    )
    server = uvicorn.Server(config)
    server.run()

def main():
    print("=" * 60)
    print("  TransFiler v1.2.6 正在启动...")
    print(f"  本地服务地址: {URL}")
    print("=" * 60)

    # 1. 在后台线程中启动 FastAPI 服务
    if not is_port_in_use(PORT):
        server_thread = threading.Thread(target=start_server, daemon=True)
        server_thread.start()
        
        # 等待服务端口就绪
        for _ in range(60):
            if is_port_in_use(PORT):
                break
            time.sleep(0.1)

    # 2. 尝试打开原生桌面窗口 (PyWebView，并持久化本地存储路径)
    try:
        import webview
        print("  正在创建 Windows 原生桌面窗口 (v1.2.6)...")
        storage_dir = str(DATA_DIR / "webview_storage")
        os.makedirs(storage_dir, exist_ok=True)

        window = webview.create_window(
            title="TransFiler 制造业文档双语智能转换系统 v1.2.6",
            url=URL,
            width=1280,
            height=850,
            min_size=(1024, 700),
            text_select=True
        )
        webview.start(storage_path=storage_dir)
    except Exception as e:
        print(f"  提示: 启动 PyWebView 窗口异常 ({e})，正在自动在默认浏览器中打开...")
        webbrowser.open(URL)
        # 保持主线程运行
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("  系统已安全退出。")

if __name__ == "__main__":
    import multiprocessing
    multiprocessing.freeze_support()
    main()
