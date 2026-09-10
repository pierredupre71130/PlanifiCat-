// Moteur de calcul des horaires d'injection.
// Principe : on cherche, sur toute la période saisie, la suite d'horaires
// (2 par jour) qui reste la plus proche possible de l'écart cible (12h),
// tout en évitant les créneaux d'absence de chaque jour. Comme le choix
// d'un horaire influence les jours suivants (il faut parfois anticiper un
// décalage la veille pour pouvoir retomber sur un horaire fixe le
// lendemain), on résout ça par programmation dynamique sur l'ensemble de
// la période plutôt que jour par jour.

const DAY_MIN = 1440;
const GRID = 5; // résolution en minutes
const INFEASIBLE_PENALTY = 1e8; // horaire tombant dans une absence
const TOLERANCE_PENALTY = 1e5; // écart hors de la tolérance autorisée
// Préférence (pas une contrainte dure comme les 2 ci-dessus) : évite les
// horaires de nuit quand une solution respectant l'absence ET la
// tolérance existe ailleurs, mais ne sacrifie jamais ces 2 contraintes
// pour l'éviter.
const NIGHT_PENALTY = 1e4;

function parseHM(hm) {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

function fmtHM(min) {
  min = ((Math.round(min) % DAY_MIN) + DAY_MIN) % DAY_MIN;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}h${String(m).padStart(2, '0')}`;
}

function fmtGap(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h${String(m).padStart(2, '0')}`;
}

function dayOffset(dateStr, baseDateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const b = new Date(baseDateStr + 'T00:00:00');
  return Math.round((d - b) / 86400000);
}

function buildBlocked(absences, marginMin) {
  return (absences || [])
    .filter((a) => a.start && a.end)
    .map((a) => [parseHM(a.start) - marginMin, parseHM(a.end) + marginMin]);
}

function isFeasible(t, blocked) {
  return !blocked.some(([s, e]) => t >= s && t <= e);
}

// Fenêtre pouvant chevaucher minuit (ex: 23h -> 5h du matin).
function isInWindow(t, start, end) {
  if (start === end) return false;
  if (start < end) return t >= start && t < end;
  return t >= start || t < end;
}

/**
 * @param {Array<{date:string, absences:Array<{start:string,end:string,label?:string}>}>} days
 *   Jours triés chronologiquement, dates au format 'YYYY-MM-DD'.
 * @param {{
 *   targetGap?: number,      // écart cible en minutes (défaut 720 = 12h)
 *   tolerance?: number,      // tolérance +/- en minutes (défaut 60 => 11h-13h)
 *   marginMin?: number,      // marge de sécurité autour des absences (défaut 5 min)
 *   defaultTime?: string,    // heure de référence si aucune ancre n'est fournie
 *   anchor?: {date:string, time:string} | null, // dernière injection connue avant days[0]
 *   avoidNightStart?: string, // début de la plage nuit à éviter si possible (ex: '23:00')
 *   avoidNightEnd?: string,   // fin de cette plage (ex: '05:00') ; ignoré si égal au début
 * }} settings
 */
function computeSchedule(days, settings = {}) {
  if (!days || days.length === 0) return [];

  const target = settings.targetGap ?? 720;
  const tol = settings.tolerance ?? 60;
  const margin = settings.marginMin ?? 5;
  const baseDate = days[0].date;
  const defaultT = parseHM(settings.defaultTime || '06:00');
  const nightStart = settings.avoidNightStart ? parseHM(settings.avoidNightStart) : null;
  const nightEnd = settings.avoidNightEnd ? parseHM(settings.avoidNightEnd) : null;
  const hasNightWindow = nightStart !== null && nightEnd !== null && nightStart !== nightEnd;
  function nightPenaltyFor(t) {
    return hasNightWindow && isInWindow(t, nightStart, nightEnd) ? NIGHT_PENALTY : 0;
  }

  const grid = [];
  for (let t = 0; t < DAY_MIN; t += GRID) grid.push(t);

  const slots = [];
  for (const day of days) {
    const blocked = buildBlocked(day.absences, margin);
    const dayIdx = dayOffset(day.date, baseDate);
    slots.push({ dayIdx, date: day.date, blocked });
    slots.push({ dayIdx, date: day.date, blocked });
  }

  let anchorAbs = null;
  if (settings.anchor && settings.anchor.time) {
    const off = dayOffset(settings.anchor.date || baseDate, baseDate);
    anchorAbs = off * DAY_MIN + parseHM(settings.anchor.time);
  }

  const dp = [];
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const layer = new Map();
    for (const t of grid) {
      const absT = slot.dayIdx * DAY_MIN + t;
      const feasPenalty = isFeasible(t, slot.blocked) ? 0 : INFEASIBLE_PENALTY;

      const nightPenalty = nightPenaltyFor(t);

      if (i === 0) {
        let cost;
        if (anchorAbs !== null) {
          const gap = absT - anchorAbs;
          const tolPenalty = gap < target - tol || gap > target + tol ? TOLERANCE_PENALTY : 0;
          cost = Math.pow(gap - target, 2) + tolPenalty + feasPenalty + nightPenalty;
        } else {
          cost = Math.pow(t - defaultT, 2) * 0.001 + feasPenalty + nightPenalty;
        }
        layer.set(t, { cost, prevT: null });
      } else {
        let best = null;
        for (const [tp, node] of dp[i - 1]) {
          const absTp = slots[i - 1].dayIdx * DAY_MIN + tp;
          const gap = absT - absTp;
          const tolPenalty = gap < target - tol || gap > target + tol ? TOLERANCE_PENALTY : 0;
          const cost = node.cost + Math.pow(gap - target, 2) + tolPenalty + feasPenalty + nightPenalty;
          if (!best || cost < best.cost) best = { cost, prevT: tp };
        }
        layer.set(t, best);
      }
    }
    dp.push(layer);
  }

  const lastLayer = dp[dp.length - 1];
  let bestT = null;
  let bestCost = Infinity;
  for (const [t, node] of lastLayer) {
    if (node.cost < bestCost) {
      bestCost = node.cost;
      bestT = t;
    }
  }

  const path = new Array(slots.length);
  let curT = bestT;
  for (let i = slots.length - 1; i >= 0; i--) {
    path[i] = curT;
    curT = dp[i].get(curT).prevT;
  }

  const result = days.map((d) => ({ date: d.date, times: [] }));
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const t = path[i];
    const warnings = [];
    if (!isFeasible(t, slot.blocked)) warnings.push('creneau-impossible');
    if (hasNightWindow && isInWindow(t, nightStart, nightEnd)) warnings.push('nuit');

    let gapFromPrev = null;
    if (i > 0) {
      const absT = slot.dayIdx * DAY_MIN + t;
      const prevSlot = slots[i - 1];
      const absTp = prevSlot.dayIdx * DAY_MIN + path[i - 1];
      gapFromPrev = absT - absTp;
      if (gapFromPrev < target - tol || gapFromPrev > target + tol) warnings.push('ecart-hors-tolerance');
    } else if (anchorAbs !== null) {
      const absT = slot.dayIdx * DAY_MIN + t;
      gapFromPrev = absT - anchorAbs;
      if (gapFromPrev < target - tol || gapFromPrev > target + tol) warnings.push('ecart-hors-tolerance');
    }

    result[slot.dayIdx].times.push({
      time: fmtHM(t),
      minutes: t,
      gapFromPrev,
      gapFromPrevLabel: gapFromPrev != null ? fmtGap(gapFromPrev) : null,
      warnings,
    });
  }

  return result;
}

if (typeof module !== 'undefined') {
  module.exports = { computeSchedule, parseHM, fmtHM, fmtGap, dayOffset };
}
