// 视图 1：文档上传与翻译流处理 (第一版经典排版 + 双向语言互译与排版记忆)

let selectedFile = null;

document.addEventListener('DOMContentLoaded', () => {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
      }
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dropzone-hover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dropzone-hover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dropzone-hover');
      if (e.dataTransfer.files.length > 0) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
    });
  }

  // 监听选项变更并自动记忆持久化
  const srcSelect = document.getElementById('source-lang-select');
  if (srcSelect) {
    srcSelect.addEventListener('change', (e) => {
      localStorage.setItem('transfiler_source_lang', e.target.value);
      saveOptionToBackend({ source_lang: e.target.value });
    });
  }

  const tgtSelect = document.getElementById('target-lang-select');
  if (tgtSelect) {
    tgtSelect.addEventListener('change', (e) => {
      localStorage.setItem('transfiler_target_lang', e.target.value);
      saveOptionToBackend({ target_lang: e.target.value });
    });
  }

  const glossarySelect = document.getElementById('glossary-binding-select');
  if (glossarySelect) {
    glossarySelect.addEventListener('change', (e) => {
      localStorage.setItem('transfiler_use_glossary', e.target.value);
      saveOptionToBackend({ use_glossary: e.target.value });
    });
  }

  const layoutRadios = document.querySelectorAll('input[name="layout_mode"]');
  layoutRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      if (e.target.checked) {
        localStorage.setItem('transfiler_layout_mode', e.target.value);
        saveOptionToBackend({ layout_mode: e.target.value });
      }
    });
  });
});

// 一键互换源语言与目标语言并持久化
function swapLanguages() {
  const srcSelect = document.getElementById('source-lang-select');
  const tgtSelect = document.getElementById('target-lang-select');
  if (srcSelect && tgtSelect) {
    const temp = srcSelect.value;
    srcSelect.value = tgtSelect.value;
    tgtSelect.value = temp;

    // 持久化记忆
    localStorage.setItem('transfiler_source_lang', srcSelect.value);
    localStorage.setItem('transfiler_target_lang', tgtSelect.value);
    saveOptionToBackend({
      source_lang: srcSelect.value,
      target_lang: tgtSelect.value
    });

    showToast(`已互换语言方向并保存`, 'info');
  }
}

// 处理选中的文件并上传解析
async function handleFileSelect(file) {
  const validExts = ['.docx', '.xlsx', '.csv', '.doc', '.pptx', '.ppt'];
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  if (!validExts.includes(ext)) {
    showToast('仅支持 .docx / .xlsx / .csv / .doc / .pptx / .ppt 格式文件', 'error');
    return;
  }

  selectedFile = file;

  // 上传并解析文件
  const formData = new FormData();
  formData.append('file', file);

  showToast(`正在解析文档结构: ${file.name}...`, 'info');

  try {
    const res = await fetch('/api/task/upload', {
      method: 'POST',
      body: formData
    });
    const json = await res.json();

    if (json.status === 'success') {
      AppState.currentTask = json;

      // 更新界面卡片展示 (第一版经典排版)
      document.getElementById('dropzone').classList.add('hidden');
      const fileCard = document.getElementById('file-card');
      fileCard.classList.remove('hidden');
      
      document.getElementById('file-card-name').innerText = json.file_name;
      const sizeKb = (json.file_size / 1024).toFixed(1);
      const sizeEl = document.getElementById('file-card-size');
      if (sizeEl) sizeEl.innerText = `${sizeKb} KB`;
      
      const countEl = document.getElementById('file-card-items-count');
      if (countEl) countEl.innerText = `${json.total_items} 项`;

      showToast(`解析成功，共 ${json.total_items} 项`, 'success');
    } else {
      showToast(json.detail || '解析文件失败', 'error');
    }
  } catch (err) {
    showToast('上传解析异常: ' + err.message, 'error');
  }
}

// 清除当前选择的文件
function clearSelectedFile() {
  selectedFile = null;
  AppState.currentTask = null;
  document.getElementById('dropzone').classList.remove('hidden');
  document.getElementById('file-card').classList.add('hidden');
  document.getElementById('progress-panel').classList.add('hidden');
  document.getElementById('file-input').value = '';
}

// 开始智能双语转换流程 (支持双向语言与排版规则)
async function startTranslationProcess() {
  if (!AppState.currentTask) {
    showToast('请先选择或拖入待制作的工业制造文档', 'error');
    return;
  }

  const sourceLang = document.getElementById('source-lang-select').value;
  const targetLang = document.getElementById('target-lang-select').value;

  if (sourceLang === targetLang) {
    showToast('源文档语言与目标翻译语言不能相同', 'error');
    return;
  }

  const useGlossary = document.getElementById('glossary-binding-select').value === '1';
  const layoutMode = document.querySelector('input[name="layout_mode"]:checked')?.value || 'zh_top';

  // 记忆当前选项
  localStorage.setItem('transfiler_source_lang', sourceLang);
  localStorage.setItem('transfiler_target_lang', targetLang);
  localStorage.setItem('transfiler_use_glossary', useGlossary ? '1' : '0');
  localStorage.setItem('transfiler_layout_mode', layoutMode);
  saveOptionToBackend({
    source_lang: sourceLang,
    target_lang: targetLang,
    use_glossary: useGlossary ? '1' : '0',
    layout_mode: layoutMode
  });

  // 显示进度条面板
  const progressPanel = document.getElementById('progress-panel');
  const progressBar = document.getElementById('progress-bar');
  const progressPercent = document.getElementById('progress-percent');
  const btnStart = document.getElementById('btn-start-translate');

  progressPanel.classList.remove('hidden');
  btnStart.disabled = true;
  btnStart.classList.add('opacity-50', 'cursor-not-allowed');

  // 进度动画模拟
  let progress = 15;
  progressBar.style.width = `${progress}%`;
  progressPercent.innerText = `${progress}%`;

  const interval = setInterval(() => {
    if (progress < 85) {
      progress += Math.floor(Math.random() * 8) + 3;
      progressBar.style.width = `${progress}%`;
      progressPercent.innerText = `${progress}%`;
    }
  }, 350);

  try {
    const res = await fetch('/api/task/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: AppState.currentTask.task_id,
        source_lang: sourceLang,
        target_lang: targetLang,
        layout_mode: layoutMode,
        use_glossary: useGlossary
      })
    });

    clearInterval(interval);
    const json = await res.json();

    if (json.status === 'success') {
      progressBar.style.width = '100%';
      progressPercent.innerText = '100%';

      AppState.currentTask.items = json.items;
      AppState.currentTask.source_lang = json.source_lang;
      AppState.currentTask.target_lang = json.target_lang;
      AppState.currentTask.layout_mode = json.layout_mode;
      AppState.currentTask.glossary_hit_count = json.glossary_hit_count;
      AppState.currentTask.cost_time = json.cost_time;

      showToast(`制作完成 (${json.cost_time}s)`, 'success');

      // 更新右侧 Diff 工作台徽章
      const diffBadge = document.getElementById('diff-badge');
      diffBadge.innerText = json.total_items;
      diffBadge.classList.remove('hidden');

      // 0.4 秒后自动跳转到【对比与校对】工作台
      setTimeout(() => {
        btnStart.disabled = false;
        btnStart.classList.remove('opacity-50', 'cursor-not-allowed');
        progressPanel.classList.add('hidden');
        switchTab('diff');
        renderDiffWorkspace();
      }, 400);

    } else {
      btnStart.disabled = false;
      btnStart.classList.remove('opacity-50', 'cursor-not-allowed');
      progressPanel.classList.add('hidden');
      showToast(json.detail || '翻译处理失败', 'error');
    }
  } catch (err) {
    clearInterval(interval);
    btnStart.disabled = false;
    btnStart.classList.remove('opacity-50', 'cursor-not-allowed');
    progressPanel.classList.add('hidden');
    showToast('翻译请求异常: ' + err.message, 'error');
  }
}
