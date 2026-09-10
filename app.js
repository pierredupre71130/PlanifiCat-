(function () {
  'use strict';

  const STORAGE_KEY = 'planificat-data-v1';
  const DAY_MS = 86400000;

  // Toutes les dates sont manipulées en UTC pur (Date.UTC / getUTCDate...)
  // pour éviter tout décalage lié au fuseau horaire local : mélanger une
  // lecture locale (ex: new Date().toISOString()) avec une écriture UTC
  // (ou l'inverse) fait dériver le calcul de +/-1 jour selon l'heure et le
  // fuseau de l'appareil, ce qui peut carrément bloquer "jour + 1" sur le
  // même jour.
  function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function addDaysISO(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() + n);
    return date.toISOString().slice(0, 10);
  }

  function defaultState() {
    return {
      updatedAt: new Date().toISOString(),
      settings: {
        tolerance: 60,
        marginMin: 5,
        defaultTime: '06:25',
        anchorEnabled: false,
        anchor: { date: todayISO(), time: '06:25' },
        avoidNightEnabled: true,
        avoidNightStart: '23:00',
        avoidNightEnd: '05:00',
      },
      days: {}, // 'YYYY-MM-DD' -> { absences: [{id,label,start,end}] }
      sync: {
        owner: '',
        repo: '',
        token: '',
        path: 'data.json',
        sha: null,
        lastSyncedAt: null,
      },
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      const base = defaultState();
      return {
        ...base,
        ...parsed,
        settings: { ...base.settings, ...(parsed.settings || {}) },
        sync: { ...base.sync, ...(parsed.sync || {}) },
      };
    } catch (e) {
      console.error('Lecture des données impossible, réinitialisation.', e);
      return defaultState();
    }
  }

  // touch=false pour les écritures qui ne concernent que la synchro elle-même
  // (sha, lastSyncedAt) : elles ne doivent pas redéclencher une synchro.
  function saveState({ touch = true } = {}) {
    if (touch) state.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (touch) scheduleAutoSync();
  }

  let state = loadState();
  let uidCounter = 1;
  function uid() {
    return 'a' + Date.now().toString(36) + (uidCounter++).toString(36);
  }

  // Fenêtre glissante fixe (pas de réglage manuel) : toujours "aujourd'hui"
  // + les 27 jours suivants, recalculée à chaque ouverture de l'app.
  const WINDOW_DAYS = 28;
  function listDates() {
    const dates = [];
    let cur = todayISO();
    for (let i = 0; i < WINDOW_DAYS; i++) {
      dates.push(cur);
      cur = addDaysISO(cur, 1);
    }
    return dates;
  }

  const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const WEEKDAYS_SHORT = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const MONTHS_SHORT = ['jan.', 'fév.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  function formatDayTitle(iso) {
    const d = new Date(iso + 'T00:00:00');
    return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  }

  function formatShortDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  }

  const daystripEl = document.getElementById('daystrip');
  const dayDetailEl = document.getElementById('dayDetail');
  const chipTemplate = document.getElementById('chipTemplate');
  const dayTemplate = document.getElementById('dayTemplate');
  const absenceTemplate = document.getElementById('absenceTemplate');

  // Jour actuellement affiché dans le panneau de détail sous le bandeau.
  let selectedDate = null;
  function ensureSelectedDate() {
    const dates = listDates();
    if (!dates.includes(selectedDate)) {
      selectedDate = dates.includes(todayISO()) ? todayISO() : dates[0];
    }
  }

  function getDayData(iso) {
    if (!state.days[iso]) state.days[iso] = { absences: [] };
    return state.days[iso];
  }

  function buildSchedulerInput() {
    return listDates().map((iso) => {
      const day = getDayData(iso);
      return {
        date: iso,
        absences: day.absences.filter((a) => a.start && a.end),
        overrides: day.overrides || [null, null],
      };
    });
  }

  // Fixe ou libère manuellement l'horaire du créneau `slotIndex` (0 ou 1)
  // d'un jour. `time` à null repasse ce créneau en calcul automatique.
  function setOverride(iso, slotIndex, time) {
    const day = getDayData(iso);
    if (!Array.isArray(day.overrides)) day.overrides = [null, null];
    day.overrides[slotIndex] = time;
    saveState();
    recompute();
  }

  function buildSettings() {
    const s = state.settings;
    const settings = {
      tolerance: Number(s.tolerance) || 60,
      marginMin: Number(s.marginMin) || 0,
      defaultTime: s.defaultTime || '06:25',
    };
    if (s.anchorEnabled && s.anchor && s.anchor.time) {
      settings.anchor = { date: s.anchor.date, time: s.anchor.time };
    }
    if (s.avoidNightEnabled && s.avoidNightStart && s.avoidNightEnd) {
      settings.avoidNightStart = s.avoidNightStart;
      settings.avoidNightEnd = s.avoidNightEnd;
    }
    return settings;
  }

  let lastSchedule = [];

  function recompute() {
    const days = buildSchedulerInput();
    lastSchedule = days.length ? computeSchedule(days, buildSettings()) : [];
    updateStripStatuses();
    renderDetailResults();
    renderSummaryTable();
  }

  function scheduleByDate() {
    const byDate = {};
    for (const d of lastSchedule) byDate[d.date] = d.times;
    return byDate;
  }

  function minutesToHM(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function renderDetailResults() {
    const card = dayDetailEl.querySelector(`[data-date="${selectedDate}"]`);
    if (!card) return;
    const resultsEl = card.querySelector('.results');
    resultsEl.innerHTML = '';
    const times = scheduleByDate()[selectedDate] || [];
    times.forEach((t, idx) => {
      const isManual = t.warnings.includes('manuel');
      const chip = document.createElement('div');
      let cls = 'result-chip';
      if (t.warnings.includes('creneau-impossible')) cls += ' danger';
      else if (t.warnings.includes('ecart-hors-tolerance') || t.warnings.includes('nuit')) cls += ' warn';
      if (isManual) cls += ' manual';
      chip.className = cls;

      let noteText = t.gapFromPrevLabel ? `écart ${t.gapFromPrevLabel}` : '';
      if (t.warnings.includes('creneau-impossible')) noteText += ' · créneau impossible !';
      else if (t.warnings.includes('nuit')) noteText += ' · horaire de nuit';
      if (isManual) noteText += ' · fixé manuellement';

      const label = document.createElement('span');
      label.className = 'chip-emoji';
      label.textContent = '💉';

      const input = document.createElement('input');
      input.type = 'time';
      input.className = 'result-time-input';
      input.value = minutesToHM(t.minutes);
      input.addEventListener('change', () => setOverride(selectedDate, idx, input.value));

      const gapSpan = document.createElement('span');
      gapSpan.className = 'gap';
      gapSpan.textContent = noteText;

      chip.appendChild(label);
      chip.appendChild(input);
      chip.appendChild(gapSpan);

      if (isManual) {
        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'reset-override';
        resetBtn.title = 'Revenir au calcul automatique';
        resetBtn.textContent = '↺ auto';
        resetBtn.addEventListener('click', () => setOverride(selectedDate, idx, null));
        chip.appendChild(resetBtn);
      }

      resultsEl.appendChild(chip);
    });
  }

  const summaryTableBody = document.getElementById('summaryTableBody');
  const printRangeEl = document.getElementById('printRange');

  function renderSummaryTable() {
    const byDate = scheduleByDate();
    const dates = listDates();
    summaryTableBody.innerHTML = '';
    for (const iso of dates) {
      const times = byDate[iso] || [];
      const tr = document.createElement('tr');
      const hasDanger = times.some((t) => t.warnings.includes('creneau-impossible'));
      const hasWarn = times.some((t) => t.warnings.includes('ecart-hors-tolerance') || t.warnings.includes('nuit'));
      if (hasDanger) tr.className = 'status-danger';
      else if (hasWarn) tr.className = 'status-warn';

      const dayCell = document.createElement('td');
      dayCell.textContent = formatShortDate(iso);
      tr.appendChild(dayCell);

      for (let i = 0; i < 2; i++) {
        const t = times[i];
        const td = document.createElement('td');
        td.className = 'time-cell';
        if (t) {
          let note = '';
          if (t.warnings.includes('creneau-impossible')) note = 'impossible';
          else if (t.warnings.includes('nuit')) note = 'nuit';
          if (t.warnings.includes('manuel')) note = note ? `${note}, manuel` : 'manuel';
          td.innerHTML = `${t.time}${note ? `<span class="cell-note">${note}</span>` : ''}`;
        } else {
          td.textContent = '—';
        }
        tr.appendChild(td);
      }
      summaryTableBody.appendChild(tr);
    }
    if (dates.length) {
      printRangeEl.textContent = `Du ${formatDayTitle(dates[0])} au ${formatDayTitle(dates[dates.length - 1])}`;
    }
  }

  const summaryToggle = document.getElementById('summaryToggle');
  const summaryBody = document.getElementById('summaryBody');
  summaryToggle.addEventListener('click', () => {
    const expanded = summaryToggle.getAttribute('aria-expanded') === 'true';
    summaryToggle.setAttribute('aria-expanded', String(!expanded));
    summaryBody.hidden = expanded;
  });
  document.getElementById('printBtn').addEventListener('click', () => window.print());

  function renderAbsenceRow(container, iso, absence) {
    const node = absenceTemplate.content.firstElementChild.cloneNode(true);
    const labelInput = node.querySelector('.absence-label');
    const startInput = node.querySelector('.absence-start');
    const endInput = node.querySelector('.absence-end');
    const removeBtn = node.querySelector('.remove-absence');

    labelInput.value = absence.label || '';
    startInput.value = absence.start || '';
    endInput.value = absence.end || '';

    labelInput.addEventListener('input', () => {
      absence.label = labelInput.value;
      saveState();
    });
    startInput.addEventListener('change', () => {
      absence.start = startInput.value;
      saveState();
      recompute();
    });
    endInput.addEventListener('change', () => {
      absence.end = endInput.value;
      saveState();
      recompute();
    });
    removeBtn.addEventListener('click', () => {
      const day = getDayData(iso);
      day.absences = day.absences.filter((a) => a.id !== absence.id);
      node.remove();
      saveState();
      recompute();
    });

    container.appendChild(node);
  }

  function renderDayCard(iso) {
    const node = dayTemplate.content.firstElementChild.cloneNode(true);
    node.dataset.date = iso;
    node.querySelector('.day-title').textContent = formatDayTitle(iso);

    const absencesContainer = node.querySelector('.absences');
    const day = getDayData(iso);
    for (const absence of day.absences) {
      renderAbsenceRow(absencesContainer, iso, absence);
    }

    node.querySelector('.add-absence').addEventListener('click', () => {
      const absence = { id: uid(), label: '', start: '', end: '' };
      day.absences.push(absence);
      renderAbsenceRow(absencesContainer, iso, absence);
      saveState();
    });

    return node;
  }

  function renderDayStrip() {
    daystripEl.innerHTML = '';
    for (const iso of listDates()) {
      const chip = chipTemplate.content.firstElementChild.cloneNode(true);
      chip.dataset.date = iso;
      const d = new Date(iso + 'T00:00:00');
      chip.querySelector('.chip-weekday').textContent = WEEKDAYS_SHORT[d.getDay()];
      chip.querySelector('.chip-num').textContent = d.getDate();
      if (iso === todayISO()) chip.classList.add('is-today');
      chip.addEventListener('click', () => selectDate(iso));
      daystripEl.appendChild(chip);
    }
  }

  function updateStripStatuses() {
    const byDate = scheduleByDate();
    daystripEl.querySelectorAll('.day-chip').forEach((chip) => {
      const iso = chip.dataset.date;
      chip.classList.toggle('is-selected', iso === selectedDate);
      chip.classList.remove('status-ok', 'status-warn', 'status-danger');
      const times = byDate[iso] || [];
      if (times.some((t) => t.warnings.includes('creneau-impossible'))) chip.classList.add('status-danger');
      else if (times.some((t) => t.warnings.includes('ecart-hors-tolerance') || t.warnings.includes('nuit'))) chip.classList.add('status-warn');
      else if (times.length) chip.classList.add('status-ok');
      const hasAbsence = getDayData(iso).absences.some((a) => a.start && a.end);
      chip.classList.toggle('has-absence', hasAbsence);
    });
  }

  function selectDate(iso) {
    selectedDate = iso;
    renderDayDetail();
    renderDetailResults(); // le calcul (lastSchedule) existe déjà pour tous les jours, il manquait juste son affichage sur le jour nouvellement sélectionné
    updateStripStatuses();
    const chip = daystripEl.querySelector(`[data-date="${iso}"]`);
    if (chip) chip.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  function renderDayDetail() {
    ensureSelectedDate();
    dayDetailEl.innerHTML = '';
    dayDetailEl.appendChild(renderDayCard(selectedDate));
  }

  function renderAll() {
    renderDayStrip();
    renderDayDetail();
    recompute();
  }

  // --- Réglages ---
  const settingsToggle = document.getElementById('settingsToggle');
  const settingsBody = document.getElementById('settingsBody');
  settingsToggle.addEventListener('click', () => {
    const expanded = settingsToggle.getAttribute('aria-expanded') === 'true';
    settingsToggle.setAttribute('aria-expanded', String(!expanded));
    settingsBody.hidden = expanded;
  });

  const toleranceInput = document.getElementById('toleranceInput');
  const marginInput = document.getElementById('marginInput');
  const defaultTimeInput = document.getElementById('defaultTimeInput');
  const anchorEnabled = document.getElementById('anchorEnabled');
  const anchorInputs = document.getElementById('anchorInputs');
  const anchorDate = document.getElementById('anchorDate');
  const anchorTime = document.getElementById('anchorTime');
  const avoidNightEnabled = document.getElementById('avoidNightEnabled');
  const avoidNightInputs = document.getElementById('avoidNightInputs');
  const avoidNightStart = document.getElementById('avoidNightStart');
  const avoidNightEnd = document.getElementById('avoidNightEnd');

  function syncSettingsUI() {
    toleranceInput.value = state.settings.tolerance;
    marginInput.value = state.settings.marginMin;
    defaultTimeInput.value = state.settings.defaultTime;
    anchorEnabled.checked = !!state.settings.anchorEnabled;
    anchorInputs.hidden = !state.settings.anchorEnabled;
    anchorDate.value = state.settings.anchor.date;
    anchorTime.value = state.settings.anchor.time;
    avoidNightEnabled.checked = !!state.settings.avoidNightEnabled;
    avoidNightInputs.hidden = !state.settings.avoidNightEnabled;
    avoidNightStart.value = state.settings.avoidNightStart;
    avoidNightEnd.value = state.settings.avoidNightEnd;
    document.getElementById('ghOwner').value = state.sync.owner;
    document.getElementById('ghRepo').value = state.sync.repo;
    document.getElementById('ghToken').value = state.sync.token;
  }

  toleranceInput.addEventListener('change', () => {
    state.settings.tolerance = Number(toleranceInput.value) || 60;
    saveState();
    recompute();
  });
  marginInput.addEventListener('change', () => {
    state.settings.marginMin = Number(marginInput.value) || 0;
    saveState();
    recompute();
  });
  defaultTimeInput.addEventListener('change', () => {
    state.settings.defaultTime = defaultTimeInput.value;
    saveState();
    recompute();
  });
  anchorEnabled.addEventListener('change', () => {
    state.settings.anchorEnabled = anchorEnabled.checked;
    anchorInputs.hidden = !anchorEnabled.checked;
    saveState();
    recompute();
  });
  anchorDate.addEventListener('change', () => {
    state.settings.anchor.date = anchorDate.value;
    saveState();
    recompute();
  });
  anchorTime.addEventListener('change', () => {
    state.settings.anchor.time = anchorTime.value;
    saveState();
    recompute();
  });
  avoidNightEnabled.addEventListener('change', () => {
    state.settings.avoidNightEnabled = avoidNightEnabled.checked;
    avoidNightInputs.hidden = !avoidNightEnabled.checked;
    saveState();
    recompute();
  });
  avoidNightStart.addEventListener('change', () => {
    state.settings.avoidNightStart = avoidNightStart.value;
    saveState();
    recompute();
  });
  avoidNightEnd.addEventListener('change', () => {
    state.settings.avoidNightEnd = avoidNightEnd.value;
    saveState();
    recompute();
  });

  // --- Export / import ---
  document.getElementById('exportBtn').addEventListener('click', () => {
    // Ne contient jamais le token GitHub, uniquement les données de planning.
    const blob = new Blob([JSON.stringify(buildExportPayload(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `planificat-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('importInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        applyRemotePayload(parsed); // conserve les réglages GitHub déjà en place
        saveState();
        syncSettingsUI();
        renderAll();
      } catch (err) {
        alert("Le fichier importé n'est pas valide.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // --- Synchronisation GitHub ---
  // Les données sont stockées dans un fichier `data.json` d'un dépôt GitHub
  // *privé* séparé du code (voir README) — jamais publié via GitHub Pages,
  // accessible uniquement via l'API avec le token. Le token lui-même n'est
  // jamais inclus dans ce qui est exporté ou envoyé à GitHub.

  const ghOwnerInput = document.getElementById('ghOwner');
  const ghRepoInput = document.getElementById('ghRepo');
  const ghTokenInput = document.getElementById('ghToken');
  const syncNowBtn = document.getElementById('syncNowBtn');
  const syncStatusEl = document.getElementById('syncStatus');

  function utf8ToB64(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary);
  }

  function b64ToUtf8(b64) {
    const binary = atob(b64.replace(/\n/g, ''));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  }

  // Ce qui part réellement vers GitHub (ou un export manuel) : jamais les
  // identifiants de synchro eux-mêmes.
  function buildExportPayload() {
    return {
      updatedAt: state.updatedAt,
      settings: state.settings,
      days: state.days,
    };
  }

  function applyRemotePayload(payload) {
    state.updatedAt = payload.updatedAt || new Date().toISOString();
    state.settings = { ...state.settings, ...(payload.settings || {}) };
    state.days = payload.days || {};
  }

  function setSyncStatus(kind, message) {
    syncStatusEl.className = 'sync-status' + (kind ? ' ' + kind : '');
    syncStatusEl.textContent = message;
  }

  function formatDateTime(iso) {
    return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function hasGithubConfig() {
    return !!(state.sync.owner && state.sync.repo && state.sync.token);
  }

  // Permet de partager un lien "?owner=...&repo=...&token=..." pour
  // pré-remplir la config GitHub sur un nouvel appareil sans tout retaper.
  // L'URL est nettoyée immédiatement pour ne pas laisser le token trainer
  // dans l'historique du navigateur.
  function applyConfigFromUrl() {
    const params = new URLSearchParams(location.search);
    const owner = params.get('owner');
    const repo = params.get('repo');
    const token = params.get('token');
    if (!owner && !repo && !token) return;
    if (owner) state.sync.owner = owner;
    if (repo) state.sync.repo = repo;
    if (token) state.sync.token = token;
    saveState({ touch: false });
    const url = new URL(location.href);
    url.search = '';
    history.replaceState({}, '', url);
  }

  async function githubContentsRequest(method, body) {
    const { owner, repo, path, token } = state.sync;
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}`;
    return fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      keepalive: method === 'PUT',
    });
  }

  async function pullRemote() {
    const res = await githubContentsRequest('GET');
    if (res.status === 404) {
      state.sync.sha = null;
      return null;
    }
    if (!res.ok) {
      const info = await res.json().catch(() => ({}));
      throw new Error(info.message || `GitHub a répondu ${res.status}`);
    }
    const json = await res.json();
    state.sync.sha = json.sha;
    return JSON.parse(b64ToUtf8(json.content));
  }

  async function pushRemote(payload) {
    const body = { message: 'Mise à jour PlanifiCat', content: utf8ToB64(JSON.stringify(payload, null, 2)) };
    if (state.sync.sha) body.sha = state.sync.sha;
    const res = await githubContentsRequest('PUT', body);
    if (!res.ok) {
      const info = await res.json().catch(() => ({}));
      throw new Error(info.message || `GitHub a répondu ${res.status}`);
    }
    const json = await res.json();
    state.sync.sha = json.content.sha;
  }

  let syncing = false;

  async function syncNow(trigger) {
    if (!hasGithubConfig()) {
      setSyncStatus('', 'Non configuré : renseigne propriétaire, dépôt et token.');
      return;
    }
    if (syncing) return;
    syncing = true;
    setSyncStatus('busy', 'Synchronisation en cours…');
    try {
      const remote = await pullRemote();
      const localUpdatedAt = state.updatedAt;
      const lastSynced = state.sync.lastSyncedAt;

      if (remote && remote.updatedAt && remote.updatedAt !== lastSynced && remote.updatedAt !== localUpdatedAt) {
        // Les données distantes ont changé ailleurs depuis notre dernière synchro : conflit.
        const remoteIsNewer = remote.updatedAt > localUpdatedAt;
        let keepLocal;
        if (trigger === 'manual') {
          keepLocal = confirm(
            `Des données plus récentes existent sur GitHub (${formatDateTime(remote.updatedAt)}).\n\n` +
            `OK = garder mes données locales et les envoyer (écrase le distant)\n` +
            `Annuler = charger les données distantes (écrase mes modifs locales non synchronisées)`
          );
        } else {
          keepLocal = !remoteIsNewer;
        }
        if (!keepLocal) {
          applyRemotePayload(remote);
          state.sync.lastSyncedAt = remote.updatedAt;
          saveState({ touch: false });
          syncSettingsUI();
          renderAll();
          setSyncStatus('ok', `Données distantes chargées — ${formatDateTime(new Date().toISOString())}`);
          syncing = false;
          return;
        }
      }

      if (!remote || localUpdatedAt !== lastSynced) {
        const payload = buildExportPayload();
        await pushRemote(payload);
        state.sync.lastSyncedAt = payload.updatedAt;
        saveState({ touch: false });
      }
      setSyncStatus('ok', `Synchronisé — ${formatDateTime(new Date().toISOString())}`);
    } catch (e) {
      console.error(e);
      setSyncStatus('error', 'Erreur : ' + e.message);
    } finally {
      syncing = false;
    }
  }

  let autoSyncTimer = null;
  function scheduleAutoSync() {
    if (!hasGithubConfig()) return;
    clearTimeout(autoSyncTimer);
    autoSyncTimer = setTimeout(() => syncNow('auto'), 4000);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && hasGithubConfig()) {
      clearTimeout(autoSyncTimer);
      syncNow('auto');
    }
  });

  ghOwnerInput.addEventListener('change', () => {
    state.sync.owner = ghOwnerInput.value.trim();
    saveState({ touch: false });
  });
  ghRepoInput.addEventListener('change', () => {
    state.sync.repo = ghRepoInput.value.trim();
    saveState({ touch: false });
  });
  ghTokenInput.addEventListener('change', () => {
    state.sync.token = ghTokenInput.value.trim();
    saveState({ touch: false });
  });
  syncNowBtn.addEventListener('click', () => syncNow('manual'));

  // --- Démarrage ---
  applyConfigFromUrl();
  syncSettingsUI();
  renderAll();
  if (hasGithubConfig()) syncNow('auto');

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    });
  }
})();
