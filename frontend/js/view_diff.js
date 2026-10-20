// 视图 2：左右双栏对比校对工作台 (支持左右栏双向同步滚动 & 双向语言排版)

let isSyncingLeftScroll = false;
let isSyncingRightScroll = false;

function renderDiffWorkspace() {
  const task = AppState.currentTask;
  if (!task || !task.items) return;

  const srcLang = (task.source_lang || 'zh').toUpperCase();
  const tgtLang = (task.target_lang || 'en').toUpperCase();
  const layoutMode = task.layout_mode || 'zh_top';

  document.getElementById('diff-file-name').innerHTML = `
    <i class="ph ph-file"></i> ${escapeHtml(task.file_name)}
    <span class="ml-1 opacity-70">(${srcLang} &rarr; ${tgtLang})</span>
  `;
  document.getElementById('diff-stats').innerHTML = `
    <i class="ph ph-check-circle"></i> ${task.items.length} 单元
  `;

  // 动态更新左右栏标题
  const leftTitleEl = document.getElementById('diff-left-title');
  const rightTitleEl = document.getElementById('diff-right-title');
  if (leftTitleEl) {
    leftTitleEl.innerText = `源文档 (${srcLang})`;
  }
  if (rightTitleEl) {
    if (layoutMode === 'zh_bottom') {
      rightTitleEl.innerText = `双语 (中文在下)`;
    } else if (layoutMode === 'replace') {
      rightTitleEl.innerText = `单语 (${tgtLang})`;
    } else {
      rightTitleEl.innerText = `双语 (中文在上)`;
    }
  }

  const leftContainer = document.getElementById('diff-left-container');
  const rightContainer = document.getElementById('diff-right-container');

  let leftHtml = '';
  let rightHtml = '';

  task.items.forEach((item, idx) => {
    const isTable = item.type.includes('table') || item.type.includes('cell');
    const typeLabel = isTable ? '表格' : '段落';
    const lineIndex = `L${String(idx + 1).padStart(2, '0')}`;

    // 术语命中徽章
    let glossaryBadges = '';
    if (item.matched_terms && item.matched_terms.length > 0) {
      glossaryBadges = item.matched_terms.map(t => 
        `<span class="app-badge app-badge-highlight" title="已强制应用术语规则">
          <i class="ph ph-tag"></i> ${escapeHtml(t.source)} &rarr; ${escapeHtml(t.target)}
        </span>`
      ).join('');
    }

    // 左侧原文卡片 (只读参考)
    leftHtml += `
      <div id="left-item-${item.id}" class="p-3 rounded-lg border transition" style="background-color: var(--bg-card); border-color: var(--border-subtle);">
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] font-mono opacity-50 font-medium">${lineIndex}</span>
            <span class="app-badge">${typeLabel}</span>
          </div>
          <span class="text-[10px] font-mono opacity-30">${item.id}</span>
        </div>
        <div class="text-xs leading-relaxed font-normal whitespace-pre-wrap select-text" style="color: var(--text-primary);">${escapeHtml(item.source_text)}</div>
      </div>
    `;

    // 右侧双语校对卡片 (根据 layoutMode 排版展示)
    let cardContentHtml = '';
    if (layoutMode === 'zh_bottom') {
      // 外文在上，中文在下
      if (task.source_lang === 'zh') {
        // 源是中文(下)，译是外文(上)
        cardContentHtml = `
          <div class="relative mb-1.5">
            <textarea 
              rows="2" 
              onblur="handleItemTextUpdate('${item.id}', this.value)"
              class="w-full rounded-lg px-2.5 py-1.5 text-xs leading-relaxed resize-y app-input font-mono"
              placeholder="输入译文..."
            >${escapeHtml(item.target_text || '')}</textarea>
          </div>
          <div class="text-xs font-semibold leading-relaxed opacity-80" style="color: var(--text-primary);">${escapeHtml(item.source_text)}</div>
        `;
      } else {
        // 源是外文(上)，译是中文(下)
        cardContentHtml = `
          <div class="text-xs font-semibold mb-1.5 leading-relaxed" style="color: var(--text-primary);">${escapeHtml(item.source_text)}</div>
          <div class="relative">
            <textarea 
              rows="2" 
              onblur="handleItemTextUpdate('${item.id}', this.value)"
              class="w-full rounded-lg px-2.5 py-1.5 text-xs leading-relaxed resize-y app-input font-mono"
              placeholder="输入译文..."
            >${escapeHtml(item.target_text || '')}</textarea>
          </div>
        `;
      }
    } else if (layoutMode === 'replace') {
      // 纯单语替换
      cardContentHtml = `
        <div class="relative">
          <textarea 
            rows="2" 
            onblur="handleItemTextUpdate('${item.id}', this.value)"
            class="w-full rounded-lg px-2.5 py-1.5 text-xs leading-relaxed resize-y app-input font-mono"
            placeholder="输入译文..."
          >${escapeHtml(item.target_text || '')}</textarea>
        </div>
      `;
    } else {
      // 默认 zh_top: 中文在上，外文在下
      if (task.source_lang === 'zh') {
        // 源是中文(上)，译是外文(下)
        cardContentHtml = `
          <div class="text-xs font-semibold mb-1.5 leading-relaxed" style="color: var(--text-primary);">${escapeHtml(item.source_text)}</div>
          <div class="relative">
            <textarea 
              rows="2" 
              onblur="handleItemTextUpdate('${item.id}', this.value)"
              class="w-full rounded-lg px-2.5 py-1.5 text-xs leading-relaxed resize-y app-input font-mono"
              placeholder="输入译文..."
            >${escapeHtml(item.target_text || '')}</textarea>
          </div>
        `;
      } else {
        // 源是外文(下)，译是中文(上)
        cardContentHtml = `
          <div class="relative mb-1.5">
            <textarea 
              rows="2" 
              onblur="handleItemTextUpdate('${item.id}', this.value)"
              class="w-full rounded-lg px-2.5 py-1.5 text-xs leading-relaxed resize-y app-input font-mono"
              placeholder="输入译文..."
            >${escapeHtml(item.target_text || '')}</textarea>
          </div>
          <div class="text-xs font-semibold leading-relaxed opacity-80" style="color: var(--text-primary);">${escapeHtml(item.source_text)}</div>
        `;
      }
    }

    rightHtml += `
      <div id="right-item-${item.id}" class="p-3 rounded-lg border transition group" style="background-color: var(--bg-card); border-color: var(--border-subtle);">
        <div class="flex items-center justify-between mb-1.5">
          <div class="flex items-center flex-wrap gap-1.5">
            <span class="text-[10px] font-mono opacity-50 font-medium">${lineIndex}</span>
            <span class="app-badge">${typeLabel}</span>
            ${glossaryBadges}
          </div>
          <button onclick="quickAddToGlossary('${escapeJs(item.source_text)}', '${escapeJs(item.target_text)}')" class="text-[11px] opacity-0 group-hover:opacity-100 transition flex items-center gap-1 hover:underline" style="color: var(--accent-primary);" title="将此人工修正沉淀至工厂术语库">
            <i class="ph ph-plus text-xs"></i> 加为术语
          </button>
        </div>
        ${cardContentHtml}
      </div>
    `;
  });

  leftContainer.innerHTML = leftHtml;
  rightContainer.innerHTML = rightHtml;

  // 绑定双向同步滚动
  bindSynchronizedScroll(leftContainer, rightContainer);
}

// 双向同步滚动绑定
function bindSynchronizedScroll(leftEl, rightEl) {
  if (!leftEl || !rightEl) return;

  leftEl.onscroll = () => {
    if (!isSyncingLeftScroll) {
      isSyncingRightScroll = true;
      const scrollPercentage = leftEl.scrollTop / (leftEl.scrollHeight - leftEl.clientHeight || 1);
      rightEl.scrollTop = scrollPercentage * (rightEl.scrollHeight - rightEl.clientHeight);
    }
    isSyncingLeftScroll = false;
  };

  rightEl.onscroll = () => {
    if (!isSyncingRightScroll) {
      isSyncingLeftScroll = true;
      const scrollPercentage = rightEl.scrollTop / (rightEl.scrollHeight - rightEl.clientHeight || 1);
      leftEl.scrollTop = scrollPercentage * (leftEl.scrollHeight - leftEl.clientHeight);
    }
    isSyncingRightScroll = false;
  };
}

// 实时更新单条翻译文字
async function handleItemTextUpdate(itemId, newText) {
  if (!AppState.currentTask) return;

  const item = AppState.currentTask.items.find(i => i.id === itemId);
  if (item && item.target_text !== newText) {
    item.target_text = newText;
    item.is_modified = true;

    try {
      await fetch('/api/task/update-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: AppState.currentTask.task_id,
          item_id: itemId,
          target_text: newText
        })
      });
      showToast('已保存修改', 'success');
    } catch (err) {
      console.error('更新条目失败:', err);
    }
  }
}

// 快速加入术语库
function quickAddToGlossary(source, target) {
  openGlossaryModal(null, source, target);
}

// 导出当前文档
async function exportCurrentDocument() {
  if (!AppState.currentTask) {
    showToast('暂无已转换的任务可导出', 'error');
    return;
  }

  showToast('正在按选择的排版规则重构并导出双语文件...', 'info');

  try {
    const res = await fetch('/api/task/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: AppState.currentTask.task_id,
        layout_mode: AppState.currentTask.layout_mode || 'zh_top'
      })
    });
    const json = await res.json();

    if (json.status === 'success') {
      AppState.lastExportPath = json.export_path;
      document.getElementById('export-modal-desc').innerText = `已生成：${json.export_filename}\n存放于：${json.export_path}`;
      
      const btnOpen = document.getElementById('btn-open-folder');
      btnOpen.onclick = () => openFolderInExplorer(json.export_path);

      document.getElementById('export-success-modal').classList.remove('hidden');
    } else {
      showToast(json.detail || '导出失败', 'error');
    }
  } catch (err) {
    showToast('导出异常: ' + err.message, 'error');
  }
}

function closeExportSuccessModal() {
  document.getElementById('export-success-modal').classList.add('hidden');
}

// 在资源管理器中打开
async function openFolderInExplorer(filePath) {
  try {
    await fetch('/api/history/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_path: filePath })
    });
  } catch (err) {
    showToast('打开文件夹失败: ' + err.message, 'error');
  }
}

// 搜索过滤对比条目
function filterDiffItems() {
  const keyword = document.getElementById('diff-search').value.toLowerCase().trim();
  if (!AppState.currentTask || !AppState.currentTask.items) return;

  AppState.currentTask.items.forEach(item => {
    const match = !keyword || 
      item.source_text.toLowerCase().includes(keyword) || 
      (item.target_text && item.target_text.toLowerCase().includes(keyword));
    
    const leftEl = document.getElementById(`left-item-${item.id}`);
    const rightEl = document.getElementById(`right-item-${item.id}`);

    if (leftEl) leftEl.style.display = match ? 'block' : 'none';
    if (rightEl) rightEl.style.display = match ? 'block' : 'none';
  });
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeJs(text) {
  if (!text) return '';
  return text.replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, ' ');
}
