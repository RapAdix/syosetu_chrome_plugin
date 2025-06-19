chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
