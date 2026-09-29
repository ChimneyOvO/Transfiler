# -*- coding: utf-8 -*-
"""
TransFiler 官方独立安装向导 (Setup Wizard)
包含安装向导 UI、文件解压安装、快捷方式创建、注册表注册及启动流程。
"""

import os
import sys
import shutil
import winreg
import subprocess
import threading
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

APP_NAME = "TransFiler"
APP_DISPLAY_NAME = "TransFiler 制造业文档双语智能转换系统"
APP_VERSION = "1.2.6"
APP_PUBLISHER = "TransFiler Team"

# 确定默认安装路径 (%LOCALAPPDATA%\Programs\TransFiler)
LOCAL_APPDATA = os.environ.get('LOCALAPPDATA', os.path.expanduser('~'))
DEFAULT_INSTALL_DIR = os.path.join(LOCAL_APPDATA, 'Programs', APP_NAME)

# 确定资源所在目录 (开发环境 vs PyInstaller 临时提取目录)
if getattr(sys, 'frozen', False):
    BUNDLE_DIR = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
else:
    BUNDLE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def create_shortcut(target_path, shortcut_path, working_dir="", icon_path=""):
    """使用 PowerShell 创建 Windows 快捷方式 (.lnk)"""
    try:
        os.makedirs(os.path.dirname(shortcut_path), exist_ok=True)
        ps_script = f"""
$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut('{shortcut_path}')
$s.TargetPath = '{target_path}'
$s.WorkingDirectory = '{working_dir or os.path.dirname(target_path)}'
if ('{icon_path}' -ne '') {{
    $s.IconLocation = '{icon_path},0'
}}
$s.Save()
"""
        cmd = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_script]
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=0x08000000)
        return True
    except Exception as e:
        print(f"创建快捷方式异常 ({shortcut_path}): {e}")
        return False

def register_uninstall(install_dir, exe_path, uninst_path, icon_path):
    """在 Windows 注册表中注册卸载程序信息（控制面板 / 应用列表）"""
    try:
        key_path = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\TransFiler"
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path) as key:
            winreg.SetValueEx(key, "DisplayName", 0, winreg.REG_SZ, APP_DISPLAY_NAME)
            winreg.SetValueEx(key, "DisplayVersion", 0, winreg.REG_SZ, APP_VERSION)
            winreg.SetValueEx(key, "Publisher", 0, winreg.REG_SZ, APP_PUBLISHER)
            winreg.SetValueEx(key, "InstallLocation", 0, winreg.REG_SZ, install_dir)
            winreg.SetValueEx(key, "DisplayIcon", 0, winreg.REG_SZ, icon_path or exe_path)
            winreg.SetValueEx(key, "UninstallString", 0, winreg.REG_SZ, f'"{uninst_path}"')
            winreg.SetValueEx(key, "QuietUninstallString", 0, winreg.REG_SZ, f'"{uninst_path}" /S')
            winreg.SetValueEx(key, "EstimatedSize", 0, winreg.REG_DWORD, 36000)
            winreg.SetValueEx(key, "NoModify", 0, winreg.REG_DWORD, 1)
            winreg.SetValueEx(key, "NoRepair", 0, winreg.REG_DWORD, 1)
    except Exception as e:
        print(f"写入注册表异常: {e}")

class InstallerWizard:
    def __init__(self, root):
        self.root = root
        self.root.title(f"{APP_NAME} v{APP_VERSION} 安装向导")
        self.root.geometry("540x380")
        self.root.resizable(False, False)
        self.root.configure(bg="#0f172a")

        self.install_dir_var = tk.StringVar(value=DEFAULT_INSTALL_DIR)
        self.create_desktop_lnk_var = tk.BooleanVar(value=True)
        self.create_start_menu_var = tk.BooleanVar(value=True)
        self.launch_after_install_var = tk.BooleanVar(value=True)

        self.current_step = 1
        self.center_window()
        self.setup_ui()
        self.show_step(1)

    def center_window(self):
        self.root.update_idletasks()
        w = self.root.winfo_width()
        h = self.root.winfo_height()
        x = (self.root.winfo_screenwidth() // 2) - (w // 2)
        y = (self.root.winfo_screenheight() // 2) - (h // 2)
        self.root.geometry(f"{w}x{h}+{x}+{y}")

    def setup_ui(self):
        # 顶部品牌 Banner
        self.header = tk.Frame(self.root, bg="#1e293b", height=75)
        self.header.pack(fill="x", side="top")
        self.header.pack_propagate(False)

        self.header_title = tk.Label(self.header, text=f"安装 {APP_DISPLAY_NAME}", font=("Microsoft YaHei UI", 12, "bold"), fg="#38bdf8", bg="#1e293b")
        self.header_title.pack(anchor="w", padx=20, pady=(15, 2))

        self.header_subtitle = tk.Label(self.header, text=f"版本：v{APP_VERSION} · 工业级高保真双语排版交付系统", font=("Microsoft YaHei UI", 9), fg="#94a3b8", bg="#1e293b")
        self.header_subtitle.pack(anchor="w", padx=20)

        # 底部控制按钮栏
        self.footer = tk.Frame(self.root, bg="#0f172a", height=55)
        self.footer.pack(fill="x", side="bottom")
        self.footer.pack_propagate(False)

        self.btn_cancel = tk.Button(
            self.footer, text="取消", command=self.root.destroy,
            font=("Microsoft YaHei UI", 9), bg="#334155", fg="#f8fafc",
            activebackground="#475569", activeforeground="#ffffff",
            relief="flat", padx=16, pady=4, cursor="hand2"
        )
        self.btn_cancel.pack(side="right", padx=(10, 20), pady=12)

        self.btn_next = tk.Button(
            self.footer, text="下一步 >", command=self.next_step,
            font=("Microsoft YaHei UI", 9, "bold"), bg="#2563eb", fg="#ffffff",
            activebackground="#1d4ed8", activeforeground="#ffffff",
            relief="flat", padx=20, pady=4, cursor="hand2"
        )
        self.btn_next.pack(side="right", pady=12)

        # 中间内容容器
        self.body = tk.Frame(self.root, bg="#0f172a")
        self.body.pack(fill="both", expand=True, padx=25, pady=15)

    def clear_body(self):
        for widget in self.body.winfo_children():
            widget.destroy()

    def show_step(self, step):
        self.current_step = step
        self.clear_body()

        if step == 1:
            # 步骤 1：欢迎与安装路径选择
            self.header_title.config(text=f"选择安装位置")
            self.header_subtitle.config(text=f"安装程序将把 {APP_NAME} 安装到以下目标文件夹中。")

            lbl_info = tk.Label(self.body, text="目标安装路径：", font=("Microsoft YaHei UI", 9, "bold"), fg="#e2e8f0", bg="#0f172a")
            lbl_info.pack(anchor="w", pady=(5, 5))

            path_frame = tk.Frame(self.body, bg="#0f172a")
            path_frame.pack(fill="x", pady=(0, 15))

            entry_path = tk.Entry(path_frame, textvariable=self.install_dir_var, font=("Consolas", 9), bg="#1e293b", fg="#f8fafc", insertbackground="#38bdf8", relief="flat", highlightthickness=1, highlightbackground="#475569", highlightcolor="#38bdf8")
            entry_path.pack(side="left", fill="x", expand=True, ipady=4, padx=(0, 8))

            btn_browse = tk.Button(path_frame, text="浏览...", command=self.browse_folder, font=("Microsoft YaHei UI", 9), bg="#334155", fg="#f8fafc", activebackground="#475569", activeforeground="#ffffff", relief="flat", padx=12, pady=2, cursor="hand2")
            btn_browse.pack(side="right")

            lbl_options = tk.Label(self.body, text="快捷方式与启动选项：", font=("Microsoft YaHei UI", 9, "bold"), fg="#e2e8f0", bg="#0f172a")
            lbl_options.pack(anchor="w", pady=(10, 5))

            chk_desktop = tk.Checkbutton(self.body, text="创建桌面快捷方式 (Desktop Shortcut)", variable=self.create_desktop_lnk_var, font=("Microsoft YaHei UI", 9), fg="#cbd5e1", bg="#0f172a", selectcolor="#1e293b", activebackground="#0f172a", activeforeground="#38bdf8")
            chk_desktop.pack(anchor="w", pady=2)

            chk_start = tk.Checkbutton(self.body, text="创建开始菜单程序文件夹 (Start Menu)", variable=self.create_start_menu_var, font=("Microsoft YaHei UI", 9), fg="#cbd5e1", bg="#0f172a", selectcolor="#1e293b", activebackground="#0f172a", activeforeground="#38bdf8")
            chk_start.pack(anchor="w", pady=2)

            chk_launch = tk.Checkbutton(self.body, text="安装完成后立即启动 TransFiler", variable=self.launch_after_install_var, font=("Microsoft YaHei UI", 9), fg="#cbd5e1", bg="#0f172a", selectcolor="#1e293b", activebackground="#0f172a", activeforeground="#38bdf8")
            chk_launch.pack(anchor="w", pady=2)

            self.btn_next.config(text="开始安装", bg="#2563eb", state="normal")

        elif step == 2:
            # 步骤 2：安装进度
            self.header_title.config(text="正在安装 TransFiler...")
            self.header_subtitle.config(text="请稍候，正在解压程序文件并配置快捷方式...")

            self.status_lbl = tk.Label(self.body, text="正在准备安装环境...", font=("Microsoft YaHei UI", 9), fg="#94a3b8", bg="#0f172a")
            self.status_lbl.pack(anchor="w", pady=(20, 10))

            self.progress = ttk.Progressbar(self.body, mode="determinate", length=490)
            self.progress.pack(fill="x", pady=(0, 20))

            self.btn_next.config(state="disabled")
            self.btn_cancel.config(state="disabled")

            threading.Thread(target=self.perform_installation, daemon=True).start()

        elif step == 3:
            # 步骤 3：完成
            self.header_title.config(text="🎉 安装成功！")
            self.header_subtitle.config(text=f"{APP_DISPLAY_NAME} 已成功安装到您的计算机。")

            lbl_success = tk.Label(self.body, text=f"安装目录：\n{self.install_dir_var.get()}", font=("Consolas", 9), fg="#38bdf8", bg="#0f172a", justify="left")
            lbl_success.pack(anchor="w", pady=(15, 10))

            lbl_tip = tk.Label(self.body, text="已自动配置桌面快捷方式与 Windows 控制面板卸载项。\n随时可在控制面板或开始菜单中卸载或管理本软件。", font=("Microsoft YaHei UI", 9), fg="#cbd5e1", bg="#0f172a", justify="left")
            lbl_tip.pack(anchor="w", pady=5)

            self.btn_cancel.pack_forget()
            self.btn_next.config(text="完成并体验", state="normal", command=self.finish_install, bg="#10b981")

    def browse_folder(self):
        dir_selected = filedialog.askdirectory(initialdir=self.install_dir_var.get(), title="选择 TransFiler 安装路径")
        if dir_selected:
            # 若选中的目录没有包含 TransFiler，则自动追加
            if not dir_selected.endswith(APP_NAME):
                dir_selected = os.path.join(dir_selected, APP_NAME)
            self.install_dir_var.set(dir_selected)

    def next_step(self):
        if self.current_step == 1:
            target = self.install_dir_var.get().strip()
            if not target:
                messagebox.showerror("错误", "请输入或选择有效的安装路径！")
                return
            self.show_step(2)

    def perform_installation(self):
        import time
        target_dir = os.path.abspath(self.install_dir_var.get())
        os.makedirs(target_dir, exist_ok=True)

        self.update_progress(15, "正在创建程序目录...")
        time.sleep(0.3)

        # 1. 复制主程序与依赖
        src_exe = os.path.join(BUNDLE_DIR, "TransFiler.exe")
        if not os.path.exists(src_exe):
            # 兼容开发环境
            src_exe = os.path.join(BUNDLE_DIR, "dist", "TransFiler.exe")

        dest_exe = os.path.join(target_dir, "TransFiler.exe")
        if os.path.exists(src_exe):
            self.update_progress(35, "正在提取主程序文件 (TransFiler.exe)...")
            shutil.copy2(src_exe, dest_exe)

        # 2. 复制卸载程序
        src_uninst = os.path.join(BUNDLE_DIR, "uninstall.exe")
        if not os.path.exists(src_uninst):
            src_uninst = os.path.join(BUNDLE_DIR, "dist", "uninstall.exe")
        dest_uninst = os.path.join(target_dir, "uninstall.exe")
        if os.path.exists(src_uninst):
            self.update_progress(55, "正在配置独立卸载程序 (uninstall.exe)...")
            shutil.copy2(src_uninst, dest_uninst)

        # 3. 复制图标与文档
        src_ico = os.path.join(BUNDLE_DIR, "app_icon.ico")
        dest_ico = os.path.join(target_dir, "app_icon.ico")
        if os.path.exists(src_ico):
            shutil.copy2(src_ico, dest_ico)

        # 4. 创建快捷方式
        self.update_progress(75, "正在创建桌面与开始菜单快捷方式...")
        time.sleep(0.3)

        desktop = os.path.join(os.environ.get('USERPROFILE', ''), 'Desktop')
        if self.create_desktop_lnk_var.get():
            desktop_lnk = os.path.join(desktop, f"{APP_NAME}.lnk")
            create_shortcut(dest_exe, desktop_lnk, working_dir=target_dir, icon_path=dest_ico)

        if self.create_start_menu_var.get():
            appdata = os.environ.get('APPDATA', '')
            start_menu_folder = os.path.join(appdata, r'Microsoft\Windows\Start Menu\Programs', APP_NAME)
            os.makedirs(start_menu_folder, exist_ok=True)
            # 主程序快捷方式
            start_lnk = os.path.join(start_menu_folder, f"{APP_NAME}.lnk")
            create_shortcut(dest_exe, start_lnk, working_dir=target_dir, icon_path=dest_ico)
            # 卸载快捷方式
            if os.path.exists(dest_uninst):
                uninst_lnk = os.path.join(start_menu_folder, f"卸载 {APP_NAME}.lnk")
                create_shortcut(dest_uninst, uninst_lnk, working_dir=target_dir, icon_path=dest_ico)

        # 5. 注册注册表
        self.update_progress(90, "正在注册 Windows 系统应用信息...")
        register_uninstall(target_dir, dest_exe, dest_uninst, dest_ico)

        self.update_progress(100, "安装完成！")
        time.sleep(0.4)
        self.root.after(0, lambda: self.show_step(3))

    def update_progress(self, percent, text):
        self.root.after(0, lambda: self._apply_progress(percent, text))

    def _apply_progress(self, percent, text):
        if hasattr(self, 'progress') and hasattr(self, 'status_lbl'):
            self.progress['value'] = percent
            self.status_lbl.config(text=text)

    def finish_install(self):
        target_dir = os.path.abspath(self.install_dir_var.get())
        dest_exe = os.path.join(target_dir, "TransFiler.exe")

        if self.launch_after_install_var.get() and os.path.exists(dest_exe):
            subprocess.Popen([dest_exe], cwd=target_dir)

        self.root.destroy()

if __name__ == "__main__":
    root = tk.Tk()
    app = InstallerWizard(root)
    root.mainloop()
