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
      updatePanel(selectedText);
    }
  });

  function createPanel() {
    if (panel) return;

    panel = document.createElement("div");
    panel.id = "jisho-panel";

    const iframe = document.createElement("iframe");
    iframe.id = "jisho-iframe";
    iframe.style.zoom = "0.9"; // because japanese characters are better a little bigger than latin
    iframe.src = "about:blank";
    panel.appendChild(iframe);

    // Initialize width to 45vw in pixels
    const initialWidth = window.innerWidth * 0.45;
    panel.style.width = `${initialWidth}px`;
    document.body.style.marginRight = `${initialWidth - 30}px`; // because there is already some margin

    document.body.appendChild(panel);
  }

  function updatePanel(word) {
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
