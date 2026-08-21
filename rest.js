// Окно отдыха: кольцевой отсчёт + инструкция 20-20-20.
// Параметры приходят в URL: rest.html?seconds=20&kind=eye

import { getSettings } from './settings.js';
import { playSound } from './sound.js';
import { t, applyI18n } from './i18n.js';

const RING_RADIUS = 54;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const AUTO_CLOSE_DELAY_MS = 1800;

const MESSAGE_KEYS_BY_KIND = {
  eye: { title: 'restEyeTitle', subtitle: 'restEyeSubtitle' },
  break: { title: 'restBreakTitle', subtitle: 'restBreakSubtitle' },
  longBreak: { title: 'restLongBreakTitle', subtitle: 'restLongBreakSubtitle' },
};

const timerElement = document.querySelector('.timer');
const timerValue = document.getElementById('timerValue');
const ringProgress = document.getElementById('ringProgress');
const restTitle = document.getElementById('restTitle');
const restSubtitle = document.getElementById('restSubtitle');
const skipButton = document.getElementById('skipButton');

function readParams() {
  const params = new URLSearchParams(window.location.search);
  const seconds = Number(params.get('seconds'));
  const kind = params.get('kind');
  return {
    totalSeconds: Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 20,
    kind: MESSAGE_KEYS_BY_KIND[kind] ? kind : 'eye',
  };
}

function formatTime(seconds) {
  if (seconds < 60) return String(seconds);
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}

function renderRing(secondsLeft, totalSeconds) {
  const progress = secondsLeft / totalSeconds;
  ringProgress.style.strokeDasharray = String(RING_CIRCUMFERENCE);
  ringProgress.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - progress));
}

async function finish() {
  timerElement.classList.add('is-done');
  timerValue.textContent = t('restDone');
  renderRing(1, 1); // кольцо остаётся полным — отдых засчитан

  if (soundName) {
    playSound(soundName, 'done');
  }
  // Считаем только досчитанные до конца отдыхи, не пропущенные
  chrome.runtime.sendMessage({ type: 'restCompleted' });

  setTimeout(() => window.close(), AUTO_CLOSE_DELAY_MS);
}

function startCountdown(totalSeconds) {
  // Считаем от абсолютного времени: так отсчёт не поплывёт,
  // если браузер притормозит таймеры.
  const deadline = Date.now() + totalSeconds * 1000;

  const tick = () => {
    const secondsLeft = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    timerValue.textContent = formatTime(secondsLeft);
    renderRing(secondsLeft, totalSeconds);

    if (secondsLeft <= 0) {
      clearInterval(intervalId);
      finish();
    }
  };

  const intervalId = setInterval(tick, 1000);
  tick();
}

const { totalSeconds, kind } = readParams();
applyI18n();
restTitle.textContent = t(MESSAGE_KEYS_BY_KIND[kind].title);
restSubtitle.textContent = t(MESSAGE_KEYS_BY_KIND[kind].subtitle);
document.title = restTitle.textContent;

skipButton.addEventListener('click', () => window.close());
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.close();
});

// Пустая строка = звук выключен в настройках
let soundName = '';

async function init() {
  const settings = await getSettings();
  soundName = settings.isSoundEnabled ? settings.soundName : '';
  if (soundName) {
    playSound(soundName, 'start');
  }
  startCountdown(totalSeconds);
}

init();
