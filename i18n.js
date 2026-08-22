// Подстановка переводов в HTML. chrome.i18n сам заменяет __MSG_...__ только
// в манифесте и CSS, для разметки нужен вот такой проход по DOM.

/** Короткий доступ к переводу: t('key') или t('key', ['20', '5']). */
export function t(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions);
}

/**
 * Заменяет текст всех элементов с data-i18n на перевод.
 * Заголовок страницы берётся из data-i18n-title на <html>.
 */
export function applyI18n(root = document) {
  for (const element of root.querySelectorAll('[data-i18n]')) {
    const message = t(element.dataset.i18n);
    if (message) element.textContent = message;
  }

  const titleKey = document.documentElement.dataset.i18nTitle;
  if (titleKey) {
    const title = t(titleKey);
    if (title) document.title = title;
  }

  document.documentElement.lang = chrome.i18n.getUILanguage();
  // Для арабского и других RTL-языков Chrome отдаёт 'rtl' в @@bidi_dir
  document.documentElement.dir = t('@@bidi_dir') || 'ltr';
}
