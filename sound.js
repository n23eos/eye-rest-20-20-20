// Звуковые сигналы. Все пять генерятся через Web Audio — бинарных файлов нет,
// тембр и громкость правятся прямо здесь.

const BASE_VOLUME = 0.18; // тихо: напомнить, а не напугать
const DEFAULT_ATTACK_SECONDS = 0.03;

/**
 * Пресеты звуков. Ноты идут по возрастанию — так играет сигнал начала отдыха;
 * для сигнала окончания тот же набор проигрывается в обратном порядке.
 *
 * labelKey       — ключ перевода названия для страницы настроек
 * wave           — форма волны осциллятора
 * notes          — частоты в герцах
 * noteSeconds    — длительность одной ноты
 * gapSeconds     — задержка между началами соседних нот
 * attackSeconds  — время нарастания (короткое = щипок, длинное = мягкий наплыв)
 * overtoneRatio  — добавляет тихий обертон, даёт «колокольную» окраску
 * glideRatio     — нота съезжает по частоте к freq * glideRatio
 * volume         — множитель громкости пресета
 */
export const SOUND_PRESETS = {
  chime: {
    labelKey: 'soundChime',
    wave: 'sine',
    notes: [659.25, 987.77],
    noteSeconds: 0.42,
    gapSeconds: 0.16,
  },
  bell: {
    labelKey: 'soundBell',
    wave: 'sine',
    notes: [783.99, 1174.66],
    noteSeconds: 1.4,
    gapSeconds: 0.28,
    attackSeconds: 0.005,
    overtoneRatio: 2.76, // негармоничный обертон — так звучат настоящие колокола
    volume: 0.85,
  },
  marimba: {
    labelKey: 'soundMarimba',
    wave: 'triangle',
    notes: [523.25, 659.25, 783.99],
    noteSeconds: 0.26,
    gapSeconds: 0.085,
    attackSeconds: 0.005,
    volume: 1.1,
  },
  drop: {
    labelKey: 'soundDrop',
    wave: 'sine',
    notes: [1174.66, 587.33],
    noteSeconds: 0.3,
    gapSeconds: 0.09,
    attackSeconds: 0.004,
    glideRatio: 0.5, // съезд на октаву вниз даёт эффект капли
  },
  soft: {
    labelKey: 'soundSoft',
    wave: 'triangle',
    notes: [440, 554.37],
    noteSeconds: 0.9,
    gapSeconds: 0.26,
    attackSeconds: 0.15, // медленное нарастание — почти без атаки
    volume: 0.8,
  },
};

export const DEFAULT_SOUND_NAME = 'chime';

let audioContext = null;

function getAudioContext() {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

function scheduleNote(context, preset, frequency, startTime) {
  const duration = preset.noteSeconds;
  const attack = preset.attackSeconds ?? DEFAULT_ATTACK_SECONDS;
  const peak = BASE_VOLUME * (preset.volume ?? 1);

  const gain = context.createGain();
  // Плавное нарастание и затухание: без щелчков на старте и в конце
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peak, startTime + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  gain.connect(context.destination);

  startOscillator(context, preset, frequency, startTime, duration, gain);

  if (preset.overtoneRatio) {
    const overtoneGain = context.createGain();
    overtoneGain.gain.setValueAtTime(0, startTime);
    overtoneGain.gain.linearRampToValueAtTime(peak * 0.35, startTime + attack);
    overtoneGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    overtoneGain.connect(context.destination);

    startOscillator(
      context, preset, frequency * preset.overtoneRatio, startTime, duration, overtoneGain,
    );
  }
}

function startOscillator(context, preset, frequency, startTime, duration, destination) {
  const oscillator = context.createOscillator();
  oscillator.type = preset.wave;
  oscillator.frequency.setValueAtTime(frequency, startTime);

  if (preset.glideRatio) {
    oscillator.frequency.exponentialRampToValueAtTime(
      frequency * preset.glideRatio, startTime + duration,
    );
  }

  oscillator.connect(destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

/**
 * Проигрывает сигнал. kind: 'start' — начало отдыха (ноты вверх),
 * 'done' — конец (те же ноты вниз).
 * Если браузер заблокировал звук до действия пользователя, играем при первом клике.
 */
export async function playSound(soundName, kind = 'start') {
  const preset = SOUND_PRESETS[soundName] ?? SOUND_PRESETS[DEFAULT_SOUND_NAME];
  const notes = kind === 'done' ? [...preset.notes].reverse() : preset.notes;

  try {
    const context = getAudioContext();
    if (context.state === 'suspended') {
      await context.resume();
    }

    if (context.state !== 'running') {
      playOnFirstInteraction(soundName, kind);
      return;
    }

    notes.forEach((frequency, index) => {
      scheduleNote(context, preset, frequency, context.currentTime + index * preset.gapSeconds);
    });
  } catch (error) {
    console.warn('[eyes] sound unavailable:', error);
  }
}

function playOnFirstInteraction(soundName, kind) {
  const handler = () => {
    document.removeEventListener('click', handler);
    document.removeEventListener('keydown', handler);
    playSound(soundName, kind);
  };
  document.addEventListener('click', handler, { once: true });
  document.addEventListener('keydown', handler, { once: true });
}
