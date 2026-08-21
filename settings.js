// Общие настройки расширения. Используются service worker'ом, попапом и страницей настроек.

export const NOTIFICATION_TYPES = {
  OVERLAY: 'overlay',           // отдельное окно с инструкцией 20-20-20
  NOTIFICATION: 'notification', // системное уведомление Chrome
  BOTH: 'both',
};

export const DEFAULT_SETTINGS = {
  isEyeReminderEnabled: true,
  eyeIntervalMinutes: 20,
  restSeconds: 20,
  notificationType: NOTIFICATION_TYPES.OVERLAY,
  isSoundEnabled: true,
  soundName: 'chime',
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLongBreak: 4,
};

// Границы допустимых значений: [min, max]
export const SETTING_LIMITS = {
  eyeIntervalMinutes: [1, 180],
  restSeconds: [5, 300],
  workMinutes: [1, 180],
  shortBreakMinutes: [1, 60],
  longBreakMinutes: [1, 120],
  cyclesBeforeLongBreak: [2, 12],
};

export async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(partialSettings) {
  await chrome.storage.sync.set(partialSettings);
}

/** Приводит число в допустимые границы. Нечисловое значение → значение по умолчанию. */
export function clampSetting(key, value) {
  const limits = SETTING_LIMITS[key];
  if (!limits) return value;

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return DEFAULT_SETTINGS[key];

  const [min, max] = limits;
  return Math.min(max, Math.max(min, Math.round(numericValue)));
}
