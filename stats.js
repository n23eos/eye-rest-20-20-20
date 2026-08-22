// Статистика отдыхов. Считаем только завершённые отдыхи: досчитал до нуля —
// зачёт, нажал «Пропустить» — нет.

const MAX_STORED_DAYS = 90; // старые дни чистим, чтобы хранилище не пухло

export const DEFAULT_STATS = {
  totalRests: 0,
  dailyRests: {}, // { 'YYYY-MM-DD': количество }
};

/** Ключ дня по локальному времени пользователя. */
export function getDayKey(date = new Date()) {
  return date.toLocaleDateString('sv-SE'); // формат sv-SE как раз YYYY-MM-DD
}

/** Язык интерфейса расширения: подписи дней недели должны совпадать с UI. */
function getUiLocale() {
  return globalThis.chrome?.i18n?.getUILanguage?.() ?? undefined;
}

export async function getStats() {
  const stored = await chrome.storage.local.get({ stats: DEFAULT_STATS });
  return { ...DEFAULT_STATS, ...stored.stats };
}

/** Записывает один завершённый отдых. Вызывать только из background. */
export async function recordRest() {
  const stats = await getStats();
  const today = getDayKey();

  const newStats = {
    totalRests: stats.totalRests + 1,
    dailyRests: prune({
      ...stats.dailyRests,
      [today]: (stats.dailyRests[today] ?? 0) + 1,
    }),
  };

  await chrome.storage.local.set({ stats: newStats });
  return newStats;
}

export async function resetStats() {
  await chrome.storage.local.set({ stats: { ...DEFAULT_STATS, dailyRests: {} } });
}

/** Оставляет только последние MAX_STORED_DAYS дней. */
function prune(dailyRests) {
  const keys = Object.keys(dailyRests).sort();
  if (keys.length <= MAX_STORED_DAYS) return dailyRests;

  const keptKeys = keys.slice(-MAX_STORED_DAYS);
  return Object.fromEntries(keptKeys.map((key) => [key, dailyRests[key]]));
}

// Столбик в графике узкий (~33px). В части языков сокращённое название дня
// в него не влезает («الأربعاء», «शुक्र», «Thứ 4») — там берём однобуквенный формат.
const MAX_WEEKDAY_LABEL_LENGTH = 4;

function getWeekdayFormat(dates, locale) {
  const longest = Math.max(
    ...dates.map((date) => date.toLocaleDateString(locale, { weekday: 'short' }).length),
  );
  return longest > MAX_WEEKDAY_LABEL_LENGTH ? 'narrow' : 'short';
}

/** Последние N дней (включая сегодня) для столбиков в попапе. */
export function getRecentDays(stats, days) {
  const locale = getUiLocale();

  const dates = [];
  for (let daysAgo = days - 1; daysAgo >= 0; daysAgo -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    dates.push(date);
  }

  const weekday = getWeekdayFormat(dates, locale);
  return dates.map((date) => {
    const key = getDayKey(date);
    return {
      key,
      count: stats.dailyRests[key] ?? 0,
      weekdayLabel: date.toLocaleDateString(locale, { weekday }),
    };
  });
}
