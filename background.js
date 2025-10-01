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

importScripts("defaults.js");

try {
  importScripts("secrets.js");
  console.log("✅ secrets.js loaded");
} catch (err) {
  console.info("⚠️ secrets.js not found, continuing without it");
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

    chrome.storage.local.get(["providerAI", "openaiApiKey", "geminiApiKey"], (result) => {
      let provider = result["providerAI"];
      if (!provider) {
        provider = PROVIDERS.openAI; // default
        chrome.storage.local.set({ providerAI: provider });
      } 
      
      let url = "";
      let options = {};
      if (provider === PROVIDERS.openAI) {
        if (!result["openaiApiKey"] && !OPENAI_API_KEY) {
          sendResponse({ ok: false, reply: `❌ Error you didn't provide key for ${provider}`});
          return true;
        }
        const apiKey = result["openaiApiKey"] || OPENAI_API_KEY;
        url = "https://api.openai.com/v1/chat/completions";
        options = {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: "gpt-4-turbo",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.5
          })
        };
      } else if (provider === PROVIDERS.gemini) {
        if (!result["geminiApiKey"] && !GEMINI_API_KEY) {
          sendResponse({ ok: false, reply: `❌ Error you didnt provide key for ${provider}`});
          return true;
        }

        const apiKey = result["geminiApiKey"] || GEMINI_API_KEY;
        url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
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

      console.log("📤 Sending request to", provider, "API...");

      fetch(url, options)
      .then(res => handleResponse(res, sendResponse, provider))
      .catch(err => {
        console.error("❌ ", provider, "error:", err);
        sendResponse({ ok: false, reply: `❌ Error contacting ${provider}.` });
      });
    });

    // Required for async response
    return true;
  }
  
  if (message.type === "fetchJisho") {
    const url = `https://jisho.org/search/${encodeURIComponent(message.word)}`;
    fetch(url)
      .then((response) => response.text())
      .then((html) => {
        sendResponse({ html });
      })
      .catch((error) => {
        sendResponse({ error: error.message });
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

    Please provide:
    1. A brief explanation of its grammatical role and meaning.
    2. Any nuance about why this specific word is used.
    3. A natural English translation of the full sentence, that preserves the original modifier/syntactic relationships. No justification

    Be concise.
  `);
}

function explainSentencePrompt(sentence) {
  return dedent(`
    Break down the following Japanese sentence into its grammar parts step-by-step. For each part, list:
    - The Japanese phrase with romaji and grammatical function of each part (particle, adjective, potential/negative verb, etc.)
    - Concise meaning in English

    no headings, be to the point. In a structured list.

    Sentence: 「${sentence}」
  `);
}

