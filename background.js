importScripts("secrets.js");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "askChatGPT") {
    const { sentence, marked } = message;

    console.log("💬 Received ChatGPT request");
    console.log("📌 Full sentence:", sentence);
    console.log("🔍 Marked part:", marked);

    const prompt = `Explain the grammar of the marked part "${marked}" in this Japanese sentence:\n\n${sentence}`;

    const requestPayload = {
      model: "gpt-3.5-turbo", // or "gpt-4" if you have access
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5
    };

    const requestHeaders = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    };

    console.log("📤 Sending request to OpenAI API...");
    console.log("📝 Prompt:", prompt);

    fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(requestPayload)
    })
      .then(res => {
        console.log("📬 Received response. Status:", res.status);
        return res.json();
      })
      .then(data => {
        const reply = data.choices?.[0]?.message?.content || "⚠️ No response from ChatGPT.";
        console.log("✅ ChatGPT reply:", reply);
        sendResponse({ reply });
      })
      .catch(err => {
        console.error("❌ Error contacting OpenAI API:", err);
        sendResponse({ reply: "❌ Error contacting ChatGPT." });
      });

    // Required to keep the message channel open for async sendResponse
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
