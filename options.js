// Страница настроек: интервалы, тип напоминания, звук, статистика.
// Сохраняем сразу при изменении поля — отдельная кнопка «Сохранить» не нужна.

import { getSettings, saveSettings, clampSetting, SETTING_LIMITS } from './settings.js';
import { getStats, resetStats, getDayKey } from './stats.js';
import { SOUND_PRESETS, playSound } from './sound.js';

const TOAST_DURATION_MS = 1400;

const NUMBER_FIELD_IDS = Object.keys(SETTING_LIMITS);
const savedToast = document.getElementById('savedToast');
const notificationTypeSelect = document.getElementById('notificationType');
const soundCheckbox = document.getElementById('isSoundEnabled');
const soundSelect = document.getElementById('soundName');
const playSoundButton = document.getElementById('playSoundButton');
const previewButton = document.getElementById('previewButton');
const statsLine = document.getElementById('statsLine');
const resetStatsButton = document.getElementById('resetStatsButton');

let toastTimerId = null;

function showSavedToast() {
  savedToast.hidden = false;
  clearTimeout(toastTimerId);
  toastTimerId = setTimeout(() => { savedToast.hidden = true; }, TOAST_DURATION_MS);
}

/** Заполняет список звуков из пресетов, чтобы не дублировать названия в HTML. */
function fillSoundOptions() {
  soundSelect.replaceChildren(...Object.entries(SOUND_PRESETS).map(([name, preset]) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = preset.label;
    return option;
  }));
}

async function loadSettings() {
  const settings = await getSettings();

  for (const fieldId of NUMBER_FIELD_IDS) {
    document.getElementById(fieldId).value = String(settings[fieldId]);
  }
  notificationTypeSelect.value = settings.notificationType;
  soundCheckbox.checked = settings.isSoundEnabled;
  soundSelect.value = settings.soundName;
  updateSoundControlsState();
}

/** Выбор звука бессмыслен, когда звук выключен. */
function updateSoundControlsState() {
  soundSelect.disabled = !soundCheckbox.checked;
  playSoundButton.disabled = !soundCheckbox.checked;
}

async function loadStats() {
  const stats = await getStats();
  const todayCount = stats.dailyRests[getDayKey()] ?? 0;
  statsLine.textContent = `Сегодня: ${todayCount} · Всего отдыхов: ${stats.totalRests}`;
}

/** Число вне допустимых границ подтягиваем к ближайшему валидному. */
async function saveNumberField(fieldId) {
  const input = document.getElementById(fieldId);
  const validValue = clampSetting(fieldId, input.value);
  input.value = String(validValue); // показываем пользователю, что значение поправлено

  await saveSettings({ [fieldId]: validValue });
  await notifyBackground();
}

async function notifyBackground() {
  await chrome.runtime.sendMessage({ type: 'settingsChanged' });
  showSavedToast();
}

for (const fieldId of NUMBER_FIELD_IDS) {
  document.getElementById(fieldId).addEventListener('change', () => saveNumberField(fieldId));
}

notificationTypeSelect.addEventListener('change', async () => {
  await saveSettings({ notificationType: notificationTypeSelect.value });
  await notifyBackground();
});

soundCheckbox.addEventListener('change', async () => {
  updateSoundControlsState();
  await saveSettings({ isSoundEnabled: soundCheckbox.checked });
  await notifyBackground();
});

soundSelect.addEventListener('change', async () => {
  await saveSettings({ soundName: soundSelect.value });
  playSound(soundSelect.value, 'start'); // сразу слышно, что выбрал
  await notifyBackground();
});

playSoundButton.addEventListener('click', () => {
  playSound(soundSelect.value, 'start');
});

previewButton.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'previewRest' });
});

// Сброс необратим — спрашиваем подтверждение
resetStatsButton.addEventListener('click', async () => {
  const isConfirmed = window.confirm('Обнулить всю статистику отдыхов? Отменить будет нельзя.');
  if (!isConfirmed) return;

  await resetStats();
  await loadStats();
  showSavedToast();
});

fillSoundOptions();
loadSettings();
loadStats();
