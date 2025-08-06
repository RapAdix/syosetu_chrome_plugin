console.log("✅ Jisho content script loaded");

chrome.storage.sync.get("jishoEnabled", ({ jishoEnabled }) => {
  console.log("🔧 jishoEnabled =", jishoEnabled);

  if (!jishoEnabled) return;

  let panel = null;

  let selectionTimeout = null;

  console.log("👂 Listening for selection change");

  document.addEventListener("selectionchange", () => {
    if (selectionTimeout) clearTimeout(selectionTimeout);

    // Wait 1000ms after last selection event before handling
    selectionTimeout = setTimeout(() => {
      handleTextSelection("📱 Mobile/Touch selection:");
    }, 1000);
  });

  console.log("👂 Listening for mouse selection");

  document.addEventListener("mouseup", (e) => {
    if (e.target.closest("#jisho-panel")) return;

    if (selectionTimeout) clearTimeout(selectionTimeout);
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
      createPanel();
      updatePanel();
    }
  }

  function createPanel() {
    if (panel) return;

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
    iframe.style.zoom = "0.9"; // because japanese characters are better a little bigger than latin
    iframe.src = "about:blank";
    iframe.sandbox = "allow-scripts allow-same-origin";
    jishoTab.appendChild(iframe);

    // 📗 Grammar tab content
    const grammarTab = document.createElement("div");
    grammarTab.id = "grammar-tab";
    grammarTab.className = "tab-content";
    grammarTab.style.whiteSpace = "pre-wrap";
    grammarTab.innerHTML = `<div id="chatgpt-response">Ask a grammar question!</div>`;

    // Add both tabs
    panel.appendChild(jishoTab);
    panel.appendChild(grammarTab);

    // Initialize width to 45vw in pixels
    const initialWidth = window.innerWidth * 0.45;
    panel.style.width = `${initialWidth}px`;
    document.body.style.marginRight = `${initialWidth - 30}px`; // because there is already some margin

    document.body.appendChild(panel);

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

    const responseBox = document.getElementById("chatgpt-response");
    responseBox.textContent = "💬 Checking cache...";

    const explainWordKey = `explain_word|${sentence}|${marked}`;
    const explainSentenceKey = `explain_sentence|${sentence}`;

    chrome.storage.local.get([explainWordKey, explainSentenceKey], (result) => {
      const wordResponse = result[explainWordKey];
      const sentenceResponse = result[explainSentenceKey];

      // Show word response if cached
      if (wordResponse) {
        responseBox.textContent = wordResponse;
        if (sentenceResponse) {
          responseBox.textContent += "\n" + sentenceResponse;
        }
      } else if (sentenceResponse) {
        responseBox.textContent = sentenceResponse;
      } else {
        console.log('❌ Cache miss. Waiting for user confirmation.');
        responseBox.textContent = '❔ No cached response found.';
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
    document.getElementById("chatgpt-response").appendChild(document.createElement('br'));
    document.getElementById("chatgpt-response").appendChild(button);
  }

  function askAI(cacheKey, sentence, marked, index) {
    chrome.runtime.sendMessage(
      { type: "askChatGPT", sentence, marked, index },
      (res) => {
        const responseBox = document.getElementById("chatgpt-response");

        if (res?.reply && res.reply !== "⚠️ No response from ChatGPT.") {
          safeSetToStorage({ [cacheKey]: res.reply }, 
            () => { console.log('💾 Cached response for:', cacheKey); }, 
            () => { alert('❌ Cache is full. Cannot save new response.'); }
          );
          updateGPTPanel();
        } else {
          responseBox.appendChild(document.createElement("br"));
          responseBox.appendChild(document.createTextNode("⚠️ No response."));
        }
      }
    );
  }

  function updateJishoPanel() {
    const word = window.getSelection().toString().trim();
    if (!word) return;
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
          iframe.srcdoc = response.html;
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
    const node = selection.anchorNode;
    if (!node || !node.textContent) return selection.toString().trim();;

    const text = node.textContent;
    const index = selection.anchorOffset;

    // Simple sentence splitter: period, 。、！？
    const before = text.slice(0, index).split(/(?<=[。！？\.\!\?])/).pop() || "";
    const after = text.slice(index).split(/[。！？\.\!\?]/)[0] || "";

    return {sentence: before + after, index: before.length};
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

  function safeSetToStorage(data, onSuccess, onFailure, maxRetries = 3) {
    attemptSet(data, onSuccess, onFailure, maxRetries);
  }

  function attemptSet(data, onSuccess, onFailure, remainingRetries) {
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) {
        console.info(`⚠️ Storage write failed. Remaining retries: ${remainingRetries}`);

        if (remainingRetries <= 0) {
          console.error("❌ Failed to write even after trimming.");
          if (onFailure) onFailure();
          return;
        }

        trimJishoCache(() => {
          if (data.jisho_cache_list){
            chrome.storage.local.get("jisho_cache_list", (res) => {
              let list = res.jisho_cache_list || [];
              const keys = Object.keys(data);
              const cacheKey = keys.find(key => key !== 'jisho_cache_list');

              // Remove word if already in list (we’ll re-add it at front)
              list = list.filter((w) => w !== cacheKey);
              list.unshift(cacheKey); // Add to front (most recent)
              data.jisho_cache_list = list;
              attemptSet(data, onSuccess, onFailure, remainingRetries - 1);
            });
          } else {
            attemptSet(data, onSuccess, onFailure, remainingRetries - 1);
          }
        });
      } else {
        console.log("✅ Successfully saved.");
        if (onSuccess) onSuccess();
      }
    });
  }

  function trimJishoCache(callback) {
    chrome.storage.local.get("jisho_cache_list", (res) => {
      let list = res.jisho_cache_list || [];
      if (list.length === 0) {
        console.error("🚨 Jisho cache is already empty. Cannot trim further.");
        alert("❗ Cache full and no Jisho entries to delete.");
        if (callback) callback();
        return;
      }

      // Remove the oldest entry
      const cacheKeyToRemove = list.pop();

      chrome.storage.local.remove(cacheKeyToRemove, () => {
        chrome.storage.local.set({ jisho_cache_list: list }, () => {
          console.log(`🗑️ Removed oldest Jisho cache entry: ${cacheKeyToRemove}`);
          if (callback) callback();
        });
      });
    });
  }


  function removePanel() {
    if (panel) {
      panel.remove();
      panel = null;
    }
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.jishoEnabled?.newValue === false) {
      removePanel();
    }
  });
});
