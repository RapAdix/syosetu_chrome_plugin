// Make it global for non-module scripts
if (typeof window !== "undefined") {
  window.JishoDefaults = {
    panelWidth: 45,        // %
    jishoContentScale: 90,    // %
    grammarContentScale: 100  // %
  };
}
