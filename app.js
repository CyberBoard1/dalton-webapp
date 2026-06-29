const RAW_BASE = 'https://raw.githubusercontent.com/ANSSI-FR/dalton/main/';
const OFFICIAL_REPO = 'https://github.com/ANSSI-FR/dalton';

const CSV_SOURCES = [
  './data/dalton.csv',
  `${RAW_BASE}Matrix/ALL-DRAFT-2026-06%20-%20Mesure%20Dalton%20Draft.csv`,
];

const VISUALS = {
  Administration: {
    label: 'Administration',
    local: './visualization/ADM-DRAFT-2026_06 - Administration.svg',
    remote: `${RAW_BASE}Visualization/ADM-DRAFT-2026_06%20-%20Administration.svg`,
  },
  Sauvegardes: {
    label: 'Sauvegardes',
    local: './visualization/BUP-DRAFT-2026_06 - Sauvegardes.svg',
    remote: `${RAW_BASE}Visualization/BUP-DRAFT-2026_06%20-%20Sauvegardes.svg`,
  },
  Nomadisme: {
    label: 'Nomadisme',
    local: './visualization/NOM-DRAFT-2026-06 - Nomadisme.svg',
    remote: `${RAW_BASE}Visualization/NOM-DRAFT-2026-06%20-%20Nomadisme.svg`,
  },
};

const FIELD_ALIASES = {
  id: ['ID'],
  theme: ['Thématique', 'Thematique'],
  title: ['Intitulé', 'Intitule'],
  palier: ['Palier', 'Pallier'],
  vertical: ['Verticale'],
  description: ['Description'],
  risk: ['Justification / Risque', 'Justification/Risque'],
  example: ["Exemple / Cas d'usage", "Exemple/Cas d’usage", "Exemple/Cas d'usage"],
  type: ['Type de mesure (M, M+ ou M-) ou de recommendation (R--, R-, R, R+)', 'Type de mesure'],
  linked: ['Mesure (M) ou recommendation (R) associée', 'Mesure associée'],
};

const state = {
  measures: [],
  filtered: [],
  filters: {
    query: '',
    theme: '',
    vertical: '',
    palier: '',
    type: '',
  },
  visibleLimit: 60,
  view: 'cards',
  roadmap: new Set(JSON.parse(localStorage.getItem('dalton-roadmap') || '[]')),
};

const els = {
  loadStatus: document.getElementById('loadStatus'),
  refreshData: document.getElementById('refreshData'),
  statTotal: document.getElementById('statTotal'),
  statThemes: document.getElementById('statThemes'),
  statVerticals: document.getElementById('statVerticals'),
  statRoadmap: document.getElementById('statRoadmap'),
  searchInput: document.getElementById('searchInput'),
  themeFilter: document.getElementById('themeFilter'),
  verticalFilter: document.getElementById('verticalFilter'),
  palierFilter: document.getElementById('palierFilter'),
  typeFilter: document.getElementById('typeFilter'),
  clearFilters: document.getElementById('clearFilters'),
  resultCount: document.getElementById('resultCount'),
  cardsView: document.getElementById('cardsView'),
  tableView: document.getElementById('tableView'),
  showMore: document.getElementById('showMore'),
  cardViewBtn: document.getElementById('cardViewBtn'),
  tableViewBtn: document.getElementById('tableViewBtn'),
  exportFiltered: document.getElementById('exportFiltered'),
  exportRoadmap: document.getElementById('exportRoadmap'),
  clearRoadmap: document.getElementById('clearRoadmap'),
  roadmapList: document.getElementById('roadmapList'),
  detailDialog: document.getElementById('detailDialog'),
  detailId: document.getElementById('detailId'),
  detailTitle: document.getElementById('detailTitle'),
  detailBody: document.getElementById('detailBody'),
  closeDialog: document.getElementById('closeDialog'),
  visualTitle: document.getElementById('visualTitle'),
  visualImage: document.getElementById('visualImage'),
  visualDownload: document.getElementById('visualDownload'),
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function compact(value, max = 220) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

function uniq(values) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' }));
}

function parseCsv(text, delimiter = ';') {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const cleaned = String(text || '').replace(/^\uFEFF/, '');

  for (let i = 0; i < cleaned.length; i += 1) {
    const char = cleaned[i];
    const next = cleaned[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(field);
      if (row.some((cell) => String(cell).trim() !== '')) rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((cell) => String(cell).trim() !== '')) rows.push(row);
  return rows;
}

function toObjects(rows) {
  const headerIndex = rows.findIndex((row) => row.some((cell) => normalize(cell) === 'id'));
  if (headerIndex === -1) throw new Error('En-tête CSV introuvable : colonne ID absente.');

  const headers = rows[headerIndex].map((header) => String(header).trim());
  return rows.slice(headerIndex + 1).map((row) => {
    const raw = {};
    headers.forEach((header, index) => {
      raw[header] = String(row[index] || '').trim();
    });
    return mapMeasure(raw);
  }).filter((measure) => measure.id && measure.title);
}

function getField(raw, aliases) {
  for (const alias of aliases) {
    if (raw[alias] !== undefined) return raw[alias];
    const foundKey = Object.keys(raw).find((key) => normalize(key) === normalize(alias));
    if (foundKey) return raw[foundKey];
  }
  return '';
}

function mapMeasure(raw) {
  const measure = {};
  for (const [key, aliases] of Object.entries(FIELD_ALIASES)) {
    measure[key] = getField(raw, aliases);
  }
  measure.searchText = normalize([
    measure.id,
    measure.theme,
    measure.title,
    measure.vertical,
    measure.palier,
    measure.description,
    measure.risk,
    measure.example,
    measure.type,
    measure.linked,
  ].join(' '));
  return measure;
}

async function fetchFirstAvailable(urls) {
  let lastError;
  for (const url of urls) {
    try {
      const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const text = await response.text();
      if (!text || text.length < 100) throw new Error('Réponse trop courte.');
      return { text, url };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Aucune source disponible.');
}

async function loadData() {
  setStatus('Chargement des mesures Dalton…');
  try {
    const { text, url } = await fetchFirstAvailable(CSV_SOURCES);
    const rows = parseCsv(text);
    state.measures = toObjects(rows);
    state.filtered = [...state.measures];
    state.visibleLimit = 60;
    populateFilters();
    applyFilters();
    setStatus(`Données chargées : ${state.measures.length} mesures depuis ${url.includes('raw.githubusercontent') ? 'GitHub ANSSI-FR/dalton' : 'le cache local'}.`, 'ok');
  } catch (error) {
    console.error(error);
    setStatus(`Impossible de charger Dalton. Vérifie l'accès réseau vers GitHub ou lance scripts/sync-dalton-data.sh sur ton VPS. Détail : ${error.message}`, 'error');
  }
}

function setStatus(message, kind = '') {
  els.loadStatus.textContent = message;
  els.loadStatus.className = `status-box ${kind}`.trim();
}

function populateFilters() {
  fillSelect(els.themeFilter, uniq(state.measures.map((m) => m.theme)), 'Toutes');
  fillSelect(els.verticalFilter, uniq(state.measures.map((m) => m.vertical)), 'Toutes');
  fillSelect(els.palierFilter, uniq(state.measures.map((m) => m.palier)), 'Tous');
  fillSelect(els.typeFilter, uniq(state.measures.map((m) => m.type)), 'Tous');
}

function fillSelect(select, values, emptyLabel) {
  const current = select.value;
  select.innerHTML = `<option value="">${escapeHtml(emptyLabel)}</option>` + values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
  if (values.includes(current)) select.value = current;
}

function readFilters() {
  state.filters.query = normalize(els.searchInput.value);
  state.filters.theme = els.themeFilter.value;
  state.filters.vertical = els.verticalFilter.value;
  state.filters.palier = els.palierFilter.value;
  state.filters.type = els.typeFilter.value;
}

function applyFilters() {
  readFilters();
  state.filtered = state.measures.filter((measure) => {
    if (state.filters.query && !measure.searchText.includes(state.filters.query)) return false;
    if (state.filters.theme && measure.theme !== state.filters.theme) return false;
    if (state.filters.vertical && measure.vertical !== state.filters.vertical) return false;
    if (state.filters.palier && measure.palier !== state.filters.palier) return false;
    if (state.filters.type && measure.type !== state.filters.type) return false;
    return true;
  });
  state.visibleLimit = 60;
  renderAll();
}

function renderAll() {
  renderStats();
  renderResults();
  renderRoadmap();
}

function renderStats() {
  els.statTotal.textContent = state.measures.length.toLocaleString('fr-FR');
  els.statThemes.textContent = uniq(state.measures.map((m) => m.theme)).length.toLocaleString('fr-FR');
  els.statVerticals.textContent = uniq(state.measures.map((m) => m.vertical)).length.toLocaleString('fr-FR');
  els.statRoadmap.textContent = state.roadmap.size.toLocaleString('fr-FR');
}

function renderResults() {
  const count = state.filtered.length;
  els.resultCount.textContent = `${count.toLocaleString('fr-FR')} résultat${count > 1 ? 's' : ''}`;
  const visible = state.filtered.slice(0, state.visibleLimit);
  els.showMore.classList.toggle('hidden', state.visibleLimit >= state.filtered.length);

  if (state.view === 'cards') {
    els.cardsView.classList.remove('hidden');
    els.tableView.classList.add('hidden');
    renderCards(visible);
  } else {
    els.cardsView.classList.add('hidden');
    els.tableView.classList.remove('hidden');
    renderTable(visible);
  }
}

function renderCards(measures) {
  if (!measures.length) {
    els.cardsView.innerHTML = '<p class="muted">Aucune mesure ne correspond aux filtres.</p>';
    return;
  }

  els.cardsView.innerHTML = measures.map((measure) => {
    const selected = state.roadmap.has(measure.id);
    return `
      <article class="measure-card" data-id="${escapeHtml(measure.id)}">
        <div class="card-top">
          <span class="measure-id">${escapeHtml(measure.id)}</span>
          <span class="meta-chip">Palier ${escapeHtml(measure.palier || '—')}</span>
        </div>
        <h3>${escapeHtml(measure.title)}</h3>
        <div class="measure-meta">
          <span class="meta-chip">${escapeHtml(measure.theme || 'Sans thématique')}</span>
          <span class="meta-chip">${escapeHtml(measure.vertical || 'Sans verticale')}</span>
          ${measure.type ? `<span class="meta-chip">${escapeHtml(measure.type)}</span>` : ''}
        </div>
        <p>${escapeHtml(compact(measure.description || measure.risk || 'Pas de description fournie.'))}</p>
        <div class="card-actions">
          <button type="button" data-action="detail" data-id="${escapeHtml(measure.id)}">Détail</button>
          <button type="button" data-action="roadmap" data-id="${escapeHtml(measure.id)}" class="${selected ? 'selected' : ''}">${selected ? 'Retirer' : 'Ajouter'} à la feuille</button>
        </div>
      </article>
    `;
  }).join('');
}

function renderTable(measures) {
  if (!measures.length) {
    els.tableView.innerHTML = '<p class="muted">Aucune mesure ne correspond aux filtres.</p>';
    return;
  }

  els.tableView.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Thématique</th>
          <th>Palier</th>
          <th>Verticale</th>
          <th>Intitulé</th>
          <th>Description</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${measures.map((measure) => `
          <tr>
            <td>${escapeHtml(measure.id)}</td>
            <td>${escapeHtml(measure.theme)}</td>
            <td>${escapeHtml(measure.palier)}</td>
            <td>${escapeHtml(measure.vertical)}</td>
            <td>${escapeHtml(measure.title)}</td>
            <td>${escapeHtml(compact(measure.description, 180))}</td>
            <td><button class="button small" type="button" data-action="detail" data-id="${escapeHtml(measure.id)}">Détail</button></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function findMeasure(id) {
  return state.measures.find((measure) => measure.id === id);
}

function openDetail(id) {
  const measure = findMeasure(id);
  if (!measure) return;
  els.detailId.textContent = `${measure.id} · ${measure.theme || 'Sans thématique'} · Palier ${measure.palier || '—'}`;
  els.detailTitle.textContent = measure.title;
  const sections = [
    ['Verticale', measure.vertical],
    ['Description', measure.description],
    ['Justification / Risque', measure.risk],
    ["Exemple / Cas d'usage", measure.example],
    ['Type', measure.type],
    ['Mesure ou recommandation associée', measure.linked],
  ].filter(([, value]) => String(value || '').trim());

  els.detailBody.innerHTML = sections.map(([label, value]) => `
    <section class="detail-section">
      <h3>${escapeHtml(label)}</h3>
      <p>${escapeHtml(value)}</p>
    </section>
  `).join('') || '<p class="muted">Aucun détail complémentaire.</p>';

  if (typeof els.detailDialog.showModal === 'function') els.detailDialog.showModal();
  else alert(`${measure.id} — ${measure.title}\n\n${measure.description}`);
}

function toggleRoadmap(id) {
  if (state.roadmap.has(id)) state.roadmap.delete(id);
  else state.roadmap.add(id);
  persistRoadmap();
  renderAll();
}

function persistRoadmap() {
  localStorage.setItem('dalton-roadmap', JSON.stringify([...state.roadmap]));
}

function renderRoadmap() {
  const items = [...state.roadmap].map(findMeasure).filter(Boolean)
    .sort((a, b) => String(a.palier).localeCompare(String(b.palier), 'fr', { numeric: true }) || a.id.localeCompare(b.id));

  if (!items.length) {
    els.roadmapList.innerHTML = '<p class="muted">Aucune mesure ajoutée. Clique sur “Ajouter à la feuille” depuis les cartes de mesures.</p>';
    return;
  }

  els.roadmapList.innerHTML = items.map((measure) => `
    <article class="roadmap-item">
      <div>
        <strong>${escapeHtml(measure.id)} — ${escapeHtml(measure.title)}</strong>
        <span>${escapeHtml(measure.theme)} · ${escapeHtml(measure.vertical)} · Palier ${escapeHtml(measure.palier || '—')}</span>
      </div>
      <button type="button" class="icon-button" data-action="roadmap" data-id="${escapeHtml(measure.id)}" aria-label="Retirer ${escapeHtml(measure.id)}">×</button>
    </article>
  `).join('');
}

function toCsv(measures) {
  const headers = ['ID', 'Thématique', 'Intitulé', 'Palier', 'Verticale', 'Description', 'Justification / Risque', "Exemple / Cas d'usage", 'Type', 'Associée'];
  const rows = measures.map((m) => [m.id, m.theme, m.title, m.palier, m.vertical, m.description, m.risk, m.example, m.type, m.linked]);
  return [headers, ...rows].map((row) => row.map(csvEscape).join(';')).join('\n');
}

function csvEscape(value) {
  const text = String(value || '');
  if (/[";\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function downloadFile(filename, content, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function setView(view) {
  state.view = view;
  els.cardViewBtn.classList.toggle('active', view === 'cards');
  els.tableViewBtn.classList.toggle('active', view === 'table');
  renderResults();
}

function setVisual(key) {
  const visual = VISUALS[key] || VISUALS.Administration;
  els.visualTitle.textContent = visual.label;
  els.visualImage.alt = `Carte Dalton ${visual.label}`;
  els.visualImage.onerror = () => {
    if (els.visualImage.src !== visual.remote) {
      els.visualImage.src = visual.remote;
    }
  };
  els.visualImage.src = visual.local;
  els.visualDownload.href = visual.remote;
  document.querySelectorAll('.visual-choice').forEach((button) => {
    button.classList.toggle('active', button.dataset.visual === key);
  });
}

function handleActionClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === 'detail') openDetail(id);
  if (action === 'roadmap') toggleRoadmap(id);
}

function resetFilters() {
  els.searchInput.value = '';
  els.themeFilter.value = '';
  els.verticalFilter.value = '';
  els.palierFilter.value = '';
  els.typeFilter.value = '';
  applyFilters();
}

function bindEvents() {
  [els.searchInput, els.themeFilter, els.verticalFilter, els.palierFilter, els.typeFilter].forEach((el) => {
    el.addEventListener('input', applyFilters);
    el.addEventListener('change', applyFilters);
  });
  els.clearFilters.addEventListener('click', resetFilters);
  els.refreshData.addEventListener('click', loadData);
  els.cardViewBtn.addEventListener('click', () => setView('cards'));
  els.tableViewBtn.addEventListener('click', () => setView('table'));
  els.showMore.addEventListener('click', () => {
    state.visibleLimit += 60;
    renderResults();
  });
  els.cardsView.addEventListener('click', handleActionClick);
  els.tableView.addEventListener('click', handleActionClick);
  els.roadmapList.addEventListener('click', handleActionClick);
  els.closeDialog.addEventListener('click', () => els.detailDialog.close());
  els.detailDialog.addEventListener('click', (event) => {
    if (event.target === els.detailDialog) els.detailDialog.close();
  });
  els.exportFiltered.addEventListener('click', () => downloadFile('dalton-selection.csv', toCsv(state.filtered)));
  els.exportRoadmap.addEventListener('click', () => {
    const items = [...state.roadmap].map(findMeasure).filter(Boolean);
    downloadFile('dalton-feuille-de-route.csv', toCsv(items));
  });
  els.clearRoadmap.addEventListener('click', () => {
    state.roadmap.clear();
    persistRoadmap();
    renderAll();
  });
  document.querySelectorAll('.visual-choice').forEach((button) => {
    button.addEventListener('click', () => setVisual(button.dataset.visual));
  });
}

bindEvents();
setVisual('Administration');
loadData();
console.info(`Dalton Web — données officielles : ${OFFICIAL_REPO}`);
