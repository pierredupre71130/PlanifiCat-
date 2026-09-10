(function () {
  'use strict';

  const STORAGE_KEY = 'planificat-data-v1';
  const DAY_MS = 86400000;

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function addDaysISO(iso, n) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function defaultState() {
    return {
      settings: {
        tolerance: 60,
        marginMin: 5,
        defaultTime: '06:25',
        anchorEnabled: false,
        anchor: { date: todayISO(), time: '06:25' },
      },
      rangeStart: todayISO(),
      rangeEnd: addDaysISO(todayISO(), 13),
      days: {}, // 'YYYY-MM-DD' -> { absences: [{id,label,start,end}] }
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
      };
    } catch (e) {
      console.error('Lecture des données impossible, réinitialisation.', e);
      return defaultState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  let state = loadState();
  let uidCounter = 1;
  function uid() {
    return 'a' + Date.now().toString(36) + (uidCounter++).toString(36);
  }

  function listDates() {
    const dates = [];
    let cur = state.rangeStart;
    let guard = 0;
    while (cur <= state.rangeEnd && guard < 400) {
      dates.push(cur);
      cur = addDaysISO(cur, 1);
      guard++;
    }
    return dates;
  }

  const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

  function formatDayTitle(iso) {
    const d = new Date(iso + 'T00:00:00');
    return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  }

  const daysListEl = document.getElementById('daysList');
  const dayTemplate = document.getElementById('dayTemplate');
  const absenceTemplate = document.getElementById('absenceTemplate');

  function getDayData(iso) {
    if (!state.days[iso]) state.days[iso] = { absences: [] };
    return state.days[iso];
  }

  function buildSchedulerInput() {
    return listDates().map((iso) => ({
      date: iso,
      absences: getDayData(iso).absences.filter((a) => a.start && a.end),
    }));
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
    return settings;
  }

  let lastSchedule = [];

  function recompute() {
    const days = buildSchedulerInput();
    lastSchedule = days.length ? computeSchedule(days, buildSettings()) : [];
    renderResults();
  }

  function renderResults() {
    const byDate = {};
    for (const d of lastSchedule) byDate[d.date] = d.times;

    for (const iso of listDates()) {
      const card = daysListEl.querySelector(`[data-date="${iso}"]`);
      if (!card) continue;
      const resultsEl = card.querySelector('.results');
      resultsEl.innerHTML = '';
      const times = byDate[iso] || [];
      for (const t of times) {
        const chip = document.createElement('div');
        let cls = 'result-chip';
        if (t.warnings.includes('creneau-impossible')) cls += ' danger';
        else if (t.warnings.includes('ecart-hors-tolerance')) cls += ' warn';
        chip.className = cls;
        const gapText = t.gapFromPrevLabel ? `écart ${t.gapFromPrevLabel}` : '';
        const warnText = t.warnings.includes('creneau-impossible') ? ' · créneau impossible !' : '';
        chip.innerHTML = `💉 ${t.time}<span class="gap">${gapText}${warnText}</span>`;
        resultsEl.appendChild(chip);
      }
    }
  }

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

  function renderDaysList() {
    daysListEl.innerHTML = '';
    for (const iso of listDates()) {
      daysListEl.appendChild(renderDayCard(iso));
    }
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

  function syncSettingsUI() {
    toleranceInput.value = state.settings.tolerance;
    marginInput.value = state.settings.marginMin;
    defaultTimeInput.value = state.settings.defaultTime;
    anchorEnabled.checked = !!state.settings.anchorEnabled;
    anchorInputs.hidden = !state.settings.anchorEnabled;
    anchorDate.value = state.settings.anchor.date;
    anchorTime.value = state.settings.anchor.time;
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

  // --- Plage de jours ---
  document.getElementById('addWeekBtn').addEventListener('click', () => {
    state.rangeEnd = addDaysISO(state.rangeEnd, 7);
    saveState();
    renderDaysList();
  });
  document.getElementById('removeWeekBtn').addEventListener('click', () => {
    const candidate = addDaysISO(state.rangeEnd, -7);
    if (candidate >= state.rangeStart) {
      state.rangeEnd = candidate;
      saveState();
      renderDaysList();
    }
  });

  // --- Export / import ---
  document.getElementById('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
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
        const base = defaultState();
        state = { ...base, ...parsed, settings: { ...base.settings, ...(parsed.settings || {}) } };
        saveState();
        syncSettingsUI();
        renderDaysList();
      } catch (err) {
        alert("Le fichier importé n'est pas valide.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // --- Démarrage ---
  syncSettingsUI();
  renderDaysList();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    });
  }
})();
