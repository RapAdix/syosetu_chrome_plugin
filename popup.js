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
 *
 * Additional Commercial Use Condition:
 * Commercial use of this software requires explicit permission from the author.
 * See LICENSE-COMMERCIAL.txt for details.
 */

const DEFAULTS = window.JishoDefaults;

const toggle = document.getElementById("jishoSwitch");
const clearCacheButton = document.getElementById("clearCacheButton");
const statusMessage = document.getElementById("statusMessage");
const deleteKeysButton = document.getElementById("deleteKeys");

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
  safeSetToStorage({ jishoEnabled: toggle.checked });
});

// Save local settings when inputs change
[panelWidthInput, jishoScaleInput, grammarScaleInput].forEach(input => {
  input.addEventListener("input", () => {
    safeSetToStorage({
      panelWidth: parseInt(panelWidthInput.value, 10),
      jishoContentScale: parseInt(jishoScaleInput.value, 10),
      grammarContentScale: parseInt(grammarScaleInput.value, 10),
    });
  });
});

// ---------------- TOGGLE SITE ----------------

document.addEventListener("DOMContentLoaded", () => {
  const checkbox = document.getElementById("toggleSite");

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    console.log(tabs);
    const url = new URL(tabs[0].url);
    const host = url.hostname;

    chrome.storage.local.get({ allowedSites: [] }, (result) => {
      let sites = result.allowedSites;

      if (Array.isArray(sites)) {
        allowedSitesInput.value = sites.join("\n");
        resizeTextarea();
      }

      // Set initial checkbox state
      checkbox.checked = sites.includes(host);

      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          if (!sites.includes(host)) sites.push(host);
        } else {
          sites = sites.filter(s => s !== host);
        }

        allowedSitesInput.value = sites.join("\n");
        resizeTextarea();
        safeSetToStorage({ allowedSites: sites }, () => {
          console.log(checkbox.checked ? `Enabled on ${host}` : `Disabled on ${host}`);
        });
      });
    });
  });
});

// ---------- ENABLED SITES DROPDOWN -----------

const siteListChevronButton = document.getElementById("siteListChevron");
const siteListDropdown = document.getElementById("siteListDropdown");
const allowedSitesInput = document.getElementById("allowedSitesInput");
const saveAllowedSitesButton = document.getElementById("saveAllowedSitesButton");

// Expand / collapse the dropdown
siteListChevronButton.addEventListener("click", () => {
  const isOpen = siteListDropdown.style.display === "block";

  siteListDropdown.style.display = isOpen ? "none" : "block";

  // rotate icon
  siteListChevronButton.classList.toggle("rotate");

  if (!isOpen) resizeTextarea(); // only resize when opening
});

// Save updated list
saveAllowedSitesButton.addEventListener("click", () => {
  const list = allowedSitesInput.value
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);

  chrome.storage.local.set({ allowedSites: list });

  // Refresh toggleSite if user edited the active domain
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const currentHost = new URL(tabs[0].url).hostname;
    const toggleSite = document.getElementById("toggleSite");
    toggleSite.checked = list.includes(currentHost);
  });
});

function resizeTextarea() {
    allowedSitesInput.style.height = Math.min(allowedSitesInput.scrollHeight, window.innerHeight * 0.35) + "px";
}

// Update on user input
allowedSitesInput.addEventListener("input", resizeTextarea);

// ------------------ BUTTONS ------------------

// Clear cache button
clearCacheButton.addEventListener("click", () => {
  chrome.storage.local.get(null, (all) => {
    if (chrome.runtime.lastError) {
      console.error("Error reading storage:", chrome.runtime.lastError);
      return;
    }

    let keysToDelete = Object.keys(all).filter(key =>
      key.startsWith("explain_word|") ||
      key.startsWith("explain_sentence|") ||
      key.startsWith("jisho_cache_")
    );

    keysToDelete.push("jisho_cache_list");

    if (keysToDelete.length === 0) {
      console.log("No grammar cache keys to delete.");
      return;
    }

    chrome.storage.local.remove(keysToDelete, () => {
      if (chrome.runtime.lastError) {
        console.error("Error removing cache keys:", chrome.runtime.lastError);
      } else {
        statusMessage.textContent = "grammar cache cleared!";
        setTimeout(() => { statusMessage.textContent = ""; }, 2000);
      }
    });
  });
});

deleteKeysButton.addEventListener("click", () => {
  chrome.storage.local.remove(["openaiApiKey", "geminiApiKey"], () => {
    if (chrome.runtime.lastError) {
        console.error("Error removing AI keys:", chrome.runtime.lastError);
      } else {
        statusMessage.textContent = "AI keys deleted!";
        openaiApiKeyInput.value = "";
        geminiApiKeyInput.value = "";
        setTimeout(() => { statusMessage.textContent = ""; }, 2000);
      }
  });
})

// Reset panel settings
resetButton.addEventListener("click", () => {
  safeSetToStorage({
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
  const openaiKey = sanitizeApiKey(openaiApiKeyInput.value);
  const geminiKey = sanitizeApiKey(geminiApiKeyInput.value);

  openaiApiKeyInput.value = openaiKey;
  geminiApiKeyInput.value = geminiKey;

  let keys = {};
  if (openaiKey) {
    keys["openaiApiKey"] = openaiKey;
  }
  if (geminiKey) {
    keys["geminiApiKey"] = geminiKey;
  }
  
  const provider = providerSelect.value;
  const modelKey = getModelStorageKey(provider);
  const rawModel = modelSelect.value === "__custom__"
    ? customModelInput.value
    : modelSelect.value;
  const currentModel = sanitizeModelName(rawModel);
  if (currentModel) {
    keys[modelKey] = currentModel;
    if (modelSelect.value === "__custom__") {
      customModelInput.value = currentModel;
    }
  }

  if (!Object.keys(keys).length) {
    statusMessage.textContent = "Please enter a valid API key.";
    return;
  }

  safeSetToStorage(keys, () => {
    statusMessage.textContent = "API key & model saved!";
    if (openaiKey) fetchModelsFromProvider(PROVIDERS.openAI, false);
    if (geminiKey) fetchModelsFromProvider(PROVIDERS.gemini, false);
    if (!openaiKey && !geminiKey) fetchModelsFromProvider(provider, false);
    setTimeout(() => (statusMessage.textContent = ""), 2000);
  });
});

toggleOpenaiInputBtn.addEventListener("click", () => {
  toggleMask(openaiApiKeyInput, toggleOpenaiInputBtn)
});

toggleGeminiInputBtn.addEventListener("click", () => {
  toggleMask(geminiApiKeyInput, toggleGeminiInputBtn)
});

const providerSelect = document.getElementById("providerSelect");
const modelSelect = document.getElementById("modelSelect");
const customModelInput = document.getElementById("customModelInput");
const refreshModelsBtn = document.getElementById("refreshModelsBtn");
const modelStatusNotice = document.getElementById("modelStatusNotice");

function showModelNotice(msg) {
  if (modelStatusNotice) {
    modelStatusNotice.textContent = msg;
    modelStatusNotice.style.display = "block";
  }
}

function hideModelNotice() {
  if (modelStatusNotice) {
    modelStatusNotice.textContent = "";
    modelStatusNotice.style.display = "none";
  }
}

openaiApiKeyInput.addEventListener("input", () => {
  if (providerSelect.value === PROVIDERS.openAI && openaiApiKeyInput.value.trim()) {
    hideModelNotice();
  }
});

geminiApiKeyInput.addEventListener("input", () => {
  if (providerSelect.value === PROVIDERS.gemini && geminiApiKeyInput.value.trim()) {
    hideModelNotice();
  }
});

function getModelStorageKey(provider) {
  return provider === PROVIDERS.gemini ? "geminiModel" : "openaiModel";
}

function getModelCacheKey(provider) {
  return provider === PROVIDERS.gemini ? "cachedGeminiModels" : "cachedOpenaiModels";
}

function renderModelDropdown(provider, modelList, selectedModel, placeholderText = null) {
  modelSelect.innerHTML = "";
  
  const models = modelList || [];
  
  if (models.length === 0) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = placeholderText || "(Enter API key above)";
    modelSelect.appendChild(placeholder);
  } else {
    models.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      modelSelect.appendChild(opt);
    });
  }

  const customOpt = document.createElement("option");
  customOpt.value = "__custom__";
  customOpt.textContent = "Custom...";
  modelSelect.appendChild(customOpt);

  const targetModel = selectedModel || (models.length > 0 ? models[0] : "");
  if (models.includes(targetModel)) {
    modelSelect.value = targetModel;
    customModelInput.style.display = "none";
  } else if (targetModel) {
    modelSelect.value = "__custom__";
    customModelInput.value = targetModel;
    customModelInput.style.display = "block";
  } else {
    modelSelect.value = models[0] || "";
    customModelInput.style.display = "none";
  }
}

function loadProviderModelsAndSelection(provider, fetchLive = false) {
  hideModelNotice();
  const modelKey = getModelStorageKey(provider);
  const cacheKey = getModelCacheKey(provider);

  chrome.storage.local.get([modelKey, cacheKey], (result) => {
    const cachedModels = result[cacheKey] || [];
    let savedModel = result[modelKey];
    if (cachedModels.length > 0 && (!savedModel || !cachedModels.includes(savedModel))) {
      savedModel = cachedModels[0];
    }

    renderModelDropdown(provider, cachedModels, savedModel, cachedModels.length === 0 ? "Loading models..." : null);

    // If fetchLive is requested or no models are cached yet, fetch from provider
    if (fetchLive || cachedModels.length === 0) {
      fetchModelsFromProvider(provider, false);
    }
  });
}

function fetchModelsFromProvider(provider, isManual = false) {
  const isCurrentProvider = providerSelect.value === provider;
  const icon = (isCurrentProvider && refreshModelsBtn) ? refreshModelsBtn.querySelector("i") : null;
  if (icon) icon.classList.add("fa-spin");
  if (isCurrentProvider && refreshModelsBtn) refreshModelsBtn.disabled = true;

  chrome.runtime.sendMessage({ type: "fetchAvailableModels", provider }, (response) => {
    if (icon) icon.classList.remove("fa-spin");
    if (refreshModelsBtn) refreshModelsBtn.disabled = false;

    if (chrome.runtime.lastError) {
      console.warn("fetchAvailableModels error:", chrome.runtime.lastError.message);
      if (isManual && providerSelect.value === provider) {
        statusMessage.textContent = "Error fetching models.";
        setTimeout(() => { statusMessage.textContent = ""; }, 2500);
      }
      return;
    }

    if (response && response.ok && Array.isArray(response.models) && response.models.length > 0) {
      if (providerSelect.value === provider) {
        hideModelNotice();
      }
      const cacheKey = getModelCacheKey(provider);
      const modelKey = getModelStorageKey(provider);

      chrome.storage.local.get(modelKey, (res) => {
        let currentSaved = res[modelKey];
        // If current model is missing or no longer on the list of available models, pick new one
        if (!currentSaved || !response.models.includes(currentSaved)) {
          if (modelSelect.value === "__custom__" && customModelInput.value.trim()) {
            currentSaved = customModelInput.value.trim();
          } else {
            currentSaved = response.selectedModel;
          }
        }

        const updates = {
          [cacheKey]: response.models,
          [modelKey]: currentSaved
        };

        safeSetToStorage(updates, () => {
          if (providerSelect.value === provider) {
            renderModelDropdown(provider, response.models, currentSaved);
            if (isManual) {
              statusMessage.textContent = `Updated ${provider} models!`;
              setTimeout(() => { statusMessage.textContent = ""; }, 2000);
            }
          }
        });
      });
    } else {
      const cacheKey = getModelCacheKey(provider);
      chrome.storage.local.get([cacheKey, getModelStorageKey(provider)], (res) => {
        const cached = res[cacheKey] || [];
        // Only update UI/notices if the user is currently viewing THIS provider
        if (providerSelect.value === provider) {
          if (cached.length === 0) {
            renderModelDropdown(provider, [], res[getModelStorageKey(provider)], "(Enter API key above)");
          }
          if (response && response.noKey) {
            showModelNotice(`⚠️ Enter ${provider === PROVIDERS.gemini ? "Gemini" : "OpenAI"} key above to load models`);
          } else if (response && response.error) {
            showModelNotice(`⚠️ ${response.error}`);
          }
          if (isManual && response && response.error) {
            statusMessage.textContent = response.error;
            setTimeout(() => { statusMessage.textContent = ""; }, 3000);
          }
        }
      });
    }
  });
}

modelSelect.addEventListener("change", () => {
  const provider = providerSelect.value;
  const modelKey = getModelStorageKey(provider);

  if (modelSelect.value === "__custom__") {
    customModelInput.style.display = "block";
    customModelInput.focus();
    const clean = sanitizeModelName(customModelInput.value);
    if (clean) {
      customModelInput.value = clean;
      safeSetToStorage({ [modelKey]: clean });
    }
  } else {
    customModelInput.style.display = "none";
    const chosen = sanitizeModelName(modelSelect.value);
    safeSetToStorage({ [modelKey]: chosen }, () => {
      console.log(`Saved ${provider} model:`, chosen);
    });
  }
});

customModelInput.addEventListener("input", () => {
  const provider = providerSelect.value;
  const modelKey = getModelStorageKey(provider);
  const val = sanitizeModelName(customModelInput.value);
  if (val !== customModelInput.value) {
    customModelInput.value = val;
  }
  if (val) {
    safeSetToStorage({ [modelKey]: val });
  }
});

if (refreshModelsBtn) {
  refreshModelsBtn.addEventListener("click", () => {
    fetchModelsFromProvider(providerSelect.value, true);
  });
}

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
  const currentProvider = providerAI || PROVIDERS.openAI;
  providerSelect.value = currentProvider;
  if (!providerAI) {
    safeSetToStorage({ providerAI: PROVIDERS.openAI });
  }
  loadProviderModelsAndSelection(currentProvider, false);
});

// Save providerAI when changed and update models
providerSelect.addEventListener("change", () => {
  const selected = providerSelect.value;
  hideModelNotice();
  safeSetToStorage({ providerAI: selected }, () => {
    console.log("✅ providerAI saved:", selected);
  });
  loadProviderModelsAndSelection(selected, false);
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
  loadProviderModelsAndSelection(providerSelect.value, true);
  const otherProvider = providerSelect.value === PROVIDERS.gemini ? PROVIDERS.openAI : PROVIDERS.gemini;
  fetchModelsFromProvider(otherProvider, false);
});

backButton.addEventListener("click", () => {
  apiSettings.style.display = "none";
  mainMenu.style.display = "block";
  document.body.style.width = "auto";
});

