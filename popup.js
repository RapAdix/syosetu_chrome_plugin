/*
 * Copyright 2025 Adrian Kucharczuk
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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

// ------------------ BUTTONS ------------------

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

// -------------- AI API Settings --------------

const openaiApiKeyInput = document.getElementById("openaiApiKey");
const geminiApiKeyInput = document.getElementById("geminiApiKey");
const toggleOpenaiInputBtn = document.getElementById("toggleOpenaiKey")
const toggleGeminiInputBtn = document.getElementById("toggleGeminiKey")
const saveApiKeyButton = document.getElementById("saveKeys");
const apiKeyStatus = document.getElementById("apiKeyStatus");

function loadKey(input, name) {
  chrome.storage.local.get(name, (result) => {
    if (result[name]) {
      input.value = result[name]; 
    }
  });
}

function toggleMask(input, btn) {
  const isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  
  const icon = btn.querySelector("i");
  if (!icon) return;

  // Toggle Icon
  if (isHidden) {
    icon.classList.remove("fa-eye");
    icon.classList.add("fa-eye-slash");
  } else {
    icon.classList.remove("fa-eye-slash");
    icon.classList.add("fa-eye");
  }
}

loadKey(openaiApiKeyInput, "openaiApiKey");
loadKey(geminiApiKeyInput, "geminiApiKey");

saveApiKeyButton.addEventListener("click", () => {
  const openaiKey = openaiApiKeyInput.value.trim();
  const geminiKey = geminiApiKeyInput.value.trim();
  let keys = {};
  if (openaiKey) {
    keys["openaiApiKey"] = openaiKey;
  }
  if (geminiKey) {
    keys["geminiApiKey"] = geminiKey;
  }
  
  if (!Object.keys(keys).length) {
    apiKeyStatus.textContent = "❌ Please enter a valid API key.";
    return;
  }

  chrome.storage.local.set(keys, () => {
    apiKeyStatus.textContent = "✅ API key saved!";
    setTimeout(() => (apiKeyStatus.textContent = ""), 2000);
  });
});

toggleOpenaiInputBtn.addEventListener("click", () => {
  toggleMask(openaiApiKeyInput, toggleOpenaiInputBtn)
});

toggleGeminiInputBtn.addEventListener("click", () => {
  toggleMask(geminiApiKeyInput, toggleGeminiInputBtn)
});

const providerSelect = document.getElementById("providerSelect");

// Clear any existing options
providerSelect.innerHTML = "";

// Populate options from Providers object
for (const [key, value] of Object.entries(window.Providers)) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = key; // display name
  providerSelect.appendChild(option);
}

chrome.storage.local.get("providerAI", ({ providerAI }) => {
  if (providerAI) {
    providerSelect.value = providerAI;
  } else {
    providerSelect.value = PROVIDERS.openAI; // default
    chrome.storage.local.set({ providerAI: PROVIDERS.openAI });
  }
});

// Save providerAI when changed
providerSelect.addEventListener("change", () => {
  const selected = providerSelect.value;
  chrome.storage.local.set({ providerAI: selected }, () => {
    console.log("✅ providerAI saved:", selected);
  });
});


// ------------ Settings navigation ------------

const apiSettingsButton = document.getElementById("apiSettingsButton");
const backButton = document.getElementById("backToMainButton");
const mainMenu = document.getElementById("mainMenu");
const apiSettings = document.getElementById("apiSettings");

apiSettingsButton.addEventListener("click", () => {
  mainMenu.style.display = "none";
  apiSettings.style.display = "block";
  document.body.style.width = "200px";
});

backButton.addEventListener("click", () => {
  apiSettings.style.display = "none";
  mainMenu.style.display = "block";
  document.body.style.width = "auto";
});

