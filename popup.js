const toggle = document.getElementById("toggleSwitch");

chrome.storage.sync.get("jishoEnabled", ({ jishoEnabled }) => {
  toggle.checked = jishoEnabled ?? false;
});

toggle.addEventListener("change", () => {
  chrome.storage.sync.set({ jishoEnabled: toggle.checked });
});
