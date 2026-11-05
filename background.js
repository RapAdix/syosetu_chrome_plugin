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

importScripts("defaults.js", "helpers.js", "prompts.js");

try {
  importScripts("secrets.js");
  console.log("✅ secrets.js loaded");
} catch (err) {
  console.info("⚠️ secrets.js not found, continuing without it");
}

try {
  importScripts("server_config.js");
  console.log("✅ server_config.js loaded");
} catch (err) {
  console.info("⚠️ server_config.js not found, continuing without it");
}

function filterProviderModels(provider, data) {
  if (provider === PROVIDERS.openAI) {
    const chatRegex = /^(gpt-|o[1-3]|chatgpt-)/i;
    const excludeRegex = /(audio|realtime|transcription|tts|embedding|moderation|dall-e|search|similarity|edit|insert|preview|instruct)/i;
    const models = (data || [])
      .map(m => (typeof m === "string" ? m : m.id))
      .filter(id => id && chatRegex.test(id) && !excludeRegex.test(id));

    return Array.from(new Set(models)).sort((a, b) => {
      const aHasDate = /\d{4}-\d{2}-\d{2}/.test(a);
      const bHasDate = /\d{4}-\d{2}-\d{2}/.test(b);
      if (aHasDate !== bHasDate) return aHasDate ? 1 : -1;
      return a.localeCompare(b);
    });
  } else if (provider === PROVIDERS.gemini) {
    const models = (data || [])
      .filter(m => {
        if (typeof m === "string") return m.includes("gemini");
        const methods = m.supportedGenerationMethods || [];
        return methods.includes("generateContent") && (m.name || "").includes("gemini");
      })
      .map(m => (typeof m === "string" ? m : m.name).replace(/^models\//, ""))
      .filter(name => !/(embedding|tts|native-audio|vision)/i.test(name));

    return Array.from(new Set(models)).sort((a, b) => {
      const aExp = /(exp|preview)/i.test(a);
      const bExp = /(exp|preview)/i.test(b);
      if (aExp !== bExp) return aExp ? 1 : -1;
      return b.localeCompare(a, undefined, { numeric: true });
    });
  }
  return [];
}

function pickBestModel(provider, models) {
  if (!models || models.length === 0) {
    return provider === PROVIDERS.gemini ? "gemini-2.5-flash" : "gpt-4o-mini";
  }

  if (provider === PROVIDERS.openAI) {
    const nonDatedMini = models.find(m => /mini/i.test(m) && !/\d{4}-\d{2}-\d{2}/.test(m));
    if (nonDatedMini) return nonDatedMini;

    const anyMini = models.find(m => /mini/i.test(m));
    if (anyMini) return anyMini;

    const gpt4 = models.find(m => /^gpt-4/i.test(m) && !/\d{4}-\d{2}-\d{2}/.test(m));
    if (gpt4) return gpt4;

    return models[0];
  } else if (provider === PROVIDERS.gemini) {
    const stableFlash = models.find(m => /flash/i.test(m) && !/(exp|preview|8b|lite)/i.test(m));
    if (stableFlash) return stableFlash;

    const anyFlash = models.find(m => /flash/i.test(m));
    if (anyFlash) return anyFlash;

    return models[0];
  }

  return models[0];
}

async function fetchLiveModels(provider, apiKey) {
  const cleanKey = sanitizeApiKey(apiKey);
  if (provider === PROVIDERS.openAI) {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { "Authorization": `Bearer ${cleanKey}` }
    });
    if (!res.ok) throw new Error(`OpenAI returned status ${res.status}`);
    const data = await res.json();
    return filterProviderModels(PROVIDERS.openAI, data.data || []);
  } else if (provider === PROVIDERS.gemini) {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "x-goog-api-key": cleanKey }
    });
    if (!res.ok) throw new Error(`Gemini returned status ${res.status}`);
    const data = await res.json();
    return filterProviderModels(PROVIDERS.gemini, data.models || []);
  }
  return [];
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "serverLogin") {
    handleServerLogin(message, sendResponse);
    return true;
  }

  if (message.type === "askAI") {
    handleAskAI(message, sendResponse);
    return true; // Required for async response
  }

  if (message.type === "fetchJisho") {
    handleFetchJisho(message, sendResponse);
    return true; // Keep message channel open for async response
  }

  if (message.type === "fetchAvailableModels") {
    handleFetchAvailableModels(message, sendResponse);
    return true; // Keep message channel open for async response
  }
});

async function handleServerLogin(message, sendResponse) {
  try {
    const rawUrl = (typeof SERVER_URL !== "undefined" ? SERVER_URL : "").trim().replace(/\/+$/, "");
    if (!rawUrl) {
      sendResponse({ ok: false, error: "SERVER_URL is not set in server_config.js." });
      return;
    }
    if (!message.username || !message.username.trim()) {
      sendResponse({ ok: false, error: "Username is required." });
      return;
    }
    if (!message.password) {
      sendResponse({ ok: false, error: "Password is required." });
      return;
    }

    const res = await fetch(`${rawUrl}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: message.username.trim(), password: message.password })
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok && data.token) {
      const username = data.username || message.username;
      const updates = {
        serverAuthToken: data.token,
        serverUsername: username
      };
      safeSetToStorage(
        updates,
        () => sendResponse({ ok: true, username: username }),
        () => sendResponse({ ok: false, error: "Storage is full. Cannot save login session." })
      );
    } else {
      sendResponse({ ok: false, error: data?.error || ("Login failed (" + res.status + ")") });
    }
  } catch (err) {
    console.error("❌ Server login error:", err);
    sendResponse({ ok: false, error: err.message || "Failed to connect to server" });
  }
}

function handleAskAI(message, sendResponse) {
  console.log("💬 Received ChatGPT request");
  console.log("📌 Full sentence:", message.sentence);
  console.log("🔍 Marked part:", message.marked);

  const { sentence, marked, index } = message;

  chrome.storage.local.get(
    ["providerAI", "openaiApiKey", "geminiApiKey", "openaiModel", "geminiModel", "cachedOpenaiModels", "cachedGeminiModels", "serverAuthToken"],
    async (result) => {
      let provider = result["providerAI"];
      if (!provider) {
        provider = PROVIDERS.openAI; // default
        safeSetToStorage(
          { providerAI: provider },
          () => {},
          () => console.warn("⚠️ Could not save default providerAI to storage.")
        );
      }

      if (provider === PROVIDERS.server) {
        const baseUrl = (typeof SERVER_URL !== "undefined" ? SERVER_URL : "").trim().replace(/\/+$/, "");
        if (!baseUrl) {
          sendResponse({ ok: false, reply: "❌ SERVER_URL is not configured in server_config.js." });
          return;
        }
        if (!result.serverAuthToken) {
          sendResponse({ ok: false, reply: "❌ Please log in to the server in settings first." });
          return;
        }

        console.log("📤 Sending request to Server API:", baseUrl);
        try {
          const res = await fetch(`${baseUrl}/api/grammar`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer " + result.serverAuthToken
            },
            body: JSON.stringify({ sentence, marked, index })
          });

          const data = await res.json().catch(() => ({}));
          if (res.status === 401) {
            sendResponse({ ok: false, reply: "⚠️ Session expired or unauthorized. Please log in again in settings." });
            return;
          }
          if (res.status === 429) {
            sendResponse({ ok: false, reply: "⚠️ " + (data?.error || "Daily server quota reached.") });
            return;
          }
          if (!res.ok || !data.ok) {
            sendResponse({ ok: false, reply: "⚠️ " + (data?.error || "Server error " + res.status) });
            return;
          }
          sendResponse({ ok: true, reply: data.reply });
        } catch (err) {
          console.error("❌ Server error:", err);
          sendResponse({ ok: false, reply: "❌ Error contacting server: " + err.message });
        }
        return;
      }

      const prompt = marked
        ? explainWordPrompt(sentence, marked, index)
        : explainSentencePrompt(sentence);

      console.log("📝 Prompt created:", prompt);

      const modelKey = provider === PROVIDERS.gemini ? "geminiModel" : "openaiModel";
      const cacheKey = provider === PROVIDERS.gemini ? "cachedGeminiModels" : "cachedOpenaiModels";
      const rawApiKey = provider === PROVIDERS.gemini
        ? (result["geminiApiKey"] || (typeof GEMINI_API_KEY !== "undefined" ? GEMINI_API_KEY : ""))
        : (result["openaiApiKey"] || (typeof OPENAI_API_KEY !== "undefined" ? OPENAI_API_KEY : ""));
      const apiKey = sanitizeApiKey(rawApiKey);

      if (!apiKey) {
        sendResponse({ ok: false, reply: `❌ Error you didn't provide key for ${provider}` });
        return;
      }

      let model = sanitizeModelName(result[modelKey]);
      let cachedModels = result[cacheKey];

      // If no model has been selected yet, or if cached models are missing, prefetch models now!
      if (!model || !cachedModels || cachedModels.length === 0) {
        try {
          console.log(`🔍 Prefetching available models for ${provider}...`);
          const liveModels = await fetchLiveModels(provider, apiKey);
          if (liveModels && liveModels.length > 0) {
            cachedModels = liveModels;
            const updates = { [cacheKey]: liveModels };
            if (!model || !liveModels.includes(model)) {
              model = pickBestModel(provider, liveModels);
              updates[modelKey] = model;
              console.log(`✅ Selected and saved model for ${provider}: ${model}`);
            }
            await new Promise((resolve) =>
              safeSetToStorage(
                updates,
                resolve,
                () => {
                  console.warn(`⚠️ Could not cache models for ${provider} in storage.`);
                  resolve();
                }
              )
            );
          }
        } catch (err) {
          console.warn(`⚠️ Could not prefetch models for ${provider}:`, err);
        }
      }

      // Ensure selected model is still available in the cached models list; otherwise pick a new one
      if (!model || (cachedModels && cachedModels.length > 0 && !cachedModels.includes(model))) {
        model = pickBestModel(provider, cachedModels || []);
        await new Promise((resolve) =>
          safeSetToStorage(
            { [modelKey]: model },
            resolve,
            () => {
              console.warn(`⚠️ Could not save fallback model for ${provider} in storage.`);
              resolve();
            }
          )
        );
      }

      let url = "";
      let options = {};
      if (provider === PROVIDERS.openAI) {
        url = "https://api.openai.com/v1/chat/completions";
        options = {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.5
          })
        };
      } else if (provider === PROVIDERS.gemini) {
        model = model.replace(/^models\//, "");
        url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
        options = {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-goog-api-key": apiKey
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt
                  }
                ]
              }
            ]
          })
        };
      }

      console.log("📤 Sending request to", provider, "API with model:", model);

      fetch(url, options)
        .then(res => handleResponse(res, sendResponse, provider))
        .catch(err => {
          console.error("❌ ", provider, "error:", err);
          sendResponse({ ok: false, reply: `❌ Error contacting ${provider}.` });
        });
    }
  );
}

function handleFetchJisho(message, sendResponse) {
  const url = `https://jisho.org/search/${encodeURIComponent(message.word)}`;
  fetch(url)
    .then((response) => {
      if (!response.ok) {
        return Promise.reject({ status: response.status });
      }
      return response.text();
    })
    .then((html) => {
      sendResponse({ ok: true, reply: html });
    })
    .catch((error) => {
      if (error.status) {
        sendResponse({ ok: false, reply: `❌ Failed to load Jisho, status: ${error.status}` });
      } else {
        sendResponse({ ok: false, reply: error.message });
      }
    });
}

function handleFetchAvailableModels(message, sendResponse) {
  const provider = message.provider;
  if (provider === PROVIDERS.server) {
    sendResponse({ ok: true, models: [], selectedModel: "auto" });
    return;
  }
  chrome.storage.local.get(["openaiApiKey", "geminiApiKey", "openaiModel", "geminiModel"], async (result) => {
    try {
      const rawApiKey = provider === PROVIDERS.gemini
        ? (result["geminiApiKey"] || (typeof GEMINI_API_KEY !== "undefined" ? GEMINI_API_KEY : ""))
        : (result["openaiApiKey"] || (typeof OPENAI_API_KEY !== "undefined" ? OPENAI_API_KEY : ""));
      const apiKey = sanitizeApiKey(rawApiKey);

      if (!apiKey) {
        sendResponse({ ok: false, error: `No ${provider} API key found.`, noKey: true });
        return;
      }

      const models = await fetchLiveModels(provider, apiKey);
      const modelKey = provider === PROVIDERS.gemini ? "geminiModel" : "openaiModel";
      const cacheKey = provider === PROVIDERS.gemini ? "cachedGeminiModels" : "cachedOpenaiModels";
      let selectedModel = sanitizeModelName(result[modelKey]);
      const updates = { [cacheKey]: models };

      // Check if selected model is missing OR no longer on the list of available models
      if (!selectedModel || !models.includes(selectedModel)) {
        selectedModel = pickBestModel(provider, models);
        updates[modelKey] = selectedModel;
      }

      safeSetToStorage(
        updates,
        () => sendResponse({ ok: true, models, selectedModel }),
        () => {
          console.warn(`⚠️ Could not save fetched models for ${provider} to storage.`);
          sendResponse({ ok: true, models, selectedModel });
        }
      );
    } catch (err) {
      console.error("❌ Failed to fetch models:", err);
      sendResponse({ ok: false, error: err.message });
    }
  });
}

async function handleResponse(res, sendResponse, provider) {
  console.log("📬 Received response. Status:", res.status);

  const data = await res.json();
  console.log("📦 Full response data:", data);

  switch (res.status) {
    case 401:
      console.error("❌ Unauthorized. Invalid or missing API key.", res);
      sendResponse({ ok: false, reply: `⚠️ Your API key for ${provider} is invalid, please check if you input it correctly` });
      return;
    case 402:
      console.error("⚠️ Quota exceeded or insufficient balance.", res);
      sendResponse({ ok: false, reply: "⚠️ Quota exceeded or insufficient balance." });
      return;
    case 403:
      console.error("🚫 Forbidden. You don’t have access to this resource.", res);
      sendResponse({ ok: false, reply: `⚠️ You dont have access to that AI, please check if your API key for ${provider} has all access rights` });
      return;
    case 429:
      console.warn("⚠️ Rate limit hit. Please slow down your requests.", res);
      sendResponse({ ok: false, reply: "⚠️ Rate limit hit. Please slow down your requests." });
      return;
  }

  if (!res.ok) {
    console.warn("⚠️ API returned an error", res.status, res.statusText);
    sendResponse({ ok: false, reply: `⚠️ API returned error ${res.status}: ${res.statusText}` });
    return;
  }

  let reply = "";
  if (provider === PROVIDERS.gemini) {
    reply = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("")
  } else if (provider === PROVIDERS.openAI) {
    reply = data.choices?.[0]?.message?.content 
  }

  if (reply) {
    sendResponse({ ok: true, reply });
  } else {
    console.warn("⚠️ No response content found in API data.");
    sendResponse({ ok: false, reply: `⚠️ No response from ${provider} API.` });
  }
}

