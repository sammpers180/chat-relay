# Provider File Comparison

Comparing:

* `extension/providers/chatgpt.js`
* `extension/providers/aistudio.js`
* `extension/providers/claude.js`

---

## 1. Configurable Properties

| Property                   | ChatGptProvider                          | AIStudioProvider                                        | ClaudeProvider                                          |
| -------------------------- | ---------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| `captureMethod`            | "debugger"                               | "debugger"                                              | "debugger"                                              |
| `debuggerUrlPattern`       | `*chatgpt.com/backend-api/conversation*` | `*MakerSuiteService/GenerateContent*`                   | `*/completion*` (Matches Claude's streaming endpoint)   |
| `includeThinkingInMessage` | `true`                                   | `false`                                                 | `false`                                                 |
| Function calling toggle    | N/A                                      | `ENABLE_AISTUDIO_FUNCTION_CALLING` (with polling logic) | `ENABLE_CLAUDE_FUNCTION_CALLING` (logic commented out)  |

---

## 2. Provider Identity

* **Name**:

  * ChatGPT: `ChatGptProvider`
  * AI Studio: `AIStudioProvider`
  * Claude: `ClaudeProvider`
* **Supported Domains**:

  * ChatGPT: `["chatgpt.com"]`
  * AI Studio: `["aistudio.google.com"]`
  * Claude: `["claude.ai"]`

---

## 3. Selectors & UI Interactions

| Selector Type            | ChatGPT (`chatgpt.js`)               | AI Studio (`aistudio.js`)                                    | Claude (`claude.js`)                                     |
| ------------------------ | ------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------- |
| Input Field              | `#prompt-textarea`                   | `textarea.textarea`, `textarea.gmat-body-medium`, etc.       | `div.ProseMirror[contenteditable="true"]`                |
| Send Button              | `button[data-testid="send-button"]`  | `button.run-button`, `button[aria-label="Run"]`, etc.        | `button[aria-label="Send message"]`                      |
| Response Capture (DOM)   | `.message-bubble .text-content`      | `.response-container`, `.model-response`, `.cmark-node`, ... | `.response-container`, `.response-text`, `.model-response`, ... |
| Thinking Indicator (DOM) | `.loading-spinner`, `.thinking-dots` | `.thinking-indicator`, `.loading-indicator`, etc.            | `.thinking-indicator`, `.loading-indicator`, ...         |

---

## 4. Message Sending Logic

* **ChatGptProvider**:

  * Supports string, Blob, and array payloads.
  * Sets `innerText` on a contenteditable div, uses `ClipboardEvent('paste')` for images.
  * Retries clicking send up to 5 times with exponential backoff.

* **AIStudioProvider**:

  * Handles similar payload types but pastes via `inputField.value` and paste event.
  * Retries send click up to 60 attempts (5-minute total), triggering UI events to enable button.

* **ClaudeProvider**:
  * Supports string, Blob, and array (text/image_url) payloads.
  * Sets `textContent` on a contenteditable div, uses `ClipboardEvent('paste')` for images.
  * Retries clicking send button if initially disabled.

---

## 5. Response Capture Mechanisms

* **Debugger-Based Streaming**:

  * **ChatGPT**: Complex SSE parsing supporting thoughts, reasoning recaps, JSON patches, and OpenAI deltas.
  * **AI Studio**: Simplified JSON array parsing with `extractTextSegments` and `findEndOfUnitMarker`, plus `includeThinkingInMessage` toggle.
  * **Claude**: Parses SSE stream, looking for `content_block_delta` for text, and `message_stop` or `message_delta` with `stop_reason` for end-of-message.

* **DOM Fallback**:

  * Both implement DOM monitoring, but selectors and timing differ:

    * ChatGPT polls every 500ms, with stability checks and cleanup on final.
    * AI Studio polls every 1s up to 15s, with fallback search through multiple DOM patterns.
    * Claude has similar DOM fallback polling logic.

---

## 6. Registration

All three providers register themselves via:

```js
window.providerUtils.registerProvider(
  providerInstance.name,
  providerInstance.supportedDomains,
  providerInstance
);
```

---

**Summary of Key Differences**:

1. **Parsing complexity**:
    * ChatGPT: Extensive SSE parsing for multiple content types.
    * AI Studio: Simpler array-based JSON parsing.
    * Claude: SSE parsing focused on `content_block_delta`, `message_stop`, and `message_delta` with `stop_reason`.
2. **Thinking inclusion**:
    * ChatGPT: Merges thoughts and content by default.
    * AI Studio & Claude: Omit thoughts by default (`includeThinkingInMessage: false`).
3. **UI selectors & Features**:
    * AI Studio: Diverse selectors for its SPA, plus (previously active) function calling toggle logic.
    * Claude: Uses contenteditable div for input; function calling logic commented out.
4. **Retry strategy**:
    * ChatGPT: 5-attempt loop for send.
    * AI Studio: Longer retry window (up to 5 minutes) for send.
    * Claude: Retries send click if button is initially disabled.

This should give a clear side-by-side comparison of their design choices and implementations.
