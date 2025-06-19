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
    iframe.src = "about:blank";
    panel.appendChild(iframe);

    document.body.appendChild(panel);
  }

  function updatePanel(word) {
    const iframe = document.getElementById("jisho-iframe");
    iframe.src = `https://jisho.org/search/${encodeURIComponent(word)}`;
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
