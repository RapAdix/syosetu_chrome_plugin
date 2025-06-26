importScripts("secrets.js");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "askChatGPT") {
    console.log("💬 Received ChatGPT request");
    console.log("📌 Full sentence:", message.sentence);
    console.log("🔍 Marked part:", message.marked);

    const { sentence, marked } = message;

    // const prompt = `Explain the grammar of the marked part "${marked}" in this Japanese sentence:\n\n${sentence}`;
    const prompt = createPrompt(sentence, marked);
    
    console.log("📤 Sending request to OpenAI API...");
    console.log("📝 Prompt:", prompt);

    fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.5
      })
    })
    .then(async (res) => {
      console.log("📬 Received response. Status:", res.status);

      const data = await res.json();
      console.log("📦 Full response data:", data);

      if (res.status === 429) {
        console.warn("⚠️ Rate limit hit. Please slow down your requests.");
      }

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

function dedent(str) {
    return str.replace(/^\s+/gm, '');
}

function createPrompt(sentence, marked) {
  return dedent(`
    In the following Japanese sentence:
    「${sentence}」

    Focus only on the marked word: 「${marked}」

    Please provide:
    1. A brief explanation of its grammatical role and meaning.
    2. Any nuance about why this specific word is used.
    3. A natural English translation of the full sentence.

    Be concise.
  `);
}

