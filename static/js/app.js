/**
 * 3GPP EN-DC Configurations Explorer - Client Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // Application State
  const state = {
    records: [],
    currentPage: 1,
    pageSize: 50,
    totalInDb: 0,
    isUpdating: false,
    selectedRecordForModal: null
  };

  // DOM Elements
  const el = {
    // Inputs
    inputLteBands: document.getElementById('inputLteBands'),
    inputNrBands: document.getElementById('inputNrBands'),
    clearLteBtn: document.getElementById('clearLteBtn'),
    clearNrBtn: document.getElementById('clearNrBtn'),
    selectCategory: document.getElementById('selectCategory'),
    inputSearchText: document.getElementById('inputSearchText'),
    btnApplyFilter: document.getElementById('btnApplyFilter'),
    btnResetFilter: document.getElementById('btnResetFilter'),
    btnRefresh: document.getElementById('btnRefresh'),
    refreshBtnText: document.getElementById('refreshBtnText'),
    spinIcon: document.querySelector('.spin-icon'),

    // Chips
    lteQuickChips: document.getElementById('lteQuickChips'),
    nrQuickChips: document.getElementById('nrQuickChips'),

    // Meta & Header
    totalDbCount: document.getElementById('totalDbCount'),
    specInfo: document.getElementById('specInfo'),
    lastUpdated: document.getElementById('lastUpdated'),
    resultsCountBadge: document.getElementById('resultsCountBadge'),
    activeFiltersSummary: document.getElementById('activeFiltersSummary'),
    categoryBreakdown: document.getElementById('categoryBreakdown'),

    // Table & Pagination
    tableBody: document.getElementById('tableBody'),
    emptyState: document.getElementById('emptyState'),
    paginationBar: document.getElementById('paginationBar'),
    pageSizeSelect: document.getElementById('pageSizeSelect'),
    pageRangeText: document.getElementById('pageRangeText'),
    pageTotalCount: document.getElementById('pageTotalCount'),
    pageNumbers: document.getElementById('pageNumbers'),
    btnPrevPage: document.getElementById('btnPrevPage'),
    btnNextPage: document.getElementById('btnNextPage'),

    // Actions
    btnCopyResults: document.getElementById('btnCopyResults'),
    btnExportCsv: document.getElementById('btnExportCsv'),

    // Modal
    detailsModal: document.getElementById('detailsModal'),
    modalConfigTitle: document.getElementById('modalConfigTitle'),
    modalBody: document.getElementById('modalBody'),
    modalCloseBtn: document.getElementById('modalCloseBtn'),
    modalCloseFooterBtn: document.getElementById('modalCloseFooterBtn'),
    modalCopyBtn: document.getElementById('modalCopyBtn'),

    // Toast
    toast: document.getElementById('toastNotification'),
    toastMessage: document.getElementById('toastMessage')
  };

  // Toast Helper
  let toastTimer = null;
  function showToast(message, type = 'success') {
    if (toastTimer) clearTimeout(toastTimer);
    el.toastMessage.textContent = message;
    el.toast.style.display = 'flex';
    if (type === 'error') {
      el.toast.style.background = '#dc2626';
    } else {
      el.toast.style.background = '#0f172a';
    }
    toastTimer = setTimeout(() => {
      el.toast.style.display = 'none';
    }, 3500);
  }

  // Parse Band Helper for Input Sync
  function parseBandsFromStr(str) {
    if (!str) return [];
    const matches = str.match(/\d+/g);
    return matches ? Array.from(new Set(matches.map(Number))) : [];
  }

  // Sync Chips UI with text inputs
  function updateChipsState() {
    const lteBands = parseBandsFromStr(el.inputLteBands.value);
    const nrBands = parseBandsFromStr(el.inputNrBands.value);

    el.lteQuickChips.querySelectorAll('.chip').forEach(chip => {
      const b = Number(chip.dataset.band);
      chip.classList.toggle('active', lteBands.includes(b));
    });

    el.nrQuickChips.querySelectorAll('.chip').forEach(chip => {
      const b = Number(chip.dataset.band);
      chip.classList.toggle('active', nrBands.includes(b));
    });
  }

  // Toggle Chip Click
  function toggleChip(bandNum, inputElement, isNr = false) {
    const currentBands = parseBandsFromStr(inputElement.value);
    const index = currentBands.indexOf(bandNum);

    if (index > -1) {
      currentBands.splice(index, 1);
    } else {
      currentBands.push(bandNum);
      currentBands.sort((a, b) => a - b);
    }

    if (isNr) {
      inputElement.value = currentBands.map(b => `n${b}`).join(', ');
    } else {
      inputElement.value = currentBands.join(', ');
    }

    updateChipsState();
    applyFilter();
  }

  // Collect Current Filter Payload
  function getFilterPayload() {
    const matchMode = document.querySelector('input[name="matchMode"]:checked')?.value || 'all';
    return {
      lte_bands: el.inputLteBands.value.trim(),
      nr_bands: el.inputNrBands.value.trim(),
      match_mode: matchMode,
      category: el.selectCategory.value,
      search_text: el.inputSearchText.value.trim()
    };
  }

  // Fetch Filtered Data from API
  async function applyFilter() {
    const payload = getFilterPayload();
    try {
      const resp = await fetch('/api/filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await resp.json();

      if (data.status === 'ok') {
        state.records = data.records;
        state.totalInDb = data.total_in_db;
        state.currentPage = 1;

        renderResults(data);
        renderTable();
      } else {
        showToast('Error al filtrar combinaciones', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error de conexión al servidor', 'error');
    }
  }

  // Render Result Summary and Breakdown
  function renderResults(data) {
    const count = data.matched_count;
    el.resultsCountBadge.textContent = count.toLocaleString();
    el.totalDbCount.textContent = data.total_in_db.toLocaleString();

    // Active filters summary
    const summaryTags = [];
    if (data.query.lte_bands && data.query.lte_bands.length) {
      summaryTags.push(`<span class="filter-tag">LTE: ${data.query.lte_bands.map(b => `B${b}`).join(', ')}</span>`);
    }
    if (data.query.nr_bands && data.query.nr_bands.length) {
      summaryTags.push(`<span class="filter-tag">NR: ${data.query.nr_bands.join(', ')}</span>`);
    }
    if (data.query.match_mode) {
      const modeNames = { all: 'Todas (AND)', any: 'Cualquiera (OR)', exact: 'Exacta' };
      summaryTags.push(`<span class="filter-tag">Modo: ${modeNames[data.query.match_mode]}</span>`);
    }
    if (data.query.category && data.query.category !== 'all') {
      summaryTags.push(`<span class="filter-tag">Cat: ${data.query.category}</span>`);
    }
    if (data.query.search_text) {
      summaryTags.push(`<span class="filter-tag">Texto: "${data.query.search_text}"</span>`);
    }
    el.activeFiltersSummary.innerHTML = summaryTags.join('');

    // Category breakdown bar
    if (data.category_counts && count > 0) {
      const pills = Object.entries(data.category_counts)
        .sort((a, b) => b[1] - a[1])
        .map(([cat, c]) => `<span class="cat-stat-pill">${cat}: <strong>${c}</strong></span>`);
      el.categoryBreakdown.innerHTML = pills.join('');
      el.categoryBreakdown.style.display = 'flex';
    } else {
      el.categoryBreakdown.style.display = 'none';
    }
  }

  // Render Table Rows for Current Page
  function renderTable() {
    const total = state.records.length;
    el.pageTotalCount.textContent = total.toLocaleString();

    if (total === 0) {
      el.tableBody.innerHTML = '';
      el.emptyState.style.display = 'block';
      el.paginationBar.style.display = 'none';
      return;
    }

    el.emptyState.style.display = 'none';
    el.paginationBar.style.display = 'flex';

    // Pagination calculations
    const size = state.pageSize === 'all' ? total : parseInt(state.pageSize);
    const totalPages = Math.ceil(total / size) || 1;
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    if (state.currentPage < 1) state.currentPage = 1;

    const startIdx = (state.currentPage - 1) * size;
    const endIdx = Math.min(startIdx + size, total);
    el.pageRangeText.textContent = `${startIdx + 1} - ${endIdx}`;

    const pageRecords = state.records.slice(startIdx, endIdx);

    // Build rows
    const rowsHtml = pageRecords.map(r => {
      const ltePills = (r.lte_bands || []).map(b => `<span class="band-pill band-pill-lte">B${b}</span>`).join('');
      const nrPills = (r.nr_bands || []).map(b => `<span class="band-pill band-pill-nr">n${b}</span>`).join('');
      const ulText = r.uplink_config || '<span style="color:#94a3b8">—</span>';
      const detailEutra = r.eutra_detail || '';
      const detailNr = r.nr_detail || '';
      const detailCombine = detailEutra && detailNr ? `${detailEutra} / ${detailNr}` : (detailEutra || detailNr || '—');

      return `
        <tr data-id="${r.id}">
          <td class="col-config">${r.config}</td>
          <td class="col-category"><span class="category-badge">${r.category}</span></td>
          <td class="col-lte">${ltePills}</td>
          <td class="col-nr">${nrPills}</td>
          <td class="col-ul"><div class="ul-config-text">${ulText}</div></td>
          <td class="col-detail"><span class="detail-text">${detailCombine}</span></td>
          <td class="col-actions">
            <button type="button" class="btn btn-secondary btn-detail" data-id="${r.id}">
              Detalles
            </button>
          </td>
        </tr>
      `;
    }).join('');

    el.tableBody.innerHTML = rowsHtml;

    // Render page buttons
    renderPaginationButtons(totalPages);
  }

  // Render Page Number Buttons
  function renderPaginationButtons(totalPages) {
    el.btnPrevPage.disabled = state.currentPage <= 1;
    el.btnNextPage.disabled = state.currentPage >= totalPages;

    let pages = [];
    const maxButtons = 5;
    let start = Math.max(1, state.currentPage - 2);
    let end = Math.min(totalPages, start + maxButtons - 1);

    if (end - start < maxButtons - 1) {
      start = Math.max(1, end - maxButtons + 1);
    }

    for (let p = start; p <= end; p++) {
      pages.push(`
        <button type="button" class="page-num-btn ${p === state.currentPage ? 'active' : ''}" data-page="${p}">
          ${p}
        </button>
      `);
    }

    el.pageNumbers.innerHTML = pages.join('');
  }

  // Details Modal Rendering
  function showDetailsModal(recordId) {
    const record = state.records.find(r => r.id === Number(recordId));
    if (!record) return;

    state.selectedRecordForModal = record;
    el.modalConfigTitle.textContent = record.config;

    const lteBandsStr = (record.lte_bands || []).map(b => `B${b}`).join(', ');
    const nrBandsStr = (record.nr_bands || []).map(b => `n${b}`).join(', ');

    // Build Carrier Aggregation breakdown tables
    let lteClassesHtml = '';
    const lteClasses = record.carrier_classes?.lte || [];
    if (lteClasses.length) {
      lteClassesHtml = `
        <table class="carrier-table">
          <thead>
            <tr>
              <th>Banda LTE</th>
              <th>Clase de Ancho de Banda (BW Class)</th>
              <th>Component Carriers (CCs)</th>
            </tr>
          </thead>
          <tbody>
            ${lteClasses.map(c => `
              <tr>
                <td><strong>Band ${c.band}</strong></td>
                <td><span class="category-badge">${c.class}</span></td>
                <td>${c.ccs} CC</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    let nrClassesHtml = '';
    const nrClasses = record.carrier_classes?.nr || [];
    if (nrClasses.length) {
      nrClassesHtml = `
        <table class="carrier-table">
          <thead>
            <tr>
              <th>Banda 5G NR</th>
              <th>Clase de Ancho de Banda (BW Class)</th>
              <th>Component Carriers (CCs)</th>
            </tr>
          </thead>
          <tbody>
            ${nrClasses.map(c => `
              <tr>
                <td><strong>${c.band}</strong></td>
                <td><span class="category-badge">${c.class}</span></td>
                <td>${c.ccs} CC</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    // Intra-band extra bandwidth details
    let intraBwHtml = '';
    if (record.channel_bw_eutra || record.channel_bw_nr || record.max_bw_mhz) {
      intraBwHtml = `
        <div class="modal-section-title">Anchos de Banda de Canal e Intra-banda</div>
        <div class="info-grid" style="margin-bottom:12px;">
          ${record.bcs ? `
            <div class="info-box">
              <div class="info-box-label">Bandwidth Combination Set (BCS)</div>
              <div class="info-box-value">${record.bcs}</div>
            </div>
          ` : ''}
          ${record.max_bw_mhz ? `
            <div class="info-box">
              <div class="info-box-label">Ancho de Banda Agregado Máx</div>
              <div class="info-box-value">${record.max_bw_mhz} MHz</div>
            </div>
          ` : ''}
          ${record.channel_bw_eutra ? `
            <div class="info-box">
              <div class="info-box-label">Canales Soportados E-UTRA (MHz)</div>
              <div class="info-box-value">${record.channel_bw_eutra}</div>
            </div>
          ` : ''}
          ${record.channel_bw_nr ? `
            <div class="info-box">
              <div class="info-box-label">Canales Soportados NR (MHz)</div>
              <div class="info-box-value">${record.channel_bw_nr}</div>
            </div>
          ` : ''}
        </div>
      `;
    }

    el.modalBody.innerHTML = `
      <div class="info-grid">
        <div class="info-box">
          <div class="info-box-label">Categoría 3GPP</div>
          <div class="info-box-value">${record.category}</div>
        </div>
        <div class="info-box">
          <div class="info-box-label">Total Bandas Involucradas</div>
          <div class="info-box-value">${record.num_bands} bandas</div>
        </div>
        <div class="info-box">
          <div class="info-box-label">Bandas LTE (E-UTRA)</div>
          <div class="info-box-value" style="color:var(--lte-color);">${lteBandsStr || 'Ninguna'}</div>
        </div>
        <div class="info-box">
          <div class="info-box-label">Bandas 5G NR</div>
          <div class="info-box-value" style="color:var(--nr-color);">${nrBandsStr || 'Ninguna'}</div>
        </div>
      </div>

      <div class="info-box">
        <div class="info-box-label">Configuración Uplink (UL EN-DC)</div>
        <div class="info-box-value" style="word-break:break-all;">
          ${record.uplink_config || 'No indicada explícitamente en la especificación'}
        </div>
      </div>

      ${lteClassesHtml ? `
        <div class="modal-section-title">Component Carriers E-UTRA (LTE)</div>
        ${lteClassesHtml}
      ` : ''}

      ${nrClassesHtml ? `
        <div class="modal-section-title">Component Carriers NR (5G)</div>
        ${nrClassesHtml}
      ` : ''}

      ${intraBwHtml}

      <div class="info-box" style="background:#f1f5f9;border-left:4px solid var(--primary);">
        <div class="info-box-label">Referencia Técnica 3GPP</div>
        <div style="font-size:12px;margin-top:4px;color:var(--secondary);">
          Esta configuración está definida en la especificación <strong>3GPP TS 38.101-3</strong> (User Equipment radio transmission and reception; Part 3: Range 1 and Range 2 Interworking, EN-DC).
        </div>
      </div>
    `;

    el.detailsModal.style.display = 'flex';
  }

  function closeModal() {
    el.detailsModal.style.display = 'none';
    state.selectedRecordForModal = null;
  }

  // Copy Results to Clipboard
  async function copyResultsToClipboard() {
    if (!state.records.length) {
      showToast('No hay combinaciones para copiar', 'error');
      return;
    }

    // Format as clean TSV / table text
    const headers = ['Configuración EN-DC', 'Categoría', 'Bandas LTE', 'Bandas NR', 'Uplink EN-DC', 'Detalle EUTRA', 'Detalle NR'];
    const rows = state.records.map(r => [
      r.config,
      r.category,
      (r.lte_bands || []).map(b => `B${b}`).join(', '),
      (r.nr_bands || []).map(b => `n${b}`).join(', '),
      r.uplink_config || '',
      r.eutra_detail || '',
      r.nr_detail || ''
    ].join('\t'));

    const textToCopy = [headers.join('\t'), ...rows].join('\n');

    try {
      await navigator.clipboard.writeText(textToCopy);
      showToast(`¡${state.records.length.toLocaleString()} combinaciones copiadas al portapapeles!`);
    } catch (err) {
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = textToCopy;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      showToast(`¡${state.records.length.toLocaleString()} combinaciones copiadas al portapapeles!`);
    }
  }

  // Export to CSV
  function exportCsv() {
    const payload = getFilterPayload();
    const params = new URLSearchParams(payload);
    window.location.href = `/api/export/csv?${params.toString()}`;
    showToast('Iniciando descarga de archivo CSV...');
  }

  // Refresh Database from sqimway.com
  async function refreshDatabase() {
    if (state.isUpdating) return;
    state.isUpdating = true;
    el.btnRefresh.disabled = true;
    el.spinIcon.classList.add('spinning');
    el.refreshBtnText.textContent = 'Actualizando...';

    try {
      const resp = await fetch('/api/refresh', { method: 'POST' });
      const data = await resp.json();

      if (data.status === 'ok') {
        el.lastUpdated.textContent = data.last_updated;
        el.totalDbCount.textContent = data.total_records.toLocaleString();
        if (data.spec_info) el.specInfo.textContent = data.spec_info;

        showToast(`Base de datos actualizada: ${data.total_records.toLocaleString()} combinaciones`);
        applyFilter();
      } else {
        showToast(data.message || 'Error al actualizar', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error de conexión al intentar actualizar', 'error');
    } finally {
      state.isUpdating = false;
      el.btnRefresh.disabled = false;
      el.spinIcon.classList.remove('spinning');
      el.refreshBtnText.textContent = 'Actualizar Datos';
    }
  }

  // Event Listeners
  // Quick Chips LTE
  el.lteQuickChips.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (chip) {
      toggleChip(Number(chip.dataset.band), el.inputLteBands, false);
    }
  });

  // Quick Chips NR
  el.nrQuickChips.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (chip) {
      toggleChip(Number(chip.dataset.band), el.inputNrBands, true);
    }
  });

  // Input sync
  el.inputLteBands.addEventListener('input', () => {
    updateChipsState();
  });
  el.inputNrBands.addEventListener('input', () => {
    updateChipsState();
  });

  // Enter key trigger filter
  [el.inputLteBands, el.inputNrBands, el.inputSearchText].forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyFilter();
      }
    });
  });

  // Clear buttons
  el.clearLteBtn.addEventListener('click', () => {
    el.inputLteBands.value = '';
    updateChipsState();
    applyFilter();
  });
  el.clearNrBtn.addEventListener('click', () => {
    el.inputNrBands.value = '';
    updateChipsState();
    applyFilter();
  });

  // Match Mode Radio changes
  document.querySelectorAll('input[name="matchMode"]').forEach(radio => {
    radio.addEventListener('change', applyFilter);
  });

  // Category select change
  el.selectCategory.addEventListener('change', applyFilter);

  // Search text input change (debounce slightly)
  let searchTimer = null;
  el.inputSearchText.addEventListener('input', () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(applyFilter, 250);
  });

  // Filter & Reset buttons
  el.btnApplyFilter.addEventListener('click', applyFilter);
  el.btnResetFilter.addEventListener('click', () => {
    el.inputLteBands.value = '';
    el.inputNrBands.value = '';
    el.inputSearchText.value = '';
    el.selectCategory.value = 'all';
    const firstRadio = document.querySelector('input[name="matchMode"][value="all"]');
    if (firstRadio) firstRadio.checked = true;
    updateChipsState();
    applyFilter();
  });

  // Refresh Button
  el.btnRefresh.addEventListener('click', refreshDatabase);

  // Copy & Export
  el.btnCopyResults.addEventListener('click', copyResultsToClipboard);
  el.btnExportCsv.addEventListener('click', exportCsv);

  // Pagination events
  el.pageSizeSelect.addEventListener('change', () => {
    state.pageSize = el.pageSizeSelect.value;
    state.currentPage = 1;
    renderTable();
  });
  el.btnPrevPage.addEventListener('click', () => {
    if (state.currentPage > 1) {
      state.currentPage--;
      renderTable();
    }
  });
  el.btnNextPage.addEventListener('click', () => {
    state.currentPage++;
    renderTable();
  });
  el.pageNumbers.addEventListener('click', e => {
    const btn = e.target.closest('.page-num-btn');
    if (btn) {
      state.currentPage = Number(btn.dataset.page);
      renderTable();
    }
  });

  // Table action clicks (Details button)
  el.tableBody.addEventListener('click', e => {
    const detailBtn = e.target.closest('.btn-detail');
    if (detailBtn) {
      showDetailsModal(detailBtn.dataset.id);
    }
  });

  // Modal events
  el.modalCloseBtn.addEventListener('click', closeModal);
  el.modalCloseFooterBtn.addEventListener('click', closeModal);
  el.detailsModal.addEventListener('click', e => {
    if (e.target === el.detailsModal) closeModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && el.detailsModal.style.display === 'flex') {
      closeModal();
    }
  });
  el.modalCopyBtn.addEventListener('click', async () => {
    if (state.selectedRecordForModal) {
      try {
        await navigator.clipboard.writeText(state.selectedRecordForModal.config);
        showToast(`Configuración ${state.selectedRecordForModal.config} copiada`);
      } catch (err) {
        showToast('Error al copiar al portapapeles', 'error');
      }
    }
  });

  // Initial load
  updateChipsState();
  applyFilter();
});
