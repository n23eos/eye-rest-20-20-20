// Логика попапа: быстрые действия. Полные настройки — на странице настроек.

import { getSettings, saveSettings } from './settings.js';
import { getStats, getRecentDays, getDayKey } from './stats.js';

const REMINDER_ALARM_NAME = 'eyeRestReminder';
const CHART_DAYS = 7;
const CHART_MAX_HEIGHT_PERCENT = 100;

const DEFAULT_POMODORO_STATE = {
  isRunning: false,
  phase: 'work',
  phaseEndTime: 0,
  completedCycles: 0,
};

const PHASE_LABELS = {
  work: 'Работа',
  break: 'Перерыв',
  longBreak: 'Длинный перерыв',
};

const enabledToggle = document.getElementById('enabledToggle');
const snoozeButton = document.getElementById('snoozeButton');
const previewButton = document.getElementById('previewButton');
const nextReminderText = document.getElementById('nextReminderText');
const pomodoroButton = document.getElementById('pomodoroButton');
const pomodoroStatus = document.getElementById('pomodoroStatus');
const pomodoroCycles = document.getElementById('pomodoroCycles');
const settingsLink = document.getElementById('settingsLink');
const statsSummary = document.getElementById('statsSummary');
const statsChart = document.getElementById('statsChart');

// --- Напоминания для глаз ---

async function updateEyeReminderView() {
  const settings = await getSettings();
  enabledToggle.checked = settings.isEyeReminderEnabled;
  pomodoroButton.textContent = `Запустить (${settings.workMinutes} / ${settings.shortBreakMinutes})`;

  const alarm = await chrome.alarms.get(REMINDER_ALARM_NAME);
  if (!alarm) {
    nextReminderText.textContent = settings.isEyeReminderEnabled
      ? 'На паузе, пока идёт помодоро'
      : 'Напоминания выключены';
    return;
  }
  const minutesLeft = Math.max(1, Math.round((alarm.scheduledTime - Date.now()) / 60000));
  nextReminderText.textContent = `Следующее напоминание через ~${minutesLeft} мин`;
}

// --- Помодоро ---

async function getPomodoroState() {
  const stored = await chrome.storage.local.get({ pomodoro: DEFAULT_POMODORO_STATE });
  return { ...DEFAULT_POMODORO_STATE, ...stored.pomodoro };
}

async function updatePomodoroView() {
  const state = await getPomodoroState();

  if (!state.isRunning) {
    pomodoroStatus.textContent = 'Не запущено';
    pomodoroCycles.textContent = '';
    return;
  }

  const secondsLeft = Math.max(0, Math.round((state.phaseEndTime - Date.now()) / 1000));
  const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const seconds = String(secondsLeft % 60).padStart(2, '0');
  pomodoroStatus.textContent = `${PHASE_LABELS[state.phase]}: ${minutes}:${seconds}`;
  pomodoroCycles.textContent = state.completedCycles > 0 ? `циклов: ${state.completedCycles}` : '';
  pomodoroButton.textContent = 'Остановить';
}

// --- Статистика ---

async function updateStatsView() {
  const stats = await getStats();
  const days = getRecentDays(stats, CHART_DAYS);
  const todayKey = getDayKey();
  const todayCount = stats.dailyRests[todayKey] ?? 0;

  statsSummary.textContent = `сегодня ${todayCount} · всего ${stats.totalRests}`;

  // Высота столбика — доля от лучшего дня недели
  const maxCount = Math.max(1, ...days.map((day) => day.count));
  statsChart.replaceChildren(...days.map((day) => renderBar(day, maxCount, todayKey)));
}

function renderBar(day, maxCount, todayKey) {
  const bar = document.createElement('div');
  bar.className = day.key === todayKey ? 'stats-bar is-today' : 'stats-bar';
  bar.title = `${day.key}: ${day.count}`;

  const fill = document.createElement('div');
  fill.className = 'stats-bar-fill';
  fill.style.height = `${(day.count / maxCount) * CHART_MAX_HEIGHT_PERCENT}%`;

  const label = document.createElement('span');
  label.className = 'stats-bar-label';
  label.textContent = day.weekdayLabel;

  bar.append(fill, label);
  return bar;
}

async function refreshView() {
  await updateEyeReminderView();
  await updatePomodoroView();
  await updateStatsView();
}

// --- События ---

enabledToggle.addEventListener('change', async () => {
  await saveSettings({ isEyeReminderEnabled: enabledToggle.checked });
  await chrome.runtime.sendMessage({ type: 'settingsChanged' });
  await refreshView();
});

snoozeButton.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'snooze' });
  await refreshView();
});

previewButton.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'previewRest' });
  window.close(); // попап всё равно закроется, когда окно отдыха заберёт фокус
});

pomodoroButton.addEventListener('click', async () => {
  const state = await getPomodoroState();
  await chrome.runtime.sendMessage({
    type: state.isRunning ? 'stopPomodoro' : 'startPomodoro',
  });
  await refreshView();
});

settingsLink.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// Тикаем, пока попап открыт
setInterval(updatePomodoroView, 1000);
refreshView();
