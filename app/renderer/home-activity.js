'use strict';

// Original local-history calendar. No server usage fields or inferred account state.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LocalActivity = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const DAY = 86400000;
  const MIN_WEEKS = 34;
  // Our own rendering bound: at most 3,640 cells, not a server-history policy.
  const MAX_WEEKS = 520;
  const DATE_LIMIT = 8640000000000000;

  function timestamp(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? new Date(value).getTime() : NaN;
    if (value instanceof Date) return value.getTime();
    if (typeof value !== 'string') return NaN;
    const input = value.trim();
    // Retained history uses ISO dates. Reject malformed calendar days rather than
    // allowing Date.parse to turn February 30 into a real activity day in March.
    const parts = /^([+-]\d{6}|\d{4})-(\d{2})-(\d{2})(?:$|[Tt ])/.exec(input);
    if (!parts) return NaN;
    const year = Number(parts[1]), month = Number(parts[2]), day = Number(parts[3]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month < 1 || month > 12 || day < 1 || day > lengths[month - 1]) return NaN;
    // Explicit offsets retain their meaning; an offset-free ISO date/time is UTC
    // so importing the same local history in another time zone cannot move cells.
    const withoutOffset = /^(?:[+-]\d{6}|\d{4})-\d{2}-\d{2}[Tt ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(input);
    return Date.parse(withoutOffset ? `${input}Z` : input);
  }

  function key(day) { return new Date(day * DAY).toISOString().split('T')[0]; }
  function windowFor(now, weeks) {
    const today = Math.floor(now / DAY);
    const weekday = new Date(today * DAY).getUTCDay();
    const end = today + 6 - weekday;
    return { today, start: end - weeks * 7 + 1, end };
  }
  function validWindow(now, weeks) {
    if (!Number.isFinite(now)) return false;
    const range = windowFor(now, weeks);
    return range.start * DAY >= -DATE_LIMIT && range.end * DAY <= DATE_LIMIT;
  }
  function characterCount(entry) {
    const value = typeof entry.text === 'string' ? entry.text : typeof entry.original === 'string' ? entry.original : '';
    let count = 0;
    for (const character of value) if (!/\s/u.test(character)) count += 1;
    return count;
  }

  /**
   * Count retained completed entries at or before now, without modifying history.
   * Missing status is accepted for legacy records; all other statuses are excluded.
   * Summary covers all retained qualifying entries, not just the display window.
   * Invalid dates are skipped; invalid now falls back to the current clock.
   * Intensity is our completed-item count capped at four. Today shows real activity;
   * only subsequent UTC dates are blank. This is an intentional local policy.
   */
  function build(history, options = {}) {
    options = options && typeof options === 'object' ? options : {};
    const weeks = typeof options.weeks === 'number' && Number.isFinite(options.weeks)
      ? Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, Math.floor(options.weeks))) : MIN_WEEKS;
    let now = options.now === undefined ? Date.now() : timestamp(options.now);
    if (!validWindow(now, weeks)) now = Date.now();
    // Keep even an unavailable/mocked clock from producing invalid date strings.
    if (!validWindow(now, weeks)) now = 0;
    const rangeDays = windowFor(now, weeks);
    const counts = new Map();
    let count = 0, characters = 0, recordingDurationMs = 0;

    for (const entry of Array.isArray(history) ? history : []) {
      if (!entry || typeof entry !== 'object' ||
          (entry.status !== undefined && entry.status !== 'completed')) continue;
      const created = timestamp(entry.createdAt);
      // This also excludes later timestamps on today, before grouping by UTC day.
      if (!Number.isFinite(created) || created > now) continue;
      const day = Math.floor(created / DAY);
      counts.set(day, (counts.get(day) || 0) + 1);
      count += 1;
      characters += characterCount(entry);
      // Do not count text operations or retries as new time spent recording.
      if (entry.inputSource === 'recording' && typeof entry.durationMs === 'number' &&
          Number.isFinite(entry.durationMs) && entry.durationMs >= 0 && entry.durationMs <= 9 * 60 * 1000) recordingDurationMs += entry.durationMs;
    }

    const active = [...counts.keys()].sort((a, b) => a - b);
    let longestStreak = 0, run = 0, previous;
    for (const day of active) {
      run = day === previous + 1 ? run + 1 : 1;
      longestStreak = Math.max(longestStreak, run);
      previous = day;
    }
    let currentStreak = 0;
    let cursor = counts.has(rangeDays.today) ? rangeDays.today : rangeDays.today - 1;
    while (counts.has(cursor)) { currentStreak += 1; cursor -= 1; }

    const days = [];
    const months = [];
    for (let column = 0; column < weeks; column += 1) {
      let monthLabel;
      for (let row = 0; row < 7; row += 1) {
        const day = rangeDays.start + column * 7 + row;
        const date = key(day);
        const dailyCount = counts.get(day) || 0;
        const future = day > rangeDays.today;
        days.push({ date, count: dailyCount, level: Math.min(dailyCount, 4),
          kind: future ? 'future' : dailyCount ? 'activity' : 'zero', today: day === rangeDays.today });
        if (new Date(day * DAY).getUTCDate() === 1) monthLabel = date.slice(0, -3);
      }
      if (monthLabel) months.push({ column, label: monthLabel });
    }

    return {
      days,
      months,
      summary: { count, characters, recordingDurationMs, activeDays: active.length, currentStreak, longestStreak },
      range: { start: days[0].date, end: days[days.length - 1].date, today: key(rangeDays.today), weeks },
      hasEarlier: weeks < MAX_WEEKS && active.length > 0 && active[0] < rangeDays.start
    };
  }

  return Object.freeze({ build });
});
