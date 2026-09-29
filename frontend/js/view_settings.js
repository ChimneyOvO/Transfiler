// 视图 4：系统设置与模型 API 配置 (v1.2.6: 取消预设平台，自主配置 URL 与 Key，并动态获取与选择模型)

async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const json = await res.json();
    if (json.status === 'success') {
      const data = json.data;
      AppState.settings = data;

      document.getElementById('settings-api-key').value = data.api_key || '';
      document.getElementById('settings-base-url').value = data.base_url || 'https://api.deepseek.com/v1';
      document.getElementById('settings-model-name').value = data.model_name || 'deepseek-chat';
      
      const exportDirInput = document.getElementById('settings-export-dir');
      if (exportDirInput) {
        exportDirInput.value = data.export_dir || '';
        if (!data.export_dir) {
          fetch('/api/settings/default-export-dir')
            .then(r => r.json())
            .then(d => {
              if (d.status === 'success' && d.default_export_dir) {
                exportDirInput.placeholder = d.default_export_dir;
              }
            })
            .catch(() => {});
        }
      }

      // 同步设置面板中的主题卡片高亮状态
      updateSettingsThemeCards(AppState.currentTheme || data.theme || 'dark');

      // 更新翻译制作界面中的当前模型显示
      updateTranslateViewModel(data.model_name || 'deepseek-chat');

      // 若已配置 API 接口地址，自动静默预拉取模型列表，以便用户一键选取
      if (data.base_url) {
        fetchModelsFromApi(true);
      }
    }
  } catch (err) {
    console.error('获取设置失败:', err);
  }
}

// 从配置的 API 拉取可用模型列表
async function fetchModelsFromApi(silent = false) {
  const baseUrlInput = document.getElementById('settings-base-url');
  const apiKeyInput = document.getElementById('settings-api-key');

  const baseUrl = (baseUrlInput?.value || AppState.settings?.base_url || '').trim();
  const apiKey = (apiKeyInput?.value !== undefined ? apiKeyInput.value : (AppState.settings?.api_key || '')).trim();

  if (!baseUrl) {
    if (!silent) showToast('请先输入 API 接口地址 (URL) 后再拉取模型', 'warning');
    return;
  }

  const btnFetch = document.getElementById('btn-fetch-models');
  if (btnFetch && !silent) {
    btnFetch.disabled = true;
    btnFetch.innerHTML = '<i class="ph ph-spinner animate-spin text-sm"></i> 正在拉取...';
  }

  const badge = document.getElementById('model-count-badge');
  const indicator = document.getElementById('api-conn-status-indicator');
  if (badge) {
    badge.innerText = '拉取中...';
    badge.style.background = 'rgba(251, 191, 36, 0.15)';
    badge.style.color = '#f59e0b';
  }

  try {
    const res = await fetch('/api/settings/fetch-models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_url: baseUrl,
        api_key: apiKey
      })
    });
    const json = await res.json();

    if (json.success && Array.isArray(json.models) && json.models.length > 0) {
      AppState.availableModels = json.models;
      const count = json.models.length;

      // 更新下拉选择器
      const select = document.getElementById('settings-model-select');
      const currentModelName = document.getElementById('settings-model-name')?.value.trim() || AppState.settings?.model_name || '';

      if (select) {
        select.innerHTML = `<option value="">-- 请从 ${count} 个可用模型中选取 --</option>`;
        json.models.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.id;
          opt.innerText = m.id + (m.owned_by ? ` (${m.owned_by})` : '');
          if (m.id === currentModelName) {
            opt.selected = true;
          }
          select.appendChild(opt);
        });

        // 若当前模型名称为空或未包含在列表中，且为非静默触发，可自动同步首选模型
        if (!currentModelName && json.models[0]) {
          document.getElementById('settings-model-name').value = json.models[0].id;
        }
      }

      // 更新徽章状态
      if (badge) {
        badge.innerText = `已发现 ${count} 个模型`;
        badge.style.background = 'var(--badge-highlight-bg)';
        badge.style.color = 'var(--badge-highlight-text)';
      }

      if (indicator) {
        indicator.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400"></span> API 连通正常 · 可用模型 ${count} 个`;
      }

      // 若模型弹窗处于开启状态，同步刷新弹窗内部列表
      const modal = document.getElementById('model-select-modal');
      if (modal && !modal.classList.contains('hidden')) {
        renderModelModalList(json.models);
      }

      if (!silent) {
        showToast(json.message || `成功从 API 获取到 ${count} 个可用模型`, 'success');
      }
    } else {
      AppState.availableModels = [];
      const select = document.getElementById('settings-model-select');
      if (select) {
        select.innerHTML = '<option value="">-- 未在该接口发现可用模型，请在下方手动输入 --</option>';
      }
      if (badge) {
        badge.innerText = '未自动获取 (支持手动输入)';
        badge.style.background = 'rgba(255, 255, 255, 0.05)';
        badge.style.color = 'var(--text-secondary)';
      }
      if (indicator) {
        indicator.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-400"></span> 接口未开放 /models 路由 (可手动填入模型)`;
      }

      if (!silent) {
        showToast(json.message || '未能拉取到模型列表，您仍可在下方手动指定模型名称', 'warning');
      }
    }
  } catch (err) {
    if (!silent) showToast('拉取模型异常: ' + err.message, 'error');
  } finally {
    if (btnFetch && !silent) {
      btnFetch.disabled = false;
      btnFetch.innerHTML = '<i class="ph ph-list-magnifying-glass text-sm"></i> 获取可用模型';
    }
  }
}

// 用户在设置面板下拉框中选中某模型
function handleModelSelectChange(selectedModel) {
  if (!selectedModel) return;
  const modelInput = document.getElementById('settings-model-name');
  if (modelInput) modelInput.value = selectedModel;

  // 立即持久化保存选取的模型
  saveOptionToBackend({ model_name: selectedModel });
  if (AppState.settings) AppState.settings.model_name = selectedModel;

  updateEngineStatusUI({ success: true, model_name: selectedModel });
  updateTranslateViewModel(selectedModel);
  showToast(`已选择并生效模型: ${selectedModel}`, 'info');
}

// 快速校验当前所选模型是否能正常进行对话推理
async function testCurrentModel() {
  const apiKey = document.getElementById('settings-api-key').value.trim();
  const baseUrl = document.getElementById('settings-base-url').value.trim();
  const modelName = document.getElementById('settings-model-name').value.trim();

  if (!modelName) {
    showToast('请先选择或输入模型名称后再进行校验', 'warning');
    return;
  }

  const btn = document.getElementById('btn-test-model');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="ph ph-spinner animate-spin text-xs"></i> 校验中...';
  }

  showToast(`正在向模型「${modelName}」发起推理校验...`, 'info');

  try {
    const res = await fetch('/api/settings/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        base_url: baseUrl,
        model_name: modelName
      })
    });
    const json = await res.json();

    if (json.success) {
      showToast(`模型「${modelName}」响应正常！已自动保存为当前首选模型`, 'success');
      await saveAllSettings(true);
      updateEngineStatusUI({
        success: true,
        model_name: modelName,
        message: json.message
      });
      updateTranslateViewModel(modelName);
    } else {
      showToast(`模型校验失败: ${json.message}`, 'error');
      alert(`【模型「${modelName}」校验未通过】\n\n${json.message}`);
    }
  } catch (err) {
    showToast('校验异常: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ph ph-lightning text-xs"></i> 校验模型';
    }
  }
}

// 浏览并选择本地导出目录
async function browseExportDir() {
  const currentVal = document.getElementById('settings-export-dir').value.trim();
  try {
    const res = await fetch('/api/settings/browse-export-dir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initial_dir: currentVal || '' })
    });
    const json = await res.json();
    if (json.status === 'success' && json.selected_dir) {
      document.getElementById('settings-export-dir').value = json.selected_dir;
      showToast(`已选择导出目录: ${json.selected_dir}`, 'success');
    }
  } catch (err) {
    showToast('选择目录异常: ' + err.message, 'error');
  }
}

// 在资源管理器中打开导出目录
async function openExportDir() {
  const currentVal = document.getElementById('settings-export-dir').value.trim();
  try {
    const res = await fetch('/api/settings/open-export-dir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ export_dir: currentVal || '' })
    });
    const json = await res.json();
    if (json.status === 'success') {
      showToast(json.message || '已在资源管理器中打开导出目录', 'success');
    } else {
      showToast(json.detail || '打开导出目录失败', 'error');
    }
  } catch (err) {
    showToast('打开目录异常: ' + err.message, 'error');
  }
}

// 恢复系统默认导出目录
async function resetExportDir() {
  try {
    const res = await fetch('/api/settings/default-export-dir');
    const json = await res.json();
    if (json.status === 'success' && json.default_export_dir) {
      document.getElementById('settings-export-dir').value = json.default_export_dir;
      showToast('已重置为系统默认导出路径: ' + json.default_export_dir, 'info');
    }
  } catch (err) {
    showToast('恢复默认路径失败: ' + err.message, 'error');
  }
}

// 在设置面板中切换主题卡片
function selectThemeInSettings(themeKey) {
  applyTheme(themeKey, true);
  saveOptionToBackend({ theme: themeKey });
  updateSettingsThemeCards(themeKey);
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('settings-api-key');
  const icon = document.getElementById('toggle-key-icon');
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'ph ph-eye-slash text-base';
  } else {
    input.type = 'password';
    icon.className = 'ph ph-eye text-base';
  }
}

// 测试连通性并自动拉取模型列表
async function testApiConnection() {
  const apiKey = document.getElementById('settings-api-key').value.trim();
  const baseUrl = document.getElementById('settings-base-url').value.trim();
  const modelName = document.getElementById('settings-model-name').value.trim();

  const isLocal = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1') || baseUrl.includes(':11434');
  if (!apiKey && !isLocal) {
    showToast('请输入 API Key 后再进行连通性测试', 'error');
    return;
  }

  const btnTest = document.getElementById('btn-test-conn');
  if (btnTest) {
    btnTest.disabled = true;
    btnTest.innerHTML = '<i class="ph ph-spinner animate-spin text-sm"></i> 正在测试...';
  }

  showToast('正在向大模型 API 发起连通性握手测试...', 'info');

  try {
    const res = await fetch('/api/settings/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        base_url: baseUrl,
        model_name: modelName
      })
    });
    const json = await res.json();

    if (json.success) {
      showToast(json.message, 'success');
      
      // 测试成功后自动静默保存配置并更新全局状态
      await saveAllSettings(true);
      updateEngineStatusUI({
        success: true,
        model_name: modelName,
        message: json.message
      });
      updateTranslateViewModel(modelName);

      // 紧接着自动拉取该 API 下的所有模型供用户选用
      await fetchModelsFromApi(true);
    } else {
      showToast(json.message, 'error');
      updateEngineStatusUI({
        success: false,
        model_name: modelName,
        message: json.message
      });
      alert(`【API 连接测试失败】\n\n${json.message}`);
    }
  } catch (err) {
    showToast('连接测试异常: ' + err.message, 'error');
  } finally {
    if (btnTest) {
      btnTest.disabled = false;
      btnTest.innerHTML = '<i class="ph ph-plugs-connected text-sm"></i> 测试连通性';
    }
  }
}

// 保存所有设置
async function saveAllSettings(silent = false) {
  const apiKey = document.getElementById('settings-api-key').value.trim();
  const baseUrl = document.getElementById('settings-base-url').value.trim();
  const modelName = document.getElementById('settings-model-name').value.trim();
  const exportDir = document.getElementById('settings-export-dir').value.trim();
  const theme = AppState.currentTheme || 'dark';

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'custom',
        api_key: apiKey,
        base_url: baseUrl,
        model_name: modelName,
        export_dir: exportDir,
        theme: theme
      })
    });
    const json = await res.json();

    if (json.status === 'success') {
      if (!silent) showToast('系统与模型设置已成功保存！', 'success');
      loadInitialSettings();
      updateTranslateViewModel(modelName);
    } else {
      if (!silent) showToast(json.detail || '保存失败', 'error');
    }
  } catch (err) {
    if (!silent) showToast('保存异常: ' + err.message, 'error');
  }
}

// ================= 全局模型选择与切换弹窗控制 =================

// 打开模型选择弹窗
function openModelSelectionModal() {
  const modal = document.getElementById('model-select-modal');
  if (!modal) return;

  const baseUrl = (document.getElementById('settings-base-url')?.value || AppState.settings?.base_url || '').trim();
  const tip = document.getElementById('model-modal-endpoint-tip');
  if (tip) tip.innerText = baseUrl ? `已配置端点: ${baseUrl}` : '未配置 API 接口地址';

  modal.classList.remove('hidden');

  // 若尚未拉取模型列表，先执行一次拉取
  if (!AppState.availableModels || AppState.availableModels.length === 0) {
    fetchModelsFromApi(true).then(() => {
      renderModelModalList(AppState.availableModels || []);
    });
  } else {
    renderModelModalList(AppState.availableModels);
  }

  // 清空搜索框
  const searchInput = document.getElementById('model-modal-search');
  if (searchInput) {
    searchInput.value = '';
    searchInput.focus();
  }
}

// 关闭模型选择弹窗
function closeModelSelectionModal() {
  const modal = document.getElementById('model-select-modal');
  if (modal) modal.classList.add('hidden');
}

// 渲染弹窗中的模型列表
function renderModelModalList(models) {
  const container = document.getElementById('model-modal-list');
  const countSpan = document.getElementById('model-modal-count');
  if (!container) return;

  const currentModel = document.getElementById('settings-model-name')?.value.trim() || AppState.settings?.model_name || '';

  if (!models || models.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-xs opacity-60" style="color: var(--text-secondary);">
        <i class="ph ph-warning-circle text-2xl mb-1 block"></i>
        暂未从当前 API 获取到模型列表<br>
        您可以点击右上角「重新拉取」，或在下方直接输入模型名称使用。
      </div>
    `;
    if (countSpan) countSpan.innerText = '已发现 0 个模型';
    return;
  }

  if (countSpan) countSpan.innerText = `已发现 ${models.length} 个模型`;

  container.innerHTML = '';
  models.forEach(m => {
    const isSelected = (m.id === currentModel);
    const itemDiv = document.createElement('div');
    itemDiv.className = `p-2.5 rounded-lg border cursor-pointer transition flex items-center justify-between ${
      isSelected 
        ? 'border-blue-500/60 bg-blue-500/10 shadow-sm' 
        : 'hover:border-blue-500/30 hover:bg-white/5'
    }`;
    itemDiv.style.borderColor = isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)';

    itemDiv.onclick = () => selectModelFromModal(m.id);

    itemDiv.innerHTML = `
      <div class="flex items-center gap-2 overflow-hidden">
        <i class="ph ph-cpu text-sm flex-shrink-0" style="color: ${isSelected ? 'var(--accent-primary)' : 'var(--text-secondary)'};"></i>
        <div class="truncate">
          <div class="text-xs font-mono font-medium ${isSelected ? 'font-semibold' : ''}" style="color: var(--text-primary);">${m.id}</div>
          ${m.owned_by ? `<div class="text-[10px] font-mono opacity-50 truncate" style="color: var(--text-secondary);">by ${m.owned_by}</div>` : ''}
        </div>
      </div>
      <div class="flex-shrink-0">
        ${isSelected 
          ? `<span class="text-[9px] font-mono px-1.5 py-0.5 rounded font-semibold" style="background: var(--accent-primary); color: #fff;">当前使用 ✔</span>`
          : `<span class="text-[10px] font-mono opacity-40 hover:opacity-100" style="color: var(--text-secondary);">选取</span>`
        }
      </div>
    `;

    container.appendChild(itemDiv);
  });
}

// 弹窗搜索过滤模型
function filterModelModalList(query) {
  const q = (query || '').trim().toLowerCase();
  const allModels = AppState.availableModels || [];
  if (!q) {
    renderModelModalList(allModels);
    return;
  }
  const filtered = allModels.filter(m => m.id.toLowerCase().includes(q) || (m.owned_by && m.owned_by.toLowerCase().includes(q)));
  renderModelModalList(filtered);
}

// 从弹窗中选取模型生效
function selectModelFromModal(modelId) {
  if (!modelId) return;

  const modelInput = document.getElementById('settings-model-name');
  if (modelInput) modelInput.value = modelId;

  const select = document.getElementById('settings-model-select');
  if (select) select.value = modelId;

  // 持久化保存
  saveOptionToBackend({ model_name: modelId });
  if (AppState.settings) AppState.settings.model_name = modelId;

  updateEngineStatusUI({ success: true, model_name: modelId });
  updateTranslateViewModel(modelId);
  closeModelSelectionModal();
  showToast(`已切换至模型: ${modelId}`, 'success');
}

// 弹窗中应用自定义输入的模型
function applyCustomModelFromModal() {
  const customInput = document.getElementById('model-modal-custom-input');
  const val = (customInput?.value || '').trim();
  if (!val) {
    showToast('请输入有效的模型名称', 'warning');
    return;
  }
  selectModelFromModal(val);
  if (customInput) customInput.value = '';
}

// 同步文档制作界面的推理模型名称展示
function updateTranslateViewModel(modelName) {
  const el = document.getElementById('trans-active-model-name');
  if (el && modelName) {
    el.innerText = modelName;
  }
}
