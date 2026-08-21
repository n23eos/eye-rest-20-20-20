// Фоновый service worker: таймеры напоминаний и помодоро.
// Используем chrome.alarms, а не setTimeout — Chrome выгружает service worker,
// но alarms срабатывают всё равно.

import { getSettings, NOTIFICATION_TYPES } from './settings.js';
import { recordRest } from './stats.js';
import { t } from './i18n.js';

const REMINDER_ALARM_NAME = 'eyeRestReminder';
const NOTIFICATION_ID = 'eyeRestNotification';
const SNOOZE_MINUTES = 5;
const IDLE_DETECTION_SECONDS = 300; // 5 минут без активности = пользователь отошёл

const POMODORO_PHASE_ALARM_NAME = 'pomodoroPhaseEnd';
const POMODORO_TICK_ALARM_NAME = 'pomodoroTick';
const POMODORO_NOTIFICATION_ID = 'pomodoroNotification';

const REST_WINDOW_WIDTH = 620;
const REST_WINDOW_HEIGHT = 640;

const DEFAULT_POMODORO_STATE = {
  isRunning: false,
  phase: 'work', // 'work' | 'break' | 'longBreak'
  phaseEndTime: 0,
  completedCycles: 0,
};

// --- Состояние помодоро ---

async function getPomodoroState() {
  const stored = await chrome.storage.local.get({ pomodoro: DEFAULT_POMODORO_STATE });
  return { ...DEFAULT_POMODORO_STATE, ...stored.pomodoro };
}

async function setPomodoroState(newState) {
  await chrome.storage.local.set({ pomodoro: newState });
}

// --- Окно отдыха ---
// Отдельное окно расширения, а не оверлей поверх сайта: не нужны права на все
// сайты, и работает даже на страницах chrome:// и в просмотрщике PDF.

async function openRestWindow({ seconds, kind }) {
  const url = chrome.runtime.getURL(`rest.html?seconds=${seconds}&kind=${kind}`);

  // Уже открыто — просто выводим вперёд, не плодим окна
  const { restWindowId } = await chrome.storage.session.get({ restWindowId: null });
  if (restWindowId !== null) {
    try {
      await chrome.windows.update(restWindowId, { focused: true, drawAttention: true });
      return;
    } catch {
      await chrome.storage.session.remove('restWindowId');
    }
  }

  const bounds = await getCenteredBounds();
  const restWindow = await chrome.windows.create({
    url,
    type: 'popup',
    focused: true,
    width: REST_WINDOW_WIDTH,
    height: REST_WINDOW_HEIGHT,
    ...bounds,
  });
  await chrome.storage.session.set({ restWindowId: restWindow.id });
}

/** Центрируем окно относительно текущего окна браузера. */
async function getCenteredBounds() {
  try {
    const currentWindow = await chrome.windows.getLastFocused();
    if (!currentWindow.width || !currentWindow.height) return {};
    return {
      left: Math.round(currentWindow.left + (currentWindow.width - REST_WINDOW_WIDTH) / 2),
      top: Math.round(currentWindow.top + (currentWindow.height - REST_WINDOW_HEIGHT) / 2),
    };
  } catch {
    return {}; // не смогли посчитать — Chrome разместит окно сам
  }
}

chrome.windows.onRemoved.addListener(async (windowId) => {
  const { restWindowId } = await chrome.storage.session.get({ restWindowId: null });
  if (windowId === restWindowId) {
    await chrome.storage.session.remove('restWindowId');
  }
});

// --- Напоминание про глаза ---

async function triggerEyeRest() {
  const settings = await getSettings();
  const wantsOverlay = settings.notificationType !== NOTIFICATION_TYPES.NOTIFICATION;
  const wantsNotification = settings.notificationType !== NOTIFICATION_TYPES.OVERLAY;

  if (wantsOverlay) {
    await openRestWindow({ seconds: settings.restSeconds, kind: 'eye' });
  }
  if (wantsNotification) {
    await showReminderNotification(settings.restSeconds);
  }
}

async function showReminderNotification(restSeconds) {
  // Бейдж «!» — видимый сигнал даже если система глушит уведомления
  await chrome.action.setBadgeBackgroundColor({ color: '#e53935' });
  await chrome.action.setBadgeText({ text: '!' });

  await chrome.notifications.clear(NOTIFICATION_ID);
  chrome.notifications.create(NOTIFICATION_ID, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: t('notifyEyeTitle'),
    message: t('notifyEyeMessage', [String(restSeconds)]),
    buttons: [{ title: t('notifyEyeButton') }],
    priority: 2,
  }, () => {
    if (chrome.runtime.lastError) {
      console.error(`[eyes] notification failed: ${chrome.runtime.lastError.message}`);
    }
  });
}

// --- Планирование напоминаний ---

async function scheduleEyeReminder(delayMinutesOverride) {
  const settings = await getSettings();
  const pomodoro = await getPomodoroState();
  await chrome.alarms.clear(REMINDER_ALARM_NAME);

  if (!settings.isEyeReminderEnabled || pomodoro.isRunning) {
    if (!pomodoro.isRunning) {
      await chrome.action.setBadgeText({ text: '' });
    }
    return;
  }

  const intervalMinutes = settings.eyeIntervalMinutes;
  chrome.alarms.create(REMINDER_ALARM_NAME, {
    delayInMinutes: delayMinutesOverride ?? intervalMinutes,
    periodInMinutes: intervalMinutes,
  });
}

// --- Помодоро ---

function getPhaseMinutes(phase, settings) {
  if (phase === 'break') return settings.shortBreakMinutes;
  if (phase === 'longBreak') return settings.longBreakMinutes;
  return settings.workMinutes;
}

async function startPomodoro() {
  // Режимы взаимоисключающие: выключаем глазные напоминания
  await chrome.storage.sync.set({ isEyeReminderEnabled: false });
  await chrome.alarms.clear(REMINDER_ALARM_NAME);

  const settings = await getSettings();
  const newState = {
    isRunning: true,
    phase: 'work',
    phaseEndTime: Date.now() + settings.workMinutes * 60000,
    completedCycles: 0,
  };
  await setPomodoroState(newState);

  chrome.alarms.create(POMODORO_PHASE_ALARM_NAME, { delayInMinutes: settings.workMinutes });
  chrome.alarms.create(POMODORO_TICK_ALARM_NAME, { periodInMinutes: 1 });
  await updatePomodoroBadge(newState);
}

async function stopPomodoro() {
  await chrome.alarms.clear(POMODORO_PHASE_ALARM_NAME);
  await chrome.alarms.clear(POMODORO_TICK_ALARM_NAME);
  await setPomodoroState({ ...DEFAULT_POMODORO_STATE });
  await chrome.action.setBadgeText({ text: '' });
}

async function advancePomodoroPhase() {
  const state = await getPomodoroState();
  if (!state.isRunning) return;

  const settings = await getSettings();
  const isWorkEnding = state.phase === 'work';

  let newState;
  if (isWorkEnding) {
    const completedCycles = state.completedCycles + 1;
    const isLongBreak = completedCycles % settings.cyclesBeforeLongBreak === 0;
    const phase = isLongBreak ? 'longBreak' : 'break';
    newState = {
      ...state,
      phase,
      completedCycles,
      phaseEndTime: Date.now() + getPhaseMinutes(phase, settings) * 60000,
    };
  } else {
    newState = {
      ...state,
      phase: 'work',
      phaseEndTime: Date.now() + settings.workMinutes * 60000,
    };
  }

  await setPomodoroState(newState);
  chrome.alarms.create(POMODORO_PHASE_ALARM_NAME, {
    delayInMinutes: getPhaseMinutes(newState.phase, settings),
  });
  await updatePomodoroBadge(newState);
  await announcePomodoroPhase(newState, settings);
}

/** Сообщает о новой фазе выбранным способом. */
async function announcePomodoroPhase(state, settings) {
  const isBreak = state.phase !== 'work';
  const wantsOverlay = settings.notificationType !== NOTIFICATION_TYPES.NOTIFICATION;
  const wantsNotification = settings.notificationType !== NOTIFICATION_TYPES.OVERLAY;

  // Окно отдыха показываем только на перерыве: прерывать начало работы незачем
  if (isBreak && wantsOverlay) {
    const minutes = getPhaseMinutes(state.phase, settings);
    await openRestWindow({ seconds: minutes * 60, kind: state.phase });
  }
  if (wantsNotification || !isBreak) {
    const minutes = getPhaseMinutes(state.phase, settings);
    const title = isBreak ? t('notifyBreakTitle', [String(minutes)]) : t('notifyWorkTitle');
    const message = isBreak
      ? t('notifyBreakMessage')
      : t('notifyWorkMessage', [String(minutes)]);
    showPomodoroNotification(title, message);
  }
}

function showPomodoroNotification(title, message) {
  chrome.notifications.clear(POMODORO_NOTIFICATION_ID);
  chrome.notifications.create(POMODORO_NOTIFICATION_ID, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message,
    priority: 2,
  }, () => {
    if (chrome.runtime.lastError) {
      console.error(`[eyes] pomodoro notification failed: ${chrome.runtime.lastError.message}`);
    }
  });
}

// Бейдж: минуты до конца фазы. Красный — работа, зелёный — перерыв.
async function updatePomodoroBadge(state) {
  const pomodoro = state ?? (await getPomodoroState());
  if (!pomodoro.isRunning) return;

  const minutesLeft = Math.max(1, Math.ceil((pomodoro.phaseEndTime - Date.now()) / 60000));
  const isWork = pomodoro.phase === 'work';
  await chrome.action.setBadgeBackgroundColor({ color: isWork ? '#e53935' : '#2e7d32' });
  await chrome.action.setBadgeText({ text: String(minutesLeft) });
}

// --- Восстановление после перезагрузки расширения ---
// Перезагрузка стирает все alarms, но состояние помодоро остаётся в storage.
// Без восстановления таймер замирает навсегда.

async function reconcilePomodoroAlarms() {
  const state = await getPomodoroState();
  if (!state.isRunning) return;

  const phaseAlarm = await chrome.alarms.get(POMODORO_PHASE_ALARM_NAME);
  if (!phaseAlarm) {
    if (Date.now() >= state.phaseEndTime) {
      await advancePomodoroPhase(); // фаза уже кончилась — двигаем дальше
    } else {
      chrome.alarms.create(POMODORO_PHASE_ALARM_NAME, { when: state.phaseEndTime });
    }
  }
  chrome.alarms.create(POMODORO_TICK_ALARM_NAME, { periodInMinutes: 1 });
  await updatePomodoroBadge();
}

async function initExtension() {
  await reconcilePomodoroAlarms();
  await scheduleEyeReminder();
}

// --- События ---

chrome.runtime.onInstalled.addListener(initExtension);
chrome.runtime.onStartup.addListener(initExtension);

chrome.alarms.onAlarm.addListener((alarm) => {
  console.log(`[eyes] alarm fired: ${alarm.name} at ${new Date().toLocaleTimeString()}`);
  if (alarm.name === REMINDER_ALARM_NAME) {
    triggerEyeRest();
  } else if (alarm.name === POMODORO_PHASE_ALARM_NAME) {
    advancePomodoroPhase();
  } else if (alarm.name === POMODORO_TICK_ALARM_NAME) {
    updatePomodoroBadge();
  }
});

// Клик по уведомлению (или его кнопке) открывает окно с таймером отдыха
async function handleReminderNotificationClick(notificationId) {
  if (notificationId !== NOTIFICATION_ID) return;
  const settings = await getSettings();
  await chrome.notifications.clear(NOTIFICATION_ID);
  await chrome.action.setBadgeText({ text: '' });
  await openRestWindow({ seconds: settings.restSeconds, kind: 'eye' });
}

chrome.notifications.onClicked.addListener(handleReminderNotificationClick);
chrome.notifications.onButtonClicked.addListener(handleReminderNotificationClick);

// Пользователь отошёл и вернулся — начинаем отсчёт интервала заново,
// чтобы не напоминать сразу после возвращения.
chrome.idle.setDetectionInterval(IDLE_DETECTION_SECONDS);
chrome.idle.onStateChanged.addListener((state) => {
  if (state === 'active') {
    scheduleEyeReminder();
  }
});

// --- Сообщения из попапа и страницы настроек ---

const MESSAGE_HANDLERS = {
  async settingsChanged() {
    // Взаимоисключение: включили глаза — останавливаем помодоро
    const settings = await getSettings();
    const pomodoro = await getPomodoroState();
    if (settings.isEyeReminderEnabled && pomodoro.isRunning) {
      await stopPomodoro();
    }
    await scheduleEyeReminder();
  },
  async snooze() {
    await scheduleEyeReminder(SNOOZE_MINUTES);
  },
  async startPomodoro() {
    await startPomodoro();
  },
  async stopPomodoro() {
    await stopPomodoro();
    await scheduleEyeReminder(); // глаза вернутся, если включены
  },
  async previewRest() {
    const settings = await getSettings();
    await openRestWindow({ seconds: settings.restSeconds, kind: 'eye' });
  },
  // Пишет только background: единственный писатель — нет гонок за хранилище
  async restCompleted() {
    await recordRest();
  },
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = MESSAGE_HANDLERS[message.type];
  if (!handler) return false;

  handler()
    .then(() => sendResponse({ ok: true }))
    .catch((error) => {
      console.error(`[eyes] ${message.type} failed:`, error);
      sendResponse({ ok: false, error: error.message });
    });
  return true; // асинхронный ответ
});
