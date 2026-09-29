// TransFiler 全局主状态与导航管理 (Taste Skill 极简双主题与全局状态记忆引擎)

const AppState = {
  currentTab: 'translate',
  currentTask: null, // { task_id, file_name, file_size, total_items, items: [] }
  supportedLanguages: [],
  settings: {},
  availableModels: [], // v1.2.6: 从 API 动态拉取的可用模型列表
  currentTheme: 'dark',
  lastExportPath: ''
};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', async () => {
  initSidebar();
  initTheme();
  await loadInitialSettings();
  await loadLanguages();
  await updateSidebarGlossaryCount();
  restoreTranslateOptions();
});

// --- 侧边栏折叠/展开功能 ---
function initSidebar() {
  const isCollapsed = localStorage.getItem('transfiler_sidebar_collapsed') === 'true';
  applySidebarCollapse(isCollapsed);
}

function toggleSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  if (!sidebar) return;
  const willCollapse = !sidebar.classList.contains('sidebar-collapsed');
  applySidebarCollapse(willCollapse);
}

function applySidebarCollapse(collapsed) {
  const sidebar = document.getElementById('app-sidebar');
  const toggleIcon = document.getElementById('sidebar-toggle-icon');
  const toggleBtn = document.getElementById('sidebar-toggle-btn');
  if (!sidebar) return;

  if (collapsed) {
    sidebar.classList.add('sidebar-collapsed');
    if (toggleIcon) toggleIcon.className = 'ph ph-caret-right text-sm';
    if (toggleBtn) toggleBtn.title = '展开功能栏';
  } else {
    sidebar.classList.remove('sidebar-collapsed');
    if (toggleIcon) toggleIcon.className = 'ph ph-caret-left text-sm';
    if (toggleBtn) toggleBtn.title = '收起功能栏';
  }

  localStorage.setItem('transfiler_sidebar_collapsed', collapsed ? 'true' : 'false');
}

// --- 双主题切换引擎 (Dark / Light) 记忆持久化 ---
function initTheme() {
  // 优先读取 DOM 上的属性 (由服务端根据数据库直接注入，防止闪烁)
  const currentAttr = document.documentElement.getAttribute('data-theme');
  const saved = currentAttr || localStorage.getItem('transfiler_theme') || 'dark';
  applyTheme(saved, false);
}

function toggleTheme() {
  const next = AppState.currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(next, true);
  // 同步持久化至数据库
  saveOptionToBackend({ theme: next });
}

function updateSettingsThemeCards(themeKey) {
  const darkCard = document.getElementById('theme-card-dark');
  const lightCard = document.getElementById('theme-card-light');
  if (!darkCard || !lightCard) return;

  if (themeKey === 'dark') {
    darkCard.classList.add('active');
    lightCard.classList.remove('active');
  } else {
    lightCard.classList.add('active');
    darkCard.classList.remove('active');
  }
}

function applyTheme(themeKey, showNotice = true) {
  if (themeKey !== 'dark' && themeKey !== 'light') themeKey = 'dark';
  AppState.currentTheme = themeKey;
  document.documentElement.setAttribute('data-theme', themeKey);
  localStorage.setItem('transfiler_theme', themeKey);

  // 更新顶栏切换按钮状态
  const themeNameLabel = document.getElementById('current-theme-name');
  const themeIcon = document.getElementById('current-theme-icon');
  if (themeNameLabel) {
    themeNameLabel.innerText = themeKey === 'dark' ? '深色模式' : '浅色模式';
  }
  if (themeIcon) {
    themeIcon.className = themeKey === 'dark' ? 'ph ph-moon text-sm' : 'ph ph-sun text-sm text-amber-500';
  }

  // 同步更新设置面板中的主题卡片高亮状态
  updateSettingsThemeCards(themeKey);

  if (showNotice) {
    showToast(themeKey === 'dark' ? '已切换为深色模式' : '已切换为浅色模式', 'info');
  }
}

// 标签页切换逻辑
function switchTab(tab) {
  const tabs = ['translate', 'diff', 'glossary', 'settings', 'history'];
  const titles = {
    translate: '新建双语文档制作',
    diff: '双栏校对与排版检查',
    glossary: '制造业专有术语词典管理',
    settings: '系统设置与环境配置',
    history: '双语文件交付历史'
  };

  const breadcrumbs = {
    translate: '文档制作',
    diff: '双栏校对',
    glossary: '专有术语库',
    settings: '系统设置',
    history: '交付历史'
  };

  document.getElementById('page-title').innerText = titles[tab] || 'TransFiler 制造业文档助手';
  const crumbEl = document.getElementById('page-breadcrumb');
  if (crumbEl) crumbEl.innerText = breadcrumbs[tab] || '文档制作';

  AppState.currentTab = tab;

  tabs.forEach(t => {
    const view = document.getElementById('view-' + t);
    const nav = document.getElementById('nav-' + t);
    if (!view || !nav) return;

    if (t === tab) {
      view.classList.remove('hidden');
      nav.classList.add('nav-item-active');
      nav.classList.remove('nav-item-inactive');
    } else {
      view.classList.add('hidden');
      nav.classList.remove('nav-item-active');
      nav.classList.add('nav-item-inactive');
    }
  });

  // 触发对应视图的数据刷新
  if (tab === 'glossary') loadGlossaryList();
  if (tab === 'history') loadHistoryList();
  if (tab === 'settings') loadSettings();
}

// 加载初始系统设置并触发开机 API 连通性检测
async function loadInitialSettings() {
  try {
    const res = await fetch('/api/settings');
    const json = await res.json();
    if (json.status === 'success') {
      AppState.settings = json.data;

      // 确保后端数据库保存的主题生效
      if (json.data.theme) {
        applyTheme(json.data.theme, false);
      }

      // 同步恢复制作界面选项
      restoreTranslateOptions();

      // 执行开机自动 API 连通性检测
      checkApiConnectionOnStartup(json.data);
    }
  } catch (err) {
    console.error('加载系统设置失败:', err);
    updateEngineStatusUI({
      success: false,
      status: 'error',
      message: '无法连接后端服务: ' + err.message
    });
  }
}

// 开机静默执行 API 连通性检测
async function checkApiConnectionOnStartup(settings) {
  const dot = document.getElementById('engine-status-dot');
  const dotCompact = document.getElementById('engine-status-dot-compact');
  const text = document.getElementById('engine-status-text');
  const badge = document.getElementById('engine-status-badge');

  const isLocal = (settings.base_url || '').includes('localhost') || (settings.base_url || '').includes('127.0.0.1') || (settings.base_url || '').includes(':11434');
  if (!settings.api_key && !isLocal) {
    updateEngineStatusUI({
      success: false,
      status: 'unconfigured',
      model_name: settings.model_name || 'deepseek-chat',
      message: '未配置 API Key，当前为本地模拟模式'
    });
    return;
  }

  // 设置为正在检测状态
  if (dot) dot.className = "w-2 h-2 rounded-full bg-amber-400 animate-pulse";
  if (dotCompact) {
    dotCompact.className = "w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse ring-2 ring-amber-400/20";
    dotCompact.title = "检测 API 连接中...";
  }
  if (text) text.innerText = `检测 API 连接...`;
  if (badge) {
    badge.className = "text-[9px] font-mono px-1.5 py-0.5 rounded font-medium";
    badge.style.background = "rgba(251, 191, 36, 0.15)";
    badge.style.color = "#f59e0b";
    badge.innerText = "检测中";
  }

  try {
    const res = await fetch('/api/settings/check-connection');
    const result = await res.json();
    updateEngineStatusUI(result);
  } catch (err) {
    updateEngineStatusUI({
      success: false,
      status: 'error',
      model_name: settings.model_name || 'deepseek-chat',
      message: '网络异常或检测超时: ' + err.message
    });
  }
}

// 统一更新侧边栏与全局 API 状态指示器
function updateEngineStatusUI(result) {
  const dot = document.getElementById('engine-status-dot');
  const dotCompact = document.getElementById('engine-status-dot-compact');
  const text = document.getElementById('engine-status-text');
  const badge = document.getElementById('engine-status-badge');
  const container = document.getElementById('engine-status-container');
  const transActiveModel = document.getElementById('trans-active-model-name');
  const transModelBadge = document.getElementById('trans-model-status-badge');

  if (result.model_name && transActiveModel) {
    transActiveModel.innerText = result.model_name;
  }

  if (result.success) {
    if (dot) dot.className = "w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]";
    if (dotCompact) {
      dotCompact.className = "w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] ring-2 ring-emerald-500/20";
      dotCompact.title = `API 在线: ${result.model_name || '大模型'} 引擎 (点击切换模型)`;
    }
    if (text) text.innerText = `${result.model_name || 'DeepSeek'} 引擎`;
    if (badge) {
      badge.className = "text-[9px] font-mono px-1.5 py-0.5 rounded font-medium";
      badge.style.background = "var(--badge-highlight-bg)";
      badge.style.color = "var(--badge-highlight-text)";
      badge.innerText = "在线";
    }
    if (container) container.title = `${result.message || 'API 连通正常'} (点击选择模型 / 切换)`;
    if (transModelBadge) {
      transModelBadge.innerText = "在线 ✔";
      transModelBadge.style.color = "#34d399";
    }
  } else if (result.status === 'unconfigured') {
    if (dot) dot.className = "w-2 h-2 rounded-full bg-amber-400";
    if (dotCompact) {
      dotCompact.className = "w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-amber-500/20";
      dotCompact.title = "本地模拟模式 (未配置 API Key)";
    }
    if (text) text.innerText = "本地模拟模式";
    if (badge) {
      badge.className = "text-[9px] font-mono px-1.5 py-0.5 rounded font-medium";
      badge.style.background = "rgba(251, 191, 36, 0.15)";
      badge.style.color = "#f59e0b";
      badge.innerText = "未配置";
    }
    if (container) container.title = "未配置 API Key，点击前往配置";
    if (transModelBadge) {
      transModelBadge.innerText = "本地模拟";
      transModelBadge.style.color = "#f59e0b";
    }
  } else {
    // 失败状态 (红点告警 + 连接失败标签)
    if (dot) dot.className = "w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]";
    if (dotCompact) {
      dotCompact.className = "w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)] ring-2 ring-rose-500/20";
      dotCompact.title = `连接失败: ${result.message}\n(点击检查配置)`;
    }
    if (text) text.innerText = `${result.model_name || 'API'} 连接失败`;
    if (badge) {
      badge.className = "text-[9px] font-mono px-1.5 py-0.5 rounded font-medium";
      badge.style.background = "rgba(244, 63, 94, 0.15)";
      badge.style.color = "#fb7185";
      badge.innerText = "连接失败";
    }
    if (container) container.title = `连接失败: ${result.message}\n(点击检查配置)`;
    if (transModelBadge) {
      transModelBadge.innerText = "异常";
      transModelBadge.style.color = "#fb7185";
    }
  }
}

// 加载支持的语种列表并恢复上次选择的语种
async function loadLanguages() {
  try {
    const res = await fetch('/api/settings/languages');
    const json = await res.json();
    if (json.status === 'success') {
      AppState.supportedLanguages = json.data;
      const srcSelect = document.getElementById('source-lang-select');
      const tgtSelect = document.getElementById('target-lang-select');
      const modalSelect = document.getElementById('modal-target-lang');
      
      const optionsHtml = json.data.map(l => `<option value="${l.code}">${l.flag ? l.flag + ' ' : ''}${l.name}</option>`).join('');

      // 恢复记忆的源语言与目标语言
      const rememberedSource = AppState.settings?.source_lang || localStorage.getItem('transfiler_source_lang') || 'zh';
      const rememberedTarget = AppState.settings?.target_lang || localStorage.getItem('transfiler_target_lang') || 'en';

      if (srcSelect) {
        srcSelect.innerHTML = optionsHtml;
        srcSelect.value = rememberedSource;
      }
      if (tgtSelect) {
        tgtSelect.innerHTML = optionsHtml;
        tgtSelect.value = rememberedTarget;
      }
      if (modalSelect) {
        modalSelect.innerHTML = optionsHtml;
        modalSelect.value = rememberedTarget || 'en';
      }
    }
  } catch (err) {
    console.error('加载语种列表失败:', err);
  }
}

// 恢复制作界面功能选项记忆（术语库绑定、排版规则）
function restoreTranslateOptions() {
  const rememberedGlossary = AppState.settings?.use_glossary || localStorage.getItem('transfiler_use_glossary') || '1';
  const glossarySelect = document.getElementById('glossary-binding-select');
  if (glossarySelect) {
    glossarySelect.value = rememberedGlossary;
  }

  const rememberedLayout = AppState.settings?.layout_mode || localStorage.getItem('transfiler_layout_mode') || 'zh_top';
  const layoutRadios = document.querySelectorAll('input[name="layout_mode"]');
  layoutRadios.forEach(r => {
    if (r.value === rememberedLayout) {
      r.checked = true;
    }
  });

  const transActiveModel = document.getElementById('trans-active-model-name');
  if (transActiveModel && AppState.settings?.model_name) {
    transActiveModel.innerText = AppState.settings.model_name;
  }
}

// 后台异步保存选项到数据库
async function saveOptionToBackend(optionObj) {
  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(optionObj)
    });
  } catch (e) {
    console.warn('异步保存配置失败:', e);
  }
}

// 更新侧边栏术语条目数
async function updateSidebarGlossaryCount() {
  try {
    const res = await fetch('/api/glossary');
    const json = await res.json();
    if (json.status === 'success') {
      const countElem = document.getElementById('sidebar-glossary-count');
      if (countElem) {
        countElem.innerText = `术语库：${json.total} 词条`;
      }
    }
  } catch (err) {
    console.error('获取术语库统计失败:', err);
  }
}

// 全局 Toast 提示函数
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-message');
  const toastIcon = document.getElementById('toast-icon');

  toastMsg.innerText = message;
  if (type === 'success') {
    toastIcon.className = "ph ph-check-circle text-emerald-400 text-sm";
  } else if (type === 'error') {
    toastIcon.className = "ph ph-warning-circle text-rose-400 text-sm";
  } else {
    toastIcon.className = "ph ph-info text-blue-400 text-sm";
  }

  toast.classList.remove('translate-y-16', 'opacity-0');
  setTimeout(() => {
    toast.classList.add('translate-y-16', 'opacity-0');
  }, 2800);
}
