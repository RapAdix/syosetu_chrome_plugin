const DEFAULTS = window.JishoDefaults;

const toggle = document.getElementById("toggleSwitch");
const clearCacheButton = document.getElementById("clearCacheButton");
const statusMessage = document.getElementById("statusMessage");

// Settings inputs
const panelWidthInput = document.getElementById("panelWidthInput");
const jishoScaleInput = document.getElementById("jishoScaleInput");
const grammarScaleInput = document.getElementById("grammarScaleInput");
const resetButton = document.getElementById("resetSettingsButton");

// Load local (device-specific) settings
chrome.storage.local.get(["jishoEnabled", "panelWidth", "jishoContentScale", "grammarContentScale"], (data) => {
  toggle.checked = data.jishoEnabled ?? false;
  panelWidthInput.value = data.panelWidth ?? DEFAULTS.panelWidth;
  jishoScaleInput.value = data.jishoContentScale ?? DEFAULTS.jishoContentScale;
  grammarScaleInput.value = data.grammarContentScale ?? DEFAULTS.grammarContentScale;
});

toggle.addEventListener("change", () => {
  chrome.storage.local.set({ jishoEnabled: toggle.checked });
});

// Save local settings when inputs change
[panelWidthInput, jishoScaleInput, grammarScaleInput].forEach(input => {
  input.addEventListener("input", () => {
    chrome.storage.local.set({
      panelWidth: parseInt(panelWidthInput.value, 10),
      jishoContentScale: parseInt(jishoScaleInput.value, 10),
      grammarContentScale: parseInt(grammarScaleInput.value, 10),
    });
  });
});

// ----------------- BUTTONS -----------------

// Clear cache button
clearCacheButton.addEventListener("click", () => {
  chrome.storage.local.clear(() => {
    statusMessage.textContent = "✅ Cache cleared!";
    setTimeout(() => { statusMessage.textContent = ""; }, 2000);
  });
});

// Reset panel settings
resetButton.addEventListener("click", () => {
  chrome.storage.local.set({
    panelWidth: DEFAULTS.panelWidth,
    jishoContentScale: DEFAULTS.jishoContentScale,
    grammarContentScale: DEFAULTS.grammarContentScale
  }, () => {
    panelWidthInput.value = DEFAULTS.panelWidth;
    jishoScaleInput.value = DEFAULTS.jishoContentScale;
    grammarScaleInput.value = DEFAULTS.grammarContentScale;

    statusMessage.textContent = "🔄 Reset to defaults.";
    setTimeout(() => { statusMessage.textContent = ""; }, 2000);
  });
});
