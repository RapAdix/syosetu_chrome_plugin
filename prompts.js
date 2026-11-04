const MAX_SENTENCE_LENGTH = 150;
const MAX_MARKED_LENGTH = 30;

function promptDedent(str) {
  const lines = str.replace(/^\n/, "").split("\n");
  const minIndent = Math.min(
    ...lines.filter((line) => line.trim()).map((line) => line.match(/^ */)[0].length)
  );
  return lines.map((line) => line.slice(minIndent)).join("\n").trim();
}

const styling = "Simple styling. No '*'. Use '「」\"\"'.";

function explainWordPrompt(sentence, marked, index) {
  return promptDedent(`
    In the following Japanese sentence:
    「${sentence}」

    Focus only on the marked word: 「${marked}」 at index: ${index ?? 0}

    For a non-beginner person learning japanese, please provide:
    1. A brief explanation of its meaning and grammatical role, with focus on grammar rules it follows and combines.
    2. Nuance about why this specific word is used if not obvious from previous point.
    3. A natural English translation of the full sentence, that preserves the original modifier/syntactic relationships. No justification

    Skip task introduction, be concise, especially shorten easy parts. ${styling}
  `);
}

function explainSentencePrompt(sentence) {
  return promptDedent(`
    Break down the following Japanese sentence into its grammar parts step-by-step. For each part, list:
    - The Japanese phrase with romaji and grammatical function of each part (particle, adjective, potential/negative verb, etc.)
    - Concise meaning in English
    Show how the parts connect together into bigger english meaning - make it in steps if the phrase is long and rich gramatically.

    no headings, be to the point. In a structured list. ${styling}

    Sentence: 「${sentence}」
  `);
}

globalThis.MAX_SENTENCE_LENGTH = MAX_SENTENCE_LENGTH;
globalThis.MAX_MARKED_LENGTH = MAX_MARKED_LENGTH;
globalThis.explainWordPrompt = explainWordPrompt;
globalThis.explainSentencePrompt = explainSentencePrompt;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    MAX_SENTENCE_LENGTH,
    MAX_MARKED_LENGTH,
    explainWordPrompt,
    explainSentencePrompt,
    promptDedent,
  };
}
