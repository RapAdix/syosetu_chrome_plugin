const PROVIDERS = {
  openAI: "openai",
  gemini: "gemini",
  server: "server"
};

/** Returns the default provider: first API provider with a configured key, otherwise server. */
function getDefaultProvider(configuredKeys = {}) {
  if (configuredKeys[PROVIDERS.openAI]) return PROVIDERS.openAI;
  if (configuredKeys[PROVIDERS.gemini]) return PROVIDERS.gemini;
  return PROVIDERS.server;
}

// Make it global for non-module scripts
if (typeof window !== "undefined") {
  window.JishoDefaults = {
    panelWidth: 45,        // %
    jishoContentScale: 90,    // %
    grammarContentScale: 100  // %
  };

  window.Providers = PROVIDERS;
  window.getDefaultProvider = getDefaultProvider;
}

