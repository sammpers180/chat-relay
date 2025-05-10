# Design Document: AIStudioProviderV2 - Debugger-Based Message Sending

**Version:** 1.0
**Date:** 2025-05-08

## 1. Objective

To implement an alternative message sending mechanism for the AI Studio provider (`AIStudioProviderV2`) that utilizes the Chrome Debugger API to directly issue network requests to the `GenerateContent` endpoint. This approach aims to bypass DOM manipulation for sending messages, potentially increasing reliability and reducing flakiness associated with UI interactions.

## 2. Rationale

*   **Increased Robustness:** Directly crafting and sending network requests can be more stable than simulating user interactions with DOM elements (input fields, buttons), which can be affected by page updates, dynamic attributes, or timing issues.
*   **Reduced Complexity:** Eliminates the need for complex DOM selector logic, event dispatching (input, change, blur), and send button state checking/retries.
*   **Leverage Existing Infrastructure:** The debugger API is already in use for capturing responses. Extending its use for sending creates a more unified interaction model with the target service.
*   **Decoupling from UI Changes:** Less susceptible to breakage if AI Studio's UI structure (selectors, button states) changes.

## 3. Key Components & Changes

### 3.1. New Provider File: `extension/providers/aistudio_v2.js`

*   **Creation:** This file will be a new provider, largely based on the existing [`extension/providers/aistudio.js`](extension/providers/aistudio.js:1).
*   **Class Name:** `AIStudioProviderV2`
*   **`captureMethod`:** Will remain `"debugger"` as response capture logic will be similar.
*   **`sendChatMessage(text, requestId)` method:** This will be the primary method modified to implement debugger-based sending.
*   **Other methods:** `initiateResponseCapture`, `handleDebuggerData`, `parseDebuggerResponse` will likely remain very similar or identical to `aistudio.js`, as response handling is unchanged.

### 3.2. `sendChatMessage` in `aistudio_v2.js` (Debugger-based Sending)

This method will no longer interact with the DOM to fill input fields or click buttons. Instead, it will:

1.  **Store `lastSentMessage`:** `this.lastSentMessage = text;` (still useful for context, though not for DOM comparison).
2.  **Define a "Dummy" Request URL:** Create a unique, identifiable URL pattern that `background.js` can intercept. This URL won't actually be hit on the network if intercepted correctly at the "Request" stage.
    *   Example: `const dummyUrl = \`https://aistudio.google.com/__aicr_debugger_send__/${requestId}?ts=\${Date.now()}\`;`
    *   The `requestId` and timestamp help in making it unique and potentially passing info.
3.  **Trigger the Dummy Request:** Use `fetch` to initiate this dummy request. The `fetch` call itself is just a trigger.
    \`\`\`javascript
    try {
      // The body of this dummy fetch can carry the actual message payload
      // for easier access in background.js if needed, or background.js
      // can get it from its own context of the original SEND_CHAT_MESSAGE command.
      await fetch(dummyUrl, {
        method: 'POST', // Using POST to easily send a body
        body: JSON.stringify({
          action: "AICR_PROXY_SEND",
          originalMessage: text,
          originalRequestId: requestId,
          // Include any other relevant settings from the original command if needed by background.js
          // e.g., model, temperature, if these are to be part of the proxied request.
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      });
      // This fetch doesn't need to "succeed" in the traditional sense.
      // Its purpose is to be intercepted.
      // The success/failure of the *actual* GenerateContent call will be handled
      // via messages from background.js.
      console.log(\`[\${this.name}] Dummy request triggered for requestId: \${requestId}\`);
      return true; // Indicates the process to send via debugger was initiated.
                   // Actual success depends on background script's actions.
    } catch (error) {
      console.error(\`[\${this.name}] Error triggering dummy request for debugger send:\`, error);
      return false;
    }
    \`\`\`
4.  **Return Value:** The function should return `true` if the dummy request was successfully initiated, or `false` on an immediate error. The actual success of sending the message to AI Studio will be asynchronous and depend on `background.js`.

### 3.3. `background.js` Modifications

The `chrome.debugger.onEvent` listener for `Fetch.requestPaused` needs to be enhanced:

1.  **Identify Dummy Request:**
    \`\`\`javascript
    if (message === "Fetch.requestPaused" && params.request.url.includes("__aicr_debugger_send__")) {
        const debuggeeId = { tabId: tabId }; // Ensure debuggeeId is correctly defined
        const interceptedRequestId = params.requestId; // This is the debugger's internal ID for the fetch

        if (params.requestStage === 'Request') {
            console.log(BG_LOG_PREFIX, \`Intercepted AICR_PROXY_SEND dummy request (ID: \${interceptedRequestId}) for tab \${tabId}\`);
            try {
                const postDataString = params.request.postData ? atob(params.request.postData) : null;
                const dummyPayload = postDataString ? JSON.parse(postDataString) : {};
                const originalMessage = dummyPayload.originalMessage;
                const appRequestId = dummyPayload.originalRequestId; // The extension's internal requestId

                if (!originalMessage || appRequestId === undefined) {
                    console.error(BG_LOG_PREFIX, "Dummy request missing originalMessage or appRequestId. Aborting proxy send.");
                    chrome.debugger.sendCommand(debuggeeId, "Fetch.failRequest", { requestId: interceptedRequestId, errorReason: "InvalidParams" });
                    // Optionally send an error message back to content script
                    return;
                }

                // TODO: Retrieve current model, temperature, etc. if needed.
                // These might come from the original SEND_CHAT_MESSAGE command stored with appRequestId,
                // or from extension settings. For now, we can hardcode or use defaults.
                const modelName = "models/gemini-2.5-pro-preview-05-06"; // Example

                // Construct the GenerateContent payload (this is the critical part)
                const generateContentPayload = [
                  modelName,
                  [[[[null, originalMessage]], "user"]], // Simplified for a single user message
                  null, null,
                  [null, null, null, null, [null, null, null, null, null, 65536, 1, 0.95, 64, "text/plain", null, null, null, null, null, null, []], [1]]
                ];

                const generateContentUrl = "https://alkalimakersuite-pa.clients6.google.com/$rpc/google.internal.alkali.applications.makersuite.v1.MakerSuiteService/GenerateContent";

                const headers = [
                    { name: "Content-Type", value: "application/json+protobuf" },
                    // Add any other headers observed in a legitimate request if necessary
                    // e.g., X-Goog-Api-Key, Authorization (if they are static or can be obtained)
                    // Cookies are usually sent automatically by the browser when transforming a request from the page's context.
                ];

                console.log(BG_LOG_PREFIX, \`Transforming dummy request to POST \${generateContentUrl} for appRequestId: \${appRequestId}\`);

                chrome.debugger.sendCommand(debuggeeId, "Fetch.continueRequest", {
                    requestId: interceptedRequestId, // The debugger's ID for the fetch being modified
                    url: generateContentUrl,
                    method: "POST",
                    postData: btoa(JSON.stringify(generateContentPayload)), // Must be base64 encoded
                    headers: headers
                }, () => {
                    if (chrome.runtime.lastError) {
                        console.error(BG_LOG_PREFIX, \`Error calling Fetch.continueRequest for proxied send:\`, chrome.runtime.lastError.message);
                        // TODO: Notify content script of failure
                    } else {
                        console.log(BG_LOG_PREFIX, \`Successfully submitted transformed request for appRequestId: \${appRequestId}. Debugger will capture response.\`);
                        // The existing response capture logic for this URL should now take over.
                        // Ensure tabInfo.lastKnownRequestId is set correctly for this appRequestId.
                        const tabInfo = debuggerAttachedTabs.get(tabId);
                        if (tabInfo) {
                            tabInfo.lastKnownRequestId = appRequestId;
                        }
                    }
                });

            } catch (e) {
                console.error(BG_LOG_PREFIX, "Error processing dummy request for proxy send:", e);
                chrome.debugger.sendCommand(debuggeeId, "Fetch.failRequest", { requestId: interceptedRequestId, errorReason: "ProcessingFailed" });
            }
            return; // Handled
        } else if (params.requestStage === 'Response') {
            // This is the "response" to our dummy fetch. We can just complete it.
            // The actual GenerateContent response will be a separate Fetch.requestPaused event.
            console.log(BG_LOG_PREFIX, \`Completing dummy request (ID: \${interceptedRequestId}) at Response stage.\`);
            chrome.debugger.sendCommand(debuggeeId, "Fetch.fulfillRequest", {
                requestId: interceptedRequestId,
                responseCode: 200,
                responseHeaders: [{ name: "Content-Type", value: "application/json" }],
                body: btoa(JSON.stringify({ success: true, message: "Dummy request processed by background." }))
            });
            return; // Handled
        }
    }
    // ... existing Fetch.requestPaused logic for capturing actual GenerateContent responses ...
    \`\`\`
2.  **Payload Construction:** The `generateContentPayload` needs to be meticulously crafted based on observed network requests (like the screenshot provided). Initially, it can be simplified for a single message turn. History and other parameters can be added later.
3.  **State Management:** Ensure `tabInfo.lastKnownRequestId` in `debuggerAttachedTabs` is correctly associated with the `appRequestId` of the message being sent via this proxy method, so the subsequent response capture links correctly.

### 3.4. `content.js` Modifications

1.  **Provider Selection:**
    *   On initialization, `content.js` will read a setting from `chrome.storage.sync` (e.g., `aistudioSendMethod: "dom" | "debugger"`).
    *   Based on this setting, it will instantiate either `AIStudioProvider` or `AIStudioProviderV2`.
    \`\`\`javascript
    // In content.js
    let activeProvider = null;
    chrome.storage.sync.get({ aistudioSendMethod: "dom" }, (settings) => {
        if (settings.aistudioSendMethod === "debugger" && typeof AIStudioProviderV2 !== 'undefined') {
            activeProvider = new AIStudioProviderV2();
            console.log("[CS CONTENT] Using AIStudioProviderV2 (Debugger Send)");
        } else {
            activeProvider = new AIStudioProvider();
            console.log("[CS CONTENT] Using AIStudioProvider (DOM Send)");
        }
        // ... rest of initialization that uses activeProvider ...
        // Inform background about debugger targets if using debugger for response
        if (activeProvider.captureMethod === "debugger") {
             chrome.runtime.sendMessage({
                type: "SET_DEBUGGER_TARGETS",
                providerName: activeProvider.name, // Ensure V2 has a distinct name if needed for logs
                patterns: [{ urlPattern: activeProvider.debuggerUrlPattern }]
            });
        }
    });
    \`\`\`
2.  **Dynamic Switching (Optional):** Listen to `chrome.storage.onChanged` to re-initialize with the correct provider if the user changes the setting while the page is active. This might involve tearing down the old provider instance.

### 3.5. Popup UI (`popup.html`, `popup.js`)

1.  **HTML:** Add a radio button group or a select dropdown in `popup.html`:
    \`\`\`html
    <div>
      <label>AI Studio Send Method:</label>
      <select id="aistudioSendMethod">
        <option value="dom">DOM Interaction</option>
        <option value="debugger">Debugger API</option>
      </select>
    </div>
    \`\`\`
2.  **JavaScript (`popup.js`):**
    *   Load the current setting on popup open and set the UI element's state.
    *   Save the selected value to `chrome.storage.sync` when it changes.
    \`\`\`javascript
    // In popup.js
    const sendMethodSelect = document.getElementById('aistudioSendMethod');

    chrome.storage.sync.get({ aistudioSendMethod: "dom" }, (items) => {
        sendMethodSelect.value = items.aistudioSendMethod;
    });

    sendMethodSelect.addEventListener('change', (event) => {
        chrome.storage.sync.set({ aistudioSendMethod: event.target.value });
    });
    \`\`\`

### 3.6. Manifest (`manifest.json`)

1.  **Content Scripts:** Ensure `aistudio_v2.js` is listed as a content script for `aistudio.google.com` domains, similar to `aistudio.js`.
    \`\`\`json
    "content_scripts": [
      {
        "matches": ["*://*.google.com/*"], // Broad, refine if possible
        "js": ["extension/common.js", "extension/content.js"],
        "css": ["css/content.css"]
      },
      {
        "matches": ["*://aistudio.google.com/*"],
        "js": ["extension/providers/aistudio.js", "extension/providers/aistudio_v2.js"],
        "all_frames": true
      }
      // ... other provider scripts ...
    ],
    \`\`\`
2.  **Permissions:** The `debugger` permission should already be present.

## 4. Implementation Steps & Order

1.  **Create `aistudio_v2.js`:** Copy `aistudio.js`, rename class to `AIStudioProviderV2`. Modify `sendChatMessage` to trigger the dummy fetch.
2.  **Update `manifest.json`:** Add `aistudio_v2.js` to content scripts.
3.  **Implement Popup UI:** Add HTML and JS for the send method selector.
4.  **Modify `content.js`:** Implement provider selection logic based on `chrome.storage.sync`.
5.  **Modify `background.js`:**
    *   Add logic to `Fetch.requestPaused` to detect and handle the `__aicr_debugger_send__` dummy request.
    *   Implement the transformation to a `GenerateContent` POST request.
    *   Ensure `lastKnownRequestId` is correctly managed for the proxied request.
6.  **Testing & Refinement:**
    *   Test sending with the "Debugger API" option selected.
    *   Verify request construction in `background.js` logs.
    *   Verify response capture.
    *   Test switching between DOM and Debugger methods.

## 5. Potential Challenges & Considerations

*   **`GenerateContent` Payload Complexity:** This is the most critical and fragile part. The payload structure must be exact. Any changes by Google to this private API could break it.
*   **Authentication/Session Headers:** While `Fetch.continueRequest` usually handles cookies correctly, any special headers required by `GenerateContent` must be identified and included.
*   **Error Handling:** Robust error handling is needed if `Fetch.continueRequest` fails, or if the transformed request is rejected by the server. Notifications back to the content script/provider are important.
*   **Dynamic Parameters:** Model name, temperature, etc., are currently hardcoded in the plan. A more advanced implementation would make these configurable or derive them from the current AI Studio UI/settings if possible.
*   **Security:** Ensure the `debuggerUrlPattern` for response capture and the dummy URL pattern are specific enough to avoid unintended interceptions.

