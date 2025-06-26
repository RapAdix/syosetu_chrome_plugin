importScripts("secrets.js");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "askChatGPT") {
    const { sentence, marked } = message;

    const prompt = `Explain the grammar of the marked part "${marked}" in this Japanese sentence:\n\n${sentence}`;

    fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo", // or "gpt-4" if you have access
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5
      })
    })
    .then(res => res.json())
    .then(data => {
      const reply = data.choices?.[0]?.message?.content || "⚠️ No response from ChatGPT.";
      sendResponse({ reply });
    })
    .catch(err => {
      console.error("❌ OpenAI error:", err);
      sendResponse({ reply: "❌ Error contacting ChatGPT." });
    });

    // Required for async response
    return true;
  }
});

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
