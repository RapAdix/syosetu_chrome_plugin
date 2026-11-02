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

importScripts("defaults.js", "helpers.js");

try {
  importScripts("secrets.js");
  console.log("✅ secrets.js loaded");
} catch (err) {
  console.info("⚠️ secrets.js not found, continuing without it");
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
  if (message.type === "askAI") {
    console.log("💬 Received ChatGPT request");
    console.log("📌 Full sentence:", message.sentence);
    console.log("🔍 Marked part:", message.marked);

    const { sentence, marked, index } = message;

    const prompt = marked
      ? explainWordPrompt(sentence, marked, index)
      : explainSentencePrompt(sentence);

    console.log("📝 Prompt created:", prompt);

    chrome.storage.local.get(
      ["providerAI", "openaiApiKey", "geminiApiKey", "openaiModel", "geminiModel", "cachedOpenaiModels", "cachedGeminiModels"],
      async (result) => {
        let provider = result["providerAI"];
        if (!provider) {
          provider = PROVIDERS.openAI; // default
          chrome.storage.local.set({ providerAI: provider });
        }

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
              chrome.storage.local.set(updates);
            }
          } catch (err) {
            console.warn(`⚠️ Could not prefetch models for ${provider}:`, err);
          }
        }

        // Ensure selected model is still available in the cached models list; otherwise pick a new one
        if (!model || (cachedModels && cachedModels.length > 0 && !cachedModels.includes(model))) {
          model = pickBestModel(provider, cachedModels || []);
          chrome.storage.local.set({ [modelKey]: model });
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

    // Required for async response
    return true;
  }
  
  if (message.type === "fetchJisho") {
    const url = `https://jisho.org/search/${encodeURIComponent(message.word)}`;
    fetch(url)
      .then((response) => {
        if (!response.ok) {
          return Promise.reject({ status:response.status });
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

    return true; // Keep message channel open for async response
  }

  if (message.type === "fetchAvailableModels") {
    const provider = message.provider;
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

        chrome.storage.local.set(updates);

        sendResponse({ ok: true, models, selectedModel });
      } catch (err) {
        console.error("❌ Failed to fetch models:", err);
        sendResponse({ ok: false, error: err.message });
      }
    });

    return true; // Keep message channel open for async response
  }
});

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

function dedent(str) {
    return str.replace(/^\s+/gm, '');
}

function explainWordPrompt(sentence, marked, index) {
  return dedent(`
    In the following Japanese sentence:
    「${sentence}」

    Focus only on the marked word: 「${marked}」 at index: ${index}

    For a non-beginner person learning japanese, please provide:
    1. A brief explanation of its meaning and grammatical role, with focus on grammar rules it follows and combines.
    2. Nuance about why this specific word is used if not obvious from previous point.
    3. A natural English translation of the full sentence, that preserves the original modifier/syntactic relationships. No justification

    Skip task introduction, be concise, especially shorten easy parts.
  `);
}

function explainSentencePrompt(sentence) {
  return dedent(`
    Break down the following Japanese sentence into its grammar parts step-by-step. For each part, list:
    - The Japanese phrase with romaji and grammatical function of each part (particle, adjective, potential/negative verb, etc.)
    - Concise meaning in English
    Show how the parts connect together into bigger english meaning - make it in steps if the phrase is long and rich gramatically.

    no headings, be to the point. In a structured list.

    Sentence: 「${sentence}」
  `);
}

