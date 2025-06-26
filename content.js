console.log("✅ Jisho content script loaded");

chrome.storage.sync.get("jishoEnabled", ({ jishoEnabled }) => {
  console.log("🔧 jishoEnabled =", jishoEnabled);

  if (!jishoEnabled) return;

  let lastSelection = "";
  let panel = null;

  console.log("👂 Listening for mouse selection");

  document.addEventListener("mouseup", () => {
    const selectedText = window.getSelection().toString().trim();
    console.log("🖱️ Selected text:", selectedText);

    if (
      selectedText &&
      selectedText !== lastSelection &&
      selectedText.length <= 20
    ) {
      lastSelection = selectedText;
      console.log("📦 Loading Jisho panel for:", selectedText);
      createPanel();
      updateJishoPanel(selectedText);
    }
  });

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

        if (tabId === "grammar" && lastSelection) {
          updateGPTPanel();
        }
      });
    });
  }

  function updateGPTPanel() {
    const sentence = getSentenceAroundSelection();
    const marked = lastSelection;

    const responseBox = document.getElementById("chatgpt-response");
    responseBox.textContent = "💬 Asking ChatGPT...";

    const cacheKey = `${sentence}|${marked}`;
    chrome.storage.local.get([cacheKey], (result) => {
      if (result[cacheKey]) {
        console.log('⚡️ Cache hit. Returning cached response.');
        responseBox.textContent = result[cacheKey];
      } else {
        console.log('❌ Cache miss. Sending request to API.');
        chrome.runtime.sendMessage(
          { type: "askChatGPT", sentence, marked },
          (res) => {
            responseBox.textContent = res?.reply || "⚠️ No response.";
            if (res?.reply && res.reply !== "⚠️ No response from ChatGPT.") {
              chrome.storage.local.set({ [cacheKey]: res.reply }, () => {
                console.log('💾 Cached response for:', cacheKey);
              });
            }
          }
        );
      }
    });
  }

  function updateJishoPanel(word) {
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
          cacheResult(word, response.html);
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
    if (!node || !node.textContent) return lastSelection;

    const text = node.textContent;
    const index = selection.anchorOffset;

    // Simple sentence splitter: period, 。、！？
    const before = text.slice(0, index).split(/(?<=[。！？\.\!\?])/).pop() || "";
    const after = text.slice(index).split(/[。！？\.\!\?]/)[0] || "";

    return before + after;
  }


  function cacheResult(word, html) {
    const cacheKey = `jisho_cache_${word}`;
    const maxEntries = 50;

    chrome.storage.local.get("jisho_cache_list", (res) => {
      let list = res.jisho_cache_list || [];

      // Remove word if already in list (we’ll re-add it at front)
      list = list.filter((w) => w !== word);
      list.unshift(word); // Add to front (most recent)

      // Trim list if over size
      if (list.length > maxEntries) {
        const removed = list.slice(maxEntries);
        const removeKeys = removed.map((w) => `jisho_cache_${w}`);
        chrome.storage.local.remove(removeKeys);
        list = list.slice(0, maxEntries);
      }

      // Store new HTML and updated list
      chrome.storage.local.set({
        [cacheKey]: html,
        jisho_cache_list: list,
      });
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
