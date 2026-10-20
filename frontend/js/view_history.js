// 视图 5：双语文件交付历史管理 (Taste Skill 统一规范)

async function loadHistoryList() {
  try {
    const res = await fetch('/api/history');
    const json = await res.json();
    if (json.status === 'success') {
      renderHistoryTable(json.data);
    }
  } catch (err) {
    console.error('获取历史记录失败:', err);
  }
}

function renderHistoryTable(tasks) {
  const tbody = document.getElementById('history-tbody');
  if (!tasks || tasks.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="p-8 text-center opacity-40 text-xs font-mono">暂无历史记录</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = tasks.map(t => {
    const timeStr = new Date(t.created_at * 1000).toLocaleString();
    return `
      <tr class="transition hover:bg-black/5 dark:hover:bg-white/5" style="border-color: var(--border-subtle);">
        <td class="p-3">
          <div class="font-medium text-xs flex items-center gap-1.5" style="color: var(--text-primary);">
            <i class="ph ph-file-check text-sm" style="color: var(--accent-primary);"></i>
            ${escapeHtml(t.file_name)}
          </div>
          <div class="text-[10px] font-mono opacity-50 mt-0.5 truncate max-w-md" style="color: var(--text-secondary);">${escapeHtml(t.export_path || '')}</div>
        </td>
        <td class="p-3">
          <span class="app-badge font-mono">${t.source_lang} &rarr; ${t.target_lang}</span>
        </td>
        <td class="p-3 text-xs font-mono opacity-80">${t.total_items} 单元</td>
        <td class="p-3 font-mono text-[11px] opacity-50">${timeStr}</td>
        <td class="p-3 text-right">
          <button onclick="openFolderInExplorer('${escapeJs(t.export_path)}')" class="px-2.5 py-1 text-xs font-medium border transition flex items-center gap-1 ml-auto btn-secondary">
            <i class="ph ph-folder-open text-xs"></i> 打开
          </button>
        </td>
      </tr>
    `;
  }).join('');
}
