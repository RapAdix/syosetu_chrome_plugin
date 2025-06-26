const toggle = document.getElementById("toggleSwitch");
const clearCacheButton = document.getElementById("clearCacheButton");

chrome.storage.sync.get("jishoEnabled", ({ jishoEnabled }) => {
  toggle.checked = jishoEnabled ?? false;
});

toggle.addEventListener("change", () => {
  chrome.storage.sync.set({ jishoEnabled: toggle.checked });
});

clearCacheButton.addEventListener("click", () => {
  chrome.storage.local.clear(() => {
    statusMessage.textContent = "✅ Cache cleared!";
    setTimeout(() => { statusMessage.textContent = ""; }, 2000);
  });
});
