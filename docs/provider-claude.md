# Claude Provider (`claude.js`)

The `ClaudeProvider` is designed to interface with Anthropic's Claude AI models via the `claude.ai` web interface. It primarily uses the Chrome DevTools Debugger API to intercept and process Server-Sent Events (SSE) for streaming responses.

## Key Features

-   **Supported Domain:** `claude.ai`
-   **Capture Method:** `debugger` (primary)
    -   Intercepts network responses matching the `debuggerUrlPattern`.
    -   Parses Server-Sent Events (SSE) to extract message content.
-   **DOM Fallback:** Basic DOM capture logic exists but is secondary to the debugger method.
-   **Stream Handling:**
    -   Accumulates text from `content_block_delta` SSE events.
    -   Identifies the end of a message by detecting `message_stop` events or `message_delta` events with a `stop_reason`.
    -   When `includeThinkingInMessage` is `false` (default), it sends the complete, accumulated message once the stream indicates completion.

## Configuration Properties

Located at the beginning of the `ClaudeProvider` class in `extension/providers/claude.js`:

-   `this.captureMethod`: (String) Set to `"debugger"` for SSE interception. Can be set to `"dom"` for DOM-based capture (less reliable for streaming).
-   `this.debuggerUrlPattern`: (String) URL pattern used by the debugger to identify Claude's response stream. Currently set to `"*\/completion*"`.
-   `this.includeThinkingInMessage`: (Boolean) If `true`, the provider attempts to include intermediate "thinking" steps (not fully implemented/tested for Claude's SSE structure). Defaults to `false`, focusing on the final answer.
-   `this.ENABLE_CLAUDE_FUNCTION_CALLING`: (Boolean) Intended for future use if Claude exposes a UI toggle for function calling. Currently, the related code is commented out as no such toggle is present.

## DOM Selectors

These selectors are used to interact with the Claude web interface:

-   `this.inputSelector`: `'div.ProseMirror[contenteditable="true"]'` (The main chat input field)
-   `this.sendButtonSelector`: `'button[aria-label="Send message"]'` (The button to send a message)
-   `this.responseSelector`: A general selector for identifying response areas, primarily for DOM fallback (`.response-container, .response-text, .model-response, ...`).
-   `this.thinkingIndicatorSelector`: Selectors for loading/thinking indicators, primarily for DOM fallback.

## Debugger Stream Parsing (`parseDebuggerResponse`)

This method is crucial for handling the SSE stream from Claude:

1.  **Splits Chunks:** Each raw data chunk from the debugger can contain multiple SSE messages (e.g., `event: ...\ndata: ...\n\n`). The method splits these.
2.  **Event Extraction:** For each SSE message, it extracts the `event:` type and `data:` payload.
3.  **Text Accumulation:**
    -   If `event: content_block_delta` and `data.delta.type === "text_delta"`, the `data.delta.text` is appended to the current chunk's text.
4.  **End-of-Message Detection:**
    -   If `event: message_stop` is encountered, the message is considered complete.
    -   If `event: message_delta` and the `data.delta.stop_reason` field is present, the message is considered complete.
5.  **Output:** Returns an object `{ text: "accumulated_text_from_this_chunk", isFinalResponse: true/false }`.

## Message Handling (`handleDebuggerData`)

1.  **Buffering:** Uses `this.requestBuffers` to accumulate text for each `requestId` across multiple data chunks.
2.  **Callback Invocation:**
    -   If `includeThinkingInMessage` is `false`:
        -   The main `responseCallback` (which sends data back to the extension's background script) is only called with the fully accumulated text when `parseDebuggerResponse` indicates `isFinalResponse: true` for a chunk, OR when the background script signals that this is the absolute final chunk from the debugger (`isFinalFromBackground: true`).
    -   If `includeThinkingInMessage` is `true` (not the current default):
        -   It would send intermediate text chunks.

## Known Issues & Considerations

-   **`debuggerUrlPattern` Specificity:** The accuracy of `this.debuggerUrlPattern` is critical. It must precisely match the URL endpoint from which Claude serves its chat responses. The current value is `"*\/completion*"`.
-   **Function Calling:** The `ensureFunctionCallingEnabled` logic is currently commented out as there is no visible UI toggle for this feature on `claude.ai`.
-   **Error Handling:** Basic error handling is in place, but complex network error scenarios or unexpected API changes from Claude might require more robust handling.