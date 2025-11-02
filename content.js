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

console.log("✅ Jisho content script loaded");

const DEFAULTS = window.JishoDefaults;

const IS_TOUCH_DEVICE = navigator.maxTouchPoints > 0;

if (IS_TOUCH_DEVICE) {
  console.log("📱 Mobile device detected");
} else {
  console.log("💻 PC detected");
}

chrome.storage.local.get("jishoEnabled", ({ jishoEnabled }) => {
  console.log("🔧 jishoEnabled =", jishoEnabled);
  
  if (!jishoEnabled) return;

  let panel = null;

  let selectionTimeout = null;

  console.log("👂 Listening for selection change");

  document.addEventListener("selectionchange", (e) => {
    if (selectionTimeout) clearTimeout(selectionTimeout);

    // Get the element where selection starts
    const selection = document.getSelection();
    const anchorNode = selection?.anchorNode;
    const element = anchorNode?.nodeType === 3 ? anchorNode.parentElement : anchorNode;
    // Skip if selection is inside the panel
    if (element && element.closest("#jisho-panel")) return;

    // Wait 800ms after last selection event before handling
    selectionTimeout = setTimeout(() => {
      handleTextSelection("📱 Mobile/Touch selection:");
    }, 800);
  });

  console.log("👂 Listening for mouse selection");

  document.addEventListener("mouseup", (e) => {
    if (selectionTimeout) clearTimeout(selectionTimeout);
    if (e.target.closest("#jisho-panel")) return;

    handleTextSelection("🖱️ Mouse selected text:");
  });

  function handleTextSelection(description) {
    const selectedText = window.getSelection().toString().trim();
    console.log(description, selectedText);
    
    if (
      selectedText &&
      selectedText.length <= 20
    ) {
      console.log("📦 Loading Jisho panel for:", selectedText);
      if (!panel) {
        createPanel();
      } else {
        updatePanel();
      }
    }
  }

  function createPanel() {
    if (panel) return;
    console.log("Creating panel");

    chrome.storage.local.get({ allowedSites: [] }, ({ allowedSites }) => {
      const hostname = window.location.hostname;
      if (!allowedSites.includes(hostname)) {
        console.log("🚫 Extension disabled on this site");
        return;
      }

      panel = document.createElement("div");
      panel.id = "jisho-panel";

      // 🧭 Tab header
      const tabBar = document.createElement("div");
      tabBar.id = "jisho-tab-bar";
      tabBar.innerHTML = `
        <button class="tab-btn active" data-tab="jisho">Jisho</button>
        <button class="tab-btn" data-tab="grammar">Grammar</button>
      `;
      panel.appendChild(tabBar);

      // 📘 Jisho tab content
      const jishoTab = document.createElement("div");
      jishoTab.id = "jisho-tab";
      jishoTab.className = "tab-content active";
      const iframe = document.createElement("iframe");
      iframe.id = "jisho-iframe";
      iframe.src = "about:blank";
      if (IS_TOUCH_DEVICE) { // autofocus on iframe needs to be suppressed
        iframe.sandbox = "allow-scripts";
      } else {
        iframe.sandbox = "allow-scripts allow-same-origin";
      }
      jishoTab.appendChild(iframe);

      // 📗 Grammar tab content
      const grammarTab = document.createElement("div");
      grammarTab.id = "grammar-tab";
      grammarTab.className = "tab-content";
      grammarTab.style.whiteSpace = "pre-wrap";
      grammarTab.innerHTML =`<div id="grammar-response">Ask a grammar question!</div><div id="cached-words"></div>`;

      // Add both tabs
      panel.appendChild(jishoTab);
      panel.appendChild(grammarTab);

      // ✅ Load user preferences for width & font scale
      chrome.storage.local.get(["panelWidth", "jishoContentScale", "grammarContentScale"], (data) => {
        const panelWidth = data.panelWidth ?? DEFAULTS.panelWidth;
        const jishoScale = data.jishoContentScale ?? DEFAULTS.jishoContentScale;
        const grammarScale = data.grammarContentScale ?? DEFAULTS.grammarContentScale;
        
        console.log("Readed loaded:", {panelWidth, jishoScale, grammarScale});

        const widthPx = (window.innerWidth * panelWidth) / 100;
        panel.style.width = `${widthPx}px`;
        document.body.style.marginRight = `${widthPx - 30}px`; // because there is already some margin

        // Apply font scaling
        changeStyleZoom(iframe, jishoScale);
        changeStyleZoom(grammarTab, grammarScale);
      });

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css";

      document.body.appendChild(panel);
      document.head.appendChild(link);

      // 🖱️ Add tab switch logic
      panel.querySelectorAll(".tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          panel.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
          panel.querySelectorAll(".tab-content").forEach((tab) => tab.classList.remove("active"));

          btn.classList.add("active");
          const tabId = btn.dataset.tab;
          panel.querySelector(`#${tabId}-tab`).classList.add("active");

          updatePanel();
        });
      });

      updatePanel();
    });
  }

  function getActiveTab() {
    const activeButton = document.querySelector('#jisho-tab-bar .tab-btn.active');
    return activeButton ? activeButton.dataset.tab : null;
  }

  function updatePanel() {
    if (getActiveTab() === 'jisho') {
      updateJishoPanel();
    } else if (getActiveTab() === 'grammar') {
      updateGPTPanel();
    }
  }

  function updateGPTPanel() {
    const marked = window.getSelection().toString().trim();
    if (!marked) return;
    const {sentence, index} = getSentenceAroundSelection();

    document.getElementById("cached-words").innerHTML="";
    const responseBox = document.getElementById("grammar-response");
    responseBox.textContent = "💬 Checking cache...";

    const explainWordKey = `explain_word|${sentence}|${marked}|${index}`;
    const explainSentenceKey = `explain_sentence|${sentence}`;

    chrome.storage.local.get([explainWordKey, explainSentenceKey], (result) => {
      const wordResponse = result[explainWordKey];
      const sentenceResponse = result[explainSentenceKey];

      responseBox.textContent = "";
      // Show word response if cached
      if (wordResponse) {
        const wordResponseElement = document.createElement("div");
        wordResponseElement.id = "word-response";
        wordResponseElement.classList.add("grammar-result");
        wordResponseElement.textContent = wordResponse;
        const deleteBtn = createFaDeleteButton(() => {
          console.debug(`Delete for word: "${marked}" in a sentence: "${sentence}" was pressed`);
          chrome.storage.local.remove(explainWordKey, () => {
            if (chrome.runtime.lastError) {
              console.error("Error removing key:", chrome.runtime.lastError);
              return;
            }

            // Add fade-out animation
            wordResponseElement.classList.add("fade-out");

            // Remove element after animation ends (200ms)
            setTimeout(() => {
              wordResponseElement.remove();
            }, 200);
          });
        });
        wordResponseElement.appendChild(deleteBtn);
        responseBox.appendChild(wordResponseElement);
      } 
      if (sentenceResponse) {
        const sentenceResponseElement = document.createElement("div");
        sentenceResponseElement.id = "sentence-response";
        sentenceResponseElement.classList.add("grammar-result");
        sentenceResponseElement.textContent = sentenceResponse;
        const deleteBtn = createFaDeleteButton(() => {
          console.debug(`Delete for sentence: "${sentence}" was pressed`);
          chrome.storage.local.remove(explainSentenceKey, () => {
            if (chrome.runtime.lastError) {
              console.error("Error removing key:", chrome.runtime.lastError);
              return;
            }

            // Add fade-out animation
            sentenceResponseElement.classList.add("fade-out");

            // Remove element after animation ends (200ms)
            setTimeout(() => {
              sentenceResponseElement.remove();
            }, 200);
          });
        });
        sentenceResponseElement.appendChild(deleteBtn);
        responseBox.appendChild(sentenceResponseElement);
      } 
      if (!wordResponse && !sentenceResponse) {
        console.log('❌ Cache miss. Waiting for user confirmation.');
        responseBox.textContent = `❔ No cached response found for ${marked}.\n`;
      }

      // Create word button if not cached
      if (!wordResponse) {
        createAskButton("Ask about selected word", () => {
          console.log("Ask about Word was pressed:", marked, "sentece:", sentence);
          askAI(explainWordKey, sentence, marked, index);
        });
      }

      // Create sentence button if not cached
      if (!sentenceResponse) {
        createAskButton("Ask about whole sentence", () => {
          console.log("Ask about Sentence was pressed:", sentence);
          askAI(explainSentenceKey, sentence, null, null);
        });
      }

      if (!wordResponse) {
        chrome.storage.local.get(null, (items) => {
          const keysForSentence = Object.keys(items)
            .filter(k => k.startsWith(`explain_word|${sentence}|`));

          // Each key encodes: sentence | word | index
          const cachedWords = keysForSentence.map(k => {
            const [, , word, index] = k.split("|");
            return { word, index: parseInt(index), reply: items[k] };
          }).sort((a, b) => a.index - b.index);

          if (keysForSentence?.length) {
            showCachedWords(cachedWords);
          }
        });
      }
    });
  }

  function showCachedWords(cachedWords) {
    const container = document.getElementById("cached-words");
    container.innerHTML = "<p>📚 Cached words:</p>";

    cachedWords.forEach(({word, reply, index}) => {
      const btn = document.createElement("button");
      btn.textContent = `${word} (${index})`;
      btn.addEventListener("click", () => {
        document.getElementById("grammar-response").textContent = reply;
      });
      container.appendChild(btn);
    });
  }


  function createAskButton(label, onClick) {
    const button = document.createElement('button');
    button.textContent = label;
    button.style.margin = '5px';
    button.addEventListener('click', () => {
      button.disabled = true;
      button.textContent = '💬 Asking...';
      onClick();
    });
    document.getElementById("grammar-response").appendChild(button);
  }

  function createFaDeleteButton(onClick) {
    const deleteBtn = document.createElement("button");
    deleteBtn.classList.add("delete-btn");
    deleteBtn.title = "Delete this result";

    deleteBtn.addEventListener('click', () => {
      deleteBtn.disabled = true;
      deleteBtn.textContent = 'Deleting...';
      onClick();
    });

    const icon = document.createElement("i");
    icon.classList.add("fa", "fa-trash");

    deleteBtn.appendChild(icon);
    return deleteBtn;
  }

  function askAI(cacheKey, sentence, marked, index) {
    chrome.runtime.sendMessage(
      { type: "askAI", sentence, marked, index },
      (res) => {
        const responseBox = document.getElementById("grammar-response");

        if (res.ok) {
          safeSetToStorage({ [cacheKey]: res.reply }, 
            () => { console.log('💾 Cached response for:', cacheKey); }, 
            () => { alert('❌ Cache is full. Cannot save new response.'); }
          );
          updateGPTPanel();
        } else {
          responseBox.prepend(document.createElement("br"));
          responseBox.prepend(document.createTextNode(res.reply));
        }
      }
    );
  }

  function updateJishoPanel() {
    const word = window.getSelection().toString().trim();
    if (!word || word.length > 20) return;
    const cacheKey = `jisho_cache_${word}`;

    chrome.storage.local.get(["jisho_cache_list", cacheKey], (res) => {
      const html = res[cacheKey];
      const iframe = document.getElementById("jisho-iframe");

      if (html) {
        console.log("⚡ Loading from cache:", word);
        iframe.srcdoc = html;
        return;
      }

      console.log("📡 Asking background to fetch:", word);
      chrome.runtime.sendMessage({ type: "fetchJisho", word }, (response) => {
        if (response?.html) {
          if (word === window.getSelection().toString().trim()) {
            iframe.srcdoc = response.html;
          }
          cacheJishoResult(cacheKey, response.html);
        } else {
          iframe.srcdoc = `<p>❌ Failed to load Jisho: ${response?.error}</p>`;
          console.error(response?.error);
        }
      });
    });
  }

  function getSentenceAroundSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return "";

    const range = selection.getRangeAt(0);
    const startNode = range.startContainer;
    const endNode = range.endContainer;
    const startOffset = range.startOffset;

    if (startNode === endNode && startNode.nodeType === Node.TEXT_NODE) {
      const text = startNode.textContent;
      const index = startOffset;

      // Simple sentence splitter: period, 。、！？
      // index+1 in case that 'marked' is at the beginning of the sentence.
      const before = text.slice(0, index + 1).split(/(?<=[。！？\.\!\?])/).pop().slice(0, -1) || "";
      const after = text.slice(index).split(/[。！？\.\!\?]/)[0] || "";

      return {sentence: before + after, index: before.length};
    } else {
      console.warn("Currently only higlhihts inside the same node are supported");
    }
  }


  function cacheJishoResult(cacheKey, html) {
    chrome.storage.local.get("jisho_cache_list", (res) => {
      let list = res.jisho_cache_list || [];

      // Remove word if already in list (we’ll re-add it at front)
      list = list.filter((w) => w !== cacheKey);
      list.unshift(cacheKey); // Add to front (most recent)

      // Store new HTML and updated list
      safeSetToStorage({
          [cacheKey]: html,
          jisho_cache_list: list,
        },
        () => { console.log('💾 Cached response for:', cacheKey); }, 
        () => { alert('❌ Cache is full. Cannot save new response.'); }
      );
    });

    //For development size tracking
    function getSizeInKB(str) {
      return new Blob([str]).size / 1024;
    }

    chrome.storage.local.get(null, (items) => {
      let totalKB = 0;

      for (const [key, value] of Object.entries(items)) {
        if (key.startsWith("jisho_cache_") && typeof value === "string") {
          totalKB += getSizeInKB(value);
        }
      }

      console.log(`📦 Estimated cache size: ${totalKB.toFixed(2)} KB`);
    });
  }

  function changeStyleZoom(element, newScale) {
    if (element) {
      if (!IS_TOUCH_DEVICE) { // Because this does not work for Android
        element.style.zoom = newScale / 100;
      } else {
        element.style.transform = `scale(${newScale / 100})`;
        element.style.transformOrigin = "top left";
        element.style.width = `${100 * 100 / newScale}%`;
        element.style.height = `${100 * 100 / newScale}%`;
      }
    }
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local") {
      if (changes.panelWidth) {
        const newWidth = changes.panelWidth.newValue ?? window.JishoDefaults.panelWidth;
        const panel = document.getElementById("jisho-panel");
        if (panel) {
          const widthPx = (window.innerWidth * newWidth) / 100;
          panel.style.width = `${widthPx}px`
        }
      }
      if (changes.jishoContentScale) {
        const newScale = changes.jishoContentScale.newValue ?? DEFAULTS.jishoContentScale;
        const iframe = document.getElementById("jisho-iframe");
        changeStyleZoom(iframe, newScale);
      }
      if (changes.grammarContentScale) {
        const newScale = changes.grammarContentScale.newValue ?? DEFAULTS.grammarContentScale;
        const grammarTab = document.getElementById("grammar-tab");
        changeStyleZoom(grammarTab, newScale);
      }
    }
  });

});
