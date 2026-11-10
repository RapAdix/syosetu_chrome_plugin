# Privacy Policy

**Japanese Reading Assistant - Jisho in Side Panel** respects your privacy.
This policy explains what data is stored locally, what data is transmitted when you use dictionary or AI features, and how it is handled.

*Last updated: November 11, 2026*

---

## 🔐 Data Stored Locally on Your Device

The extension uses Chrome's local storage (`chrome.storage.local`) to store:
- **Extension settings & preferences:** Selected AI provider, selected model names, and feature toggles.
- **Your own API keys (optional):** OpenAI and/or Gemini API keys that you enter in settings. These keys are stored **only locally** on your device and are never transmitted to the developer.
- **Trial server session (optional):** If you log in to the **Server** provider, your `username` and 30-day session token (`serverAuthToken`) are stored locally until you click **Log Out**, clear settings, or uninstall the extension.
- **Lookup cache:** Recent Jisho dictionary queries and grammar explanation results are cached locally in Chrome storage for faster access.

---

## 🌐 Data Transmitted Off-Device (Only on User Action)

Data is only sent off your device when you actively trigger a lookup, explanation, or login:

### 1. Jisho Dictionary Lookups
- When you look up a word, the selected Japanese word is sent to **Jisho.org** (`https://jisho.org`) to retrieve dictionary entries.

### 2. AI Grammar Explanations (Own API Key — OpenAI / Gemini)
- If you select **OpenAI** or **Gemini** with your own API key, the selected Japanese sentence/word prompt is sent directly from your browser to **OpenAI** or **Google Gemini** using your API key.
- Your API key and queries go directly to the selected provider and are never sent to the developer's server.

### 3. Optional Trial Server (`server` Provider)
If you choose the **Server** provider and log in with provided trial credentials:
- **Authentication:** Your entered `username` and `password` are sent over HTTPS to the developer's backend server (hosted on **Cloudflare Workers**) to verify your account and issue a session token.
  - The server database (**Cloudflare D1**) stores your username, a salted PBKDF2 password hash, and daily request quota counters (`daily_limit`, `requests_today`, `last_request_date`).
  - **Important:** Only use provided trial credentials—never enter your Google, Jisho, or personal passwords.
- **Grammar Queries:** When you request an AI explanation using the **Server** provider, the selected Japanese sentence, marked word, and word index are sent over HTTPS to the developer's server, which formats the prompt and forwards it to the **Google Gemini API** or **OpenAI API** to generate the explanation.
  - The server updates your daily request count and returns the explanation. It does **not** store or log your submitted sentences or AI responses in its database.

---

## 🚫 No Tracking, Advertising, or Data Selling

- The extension does **not** track your browsing history, run background analytics, show ads, or sell or share your data with data brokers or unrelated third parties.
- Third-party services are contacted solely to fulfill the dictionary lookup or AI grammar explanation you requested (`jisho.org`, OpenAI API, Google Gemini API, and Cloudflare for the optional trial server).

---

## 🗑️ User Controls & Data Deletion

- You can remove your saved API keys in the extension popup (**Delete Keys**), log out of the trial server (**Log Out**), or remove all locally stored extension data at any time by uninstalling the extension or clearing site/extension storage in Chrome.

---

## 📬 Contact

If you have questions or concerns about this policy, please contact:
**rapadix.dev@gmail.com**
