importScripts("secrets.js");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "askChatGPT") {
    console.log("💬 Received ChatGPT request");
    console.log("📌 Full sentence:", message.sentence);
    console.log("🔍 Marked part:", message.marked);

    const { sentence, marked } = message;

    const prompt = `Explain the grammar of the marked part "${marked}" in this Japanese sentence:\n\n${sentence}`;
    // const prompt = createPrompt(sentence, marked);
    
    console.log("📤 Sending request to OpenAI API...");
    console.log("📝 Prompt:", prompt);

    fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
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
    I would like you to carefully analyze the following Japanese sentence for me:

    「${sentence}」

    Please perform the following steps in detail:
    1. **Focus on the word/phrase:** 「${marked}」
      - Explain what it refers to in this sentence.
      - Explain why this word is used instead of alternatives.
      - Provide any cultural or pragmatic nuance it carries.

    2. **Break down the sentence structure**:
      - Identify and explain the function of each word or phrase.
      - Clarify particles and their grammatical roles.

    3. **Explain surrounding grammar:**
      - Analyze the grammar patterns and explain their contribution to the sentence’s meaning and tone.
      - Mention whether the sentence is formal, casual, or carries emotional undertones.

    4. **Provide a natural, full English translation**:
      - Make sure the translation reflects both the literal and emotional meaning.

    5. **Optional: Additional nuance or context:**
      - If the sentence could have different meanings depending on context, please explain the possible interpretations.

    Please answer step-by-step and in detail, as if you are explaining to a student who is learning Japanese grammar at an intermediate level.
  `);
}
