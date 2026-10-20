// 视图 3：制造业专有术语库管理 (Taste Skill 统一规范)

let currentGlossaryData = [];

// 加载术语库列表
async function loadGlossaryList() {
  const keyword = document.getElementById('glossary-search').value.trim();
  const category = document.getElementById('glossary-cat-filter').value;

  let url = `/api/glossary?keyword=${encodeURIComponent(keyword)}`;
  if (category && category !== '全部') {
    url += `&category=${encodeURIComponent(category)}`;
  }

  try {
    const res = await fetch(url);
    const json = await res.json();

    if (json.status === 'success') {
      currentGlossaryData = json.data;
      renderGlossaryTable(json.data);
      loadGlossaryCategories();
      updateSidebarGlossaryCount();
    }
  } catch (err) {
    console.error('获取术语列表失败:', err);
  }
}

// 渲染术语表格
function renderGlossaryTable(terms) {
  const tbody = document.getElementById('glossary-tbody');
  if (!terms || terms.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="p-8 text-center opacity-40 text-xs font-mono">暂无术语</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = terms.map(t => `
    <tr class="transition hover:bg-black/5 dark:hover:bg-white/5" style="border-color: var(--border-subtle);">
      <td class="p-3 font-semibold text-xs" style="color: var(--text-primary);">${escapeHtml(t.source_term)}</td>
      <td class="p-3 font-medium text-xs font-mono" style="color: var(--accent-primary);">${escapeHtml(t.target_term)}</td>
      <td class="p-3 text-xs uppercase font-mono opacity-60">${t.target_lang}</td>
      <td class="p-3">
        <span class="app-badge">${escapeHtml(t.category || '通用')}</span>
      </td>
      <td class="p-3 text-right space-x-2 text-xs">
        <button onclick="openGlossaryModal(${t.id})" class="opacity-70 hover:opacity-100 transition font-medium" style="color: var(--accent-primary);">编辑</button>
        <button onclick="deleteGlossaryItem(${t.id})" class="opacity-60 hover:opacity-100 hover:text-rose-500 transition font-medium">删除</button>
      </td>
    </tr>
  `).join('');
}

// 加载分类下拉
async function loadGlossaryCategories() {
  try {
    const res = await fetch('/api/glossary/categories');
    const json = await res.json();
    if (json.status === 'success') {
      const select = document.getElementById('glossary-cat-filter');
      const currentVal = select.value;
      select.innerHTML = json.data.map(c => `<option value="${c}">${c}</option>`).join('');
      select.value = currentVal || '全部';
    }
  } catch (err) {
    console.error('加载分类失败:', err);
  }
}

// 打开弹窗（新建或编辑）
function openGlossaryModal(termId = null, defaultSource = '', defaultTarget = '') {
  const modal = document.getElementById('glossary-modal');
  const title = document.getElementById('glossary-modal-title');
  const inputId = document.getElementById('modal-term-id');
  const inputSource = document.getElementById('modal-source-term');
  const inputTarget = document.getElementById('modal-target-term');
  const inputLang = document.getElementById('modal-target-lang');
  const inputCat = document.getElementById('modal-category');

  if (termId) {
    const term = currentGlossaryData.find(t => t.id === termId);
    if (term) {
      title.innerText = '编辑术语';
      inputId.value = term.id;
      inputSource.value = term.source_term;
      inputTarget.value = term.target_term;
      inputLang.value = term.target_lang;
      inputCat.value = term.category || '通用';
    }
  } else {
    title.innerText = '新建术语';
    inputId.value = '';
    inputSource.value = defaultSource;
    inputTarget.value = defaultTarget;
    inputLang.value = 'en';
    inputCat.value = '通用';
  }

  modal.classList.remove('hidden');
}

function closeGlossaryModal() {
  document.getElementById('glossary-modal').classList.add('hidden');
}

// 保存弹窗词条
async function saveGlossaryModal() {
  const termId = document.getElementById('modal-term-id').value;
  const sourceTerm = document.getElementById('modal-source-term').value.trim();
  const targetTerm = document.getElementById('modal-target-term').value.trim();
  const targetLang = document.getElementById('modal-target-lang').value;
  const category = document.getElementById('modal-category').value.trim() || '通用';

  if (!sourceTerm || !targetTerm) {
    showToast('中文源词条与外文译文不能为空', 'error');
    return;
  }

  const payload = {
    source_term: sourceTerm,
    target_term: targetTerm,
    target_lang: targetLang,
    category: category
  };

  try {
    let res;
    if (termId) {
      res = await fetch(`/api/glossary/${termId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch('/api/glossary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    const json = await res.json();
    if (json.status === 'success') {
      showToast(termId ? '词条修改成功' : '词条创建成功', 'success');
      closeGlossaryModal();
      loadGlossaryList();
    } else {
      showToast(json.detail || '保存失败', 'error');
    }
  } catch (err) {
    showToast('保存异常: ' + err.message, 'error');
  }
}

// 删除词条
async function deleteGlossaryItem(termId) {
  if (!confirm('确定要删除该专有术语词条吗？')) return;

  try {
    const res = await fetch(`/api/glossary/${termId}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.status === 'success') {
      showToast('词条已删除', 'success');
      loadGlossaryList();
    }
  } catch (err) {
    showToast('删除失败: ' + err.message, 'error');
  }
}

// 批量导入术语表
async function handleGlossaryImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  showToast('正在导入术语表...', 'info');

  try {
    const res = await fetch('/api/glossary/import', {
      method: 'POST',
      body: formData
    });
    const json = await res.json();

    if (json.status === 'success') {
      showToast(json.message, 'success');
      loadGlossaryList();
    } else {
      showToast(json.detail || '导入失败', 'error');
    }
  } catch (err) {
    showToast('导入异常: ' + err.message, 'error');
  } finally {
    event.target.value = '';
  }
}

// 导出术语表为 Excel
function exportGlossaryExcel() {
  window.open('/api/glossary/export', '_blank');
}
