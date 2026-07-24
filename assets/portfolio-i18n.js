(() => {
  "use strict";

  const STORAGE_KEY = "yingzhi-portfolio-language";
  const MESSAGE_SET = "portfolio:set-language";
  const MESSAGE_CHANGE = "portfolio:language-change";
  const MESSAGE_REQUEST = "portfolio:request-language";
  const SUPPORTED_LANGUAGES = new Set(["en", "zh"]);

  if (window.self !== window.top) {
    document.documentElement.classList.add("portfolio-embedded");
  }

  function normalizeLanguage(language) {
    return SUPPORTED_LANGUAGES.has(language) ? language : "en";
  }

  function readStoredLanguage() {
    try {
      return normalizeLanguage(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      return "en";
    }
  }

  function writeStoredLanguage(language) {
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // The language still changes when storage is unavailable.
    }
  }

  function isTrustedMessage(event) {
    if (window.location.protocol === "file:") {
      return event.origin === "null" || event.origin === "";
    }
    return event.origin === window.location.origin;
  }

  function messageTargetOrigin() {
    return window.location.protocol === "file:" ? "*" : window.location.origin;
  }

  function interpolate(value, variables = {}) {
    return String(value).replace(/\{(\w+)\}/g, (match, key) => (
      Object.prototype.hasOwnProperty.call(variables, key)
        ? String(variables[key])
        : match
    ));
  }

  function createController(options = {}) {
    const translations = options.translations || {};
    let currentLanguage = readStoredLanguage();

    function lookup(key, language = currentLanguage, variables) {
      const entry = translations[key];
      if (entry == null) return key;
      if (typeof entry === "string") return interpolate(entry, variables);
      const value = entry[language] ?? entry.en ?? entry.zh ?? key;
      return interpolate(value, variables);
    }

    function applyElementTranslations() {
      document.querySelectorAll("[data-i18n]").forEach((element) => {
        element.textContent = lookup(element.dataset.i18n);
      });

      document.querySelectorAll("[data-i18n-html]").forEach((element) => {
        element.innerHTML = lookup(element.dataset.i18nHtml);
      });

      const attributeMap = {
        i18nAria: "aria-label",
        i18nTitle: "title",
        i18nPlaceholder: "placeholder",
        i18nAlt: "alt",
        i18nLabel: "data-label",
      };

      Object.entries(attributeMap).forEach(([datasetKey, attribute]) => {
        document.querySelectorAll(`[data-${datasetKey.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}]`)
          .forEach((element) => {
            element.setAttribute(attribute, lookup(element.dataset[datasetKey]));
          });
      });

      document.querySelectorAll("[data-language]").forEach((button) => {
        const selected = button.dataset.language === currentLanguage;
        button.classList.toggle("is-active", selected);
        button.setAttribute("aria-pressed", String(selected));
      });

      document.documentElement.lang = currentLanguage === "zh" ? "zh-CN" : "en";

      if (options.title) {
        document.title = typeof options.title === "function"
          ? options.title(currentLanguage, lookup)
          : lookup(options.title);
      }

      if (options.description) {
        const meta = document.querySelector('meta[name="description"]');
        if (meta) meta.setAttribute("content", lookup(options.description));
      }
    }

    function broadcastToFrames(language) {
      document.querySelectorAll("iframe").forEach((frame) => {
        try {
          frame.contentWindow?.postMessage(
            { type: MESSAGE_SET, language },
            messageTargetOrigin(),
          );
        } catch {
          // A frame that has not loaded yet will be synchronized on its load event.
        }
      });
    }

    function notifyParent(language) {
      if (window.parent === window) return;
      window.parent.postMessage(
        { type: MESSAGE_CHANGE, language },
        messageTargetOrigin(),
      );
    }

    function setLanguage(language, settings = {}) {
      const normalized = normalizeLanguage(language);
      currentLanguage = normalized;

      if (settings.persist !== false) {
        writeStoredLanguage(normalized);
      }

      applyElementTranslations();

      if (typeof options.onChange === "function") {
        options.onChange(normalized, lookup);
      }

      if (options.broadcastFrames) {
        broadcastToFrames(normalized);
      }

      if (settings.notifyParent !== false) {
        notifyParent(normalized);
      }

      document.dispatchEvent(new CustomEvent("portfolio:language-changed", {
        detail: { language: normalized },
      }));
    }

    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-language]");
      if (!button) return;
      setLanguage(button.dataset.language);
    });

    window.addEventListener("message", (event) => {
      if (!isTrustedMessage(event) || !event.data) return;

      if (event.data.type === MESSAGE_SET || event.data.type === MESSAGE_CHANGE) {
        setLanguage(event.data.language, { notifyParent: false });
      }

      if (event.data.type === MESSAGE_REQUEST && event.source) {
        event.source.postMessage(
          { type: MESSAGE_SET, language: currentLanguage },
          messageTargetOrigin(),
        );
      }
    });

    if (options.broadcastFrames) {
      document.querySelectorAll("iframe").forEach((frame) => {
        frame.addEventListener("load", () => {
          frame.contentWindow?.postMessage(
            { type: MESSAGE_SET, language: currentLanguage },
            messageTargetOrigin(),
          );
        });
      });
    }

    setLanguage(currentLanguage, { persist: false, notifyParent: false });

    if (window.parent !== window) {
      window.parent.postMessage({ type: MESSAGE_REQUEST }, messageTargetOrigin());
    }

    return {
      get language() {
        return currentLanguage;
      },
      setLanguage,
      t: lookup,
      refresh: applyElementTranslations,
      broadcast: broadcastToFrames,
    };
  }

  window.PortfolioI18n = {
    STORAGE_KEY,
    createController,
    getLanguage: readStoredLanguage,
    normalizeLanguage,
  };
})();
