/*
 * Chat Relay: Relay for AI Chat Interfaces
 * Copyright (C) 2025 Jamison Moore
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see https://www.gnu.org/licenses/.
 */
// AI Chat Relay - Generic Provider Template
// This is a template. You need to customize it for the specific website you want to support.
class GenericProvider {
  constructor() {
    // --- START OF CONFIGURABLE PROPERTIES ---
    // **TODO: CONFIGURE THESE PROPERTIES FOR YOUR TARGET WEBSITE**
    // Method for response capture: "debugger" or "dom"
    // "debugger": Intercepts network requests. Requires `debuggerUrlPattern`.
    // "dom": Observes changes in the webpage's Document Object Model.
    this.captureMethod = "dom"; // or "debugger"
    // URL pattern for debugger to intercept if captureMethod is "debugger".
    // Make this pattern as specific as possible to avoid intercepting unrelated requests.
    // Example: "*api.example.com/chat/stream*"
    this.debuggerUrlPattern = "*your-api-endpoint-pattern*"; // VERIFY THIS PATTERN IF USING DEBUGGER
    // Whether to include "thinking" or intermediary process steps in the message,
    // or just the final answer.
    // If true, parseDebuggerResponse (if used) should aim to return a JSON string:
    // { "thinking": "...", "answer": "..." }
    // If false, it should return a string: "answer"
    this.includeThinkingInMessage = false;
    // --- END OF CONFIGURABLE PROPERTIES ---
    // **TODO: UPDATE THE PROVIDER NAME AND SUPPORTED DOMAINS**
    this.name = "GenericProvider"; // e.g., "MyCustomChatProvider"
    // List of domains this provider will activate on.
    // Example: ["chat.example.com", "another.example.net"]
    this.supportedDomains = ["example.com"]; // Replace with actual domains
    // **TODO: UPDATE SELECTORS FOR YOUR TARGET WEBSITE'S HTML STRUCTURE**
    // CSS selector for the main chat input text area.
    this.inputSelector = 'textarea[placeholder="Send a message"]'; // Adjust to match the site
    // CSS selector for the send button.
    this.sendButtonSelector = 'button[aria-label="Send"]'; // Adjust to match the site
    // CSS selector for identifying response messages or containers.
    // This is crucial for DOM capture and can be complex.
    this.responseSelector = '.message-bubble .text-content'; // Adjust to match the site
    // CSS selector for an element indicating the AI is "thinking" or generating a response.
    this.thinkingIndicatorSelector = '.loading-spinner'; // Adjust to match the site
    // Fallback selectors for DOM capture method (if primary ones are too broad or miss things)
    // These are often similar to responseSelector but might be more specific or broader.
    this.responseSelectorForDOMFallback = '.message-container .response-text'; // Adjust as needed
    this.thinkingIndicatorSelectorForDOM = '.thinking-dots, .spinner-animation'; // Adjust as needed
    // Stores the last message sent by the user to avoid capturing it as an AI response.
    this.lastSentMessage = '';
    // Manages callbacks for pending responses, mapping request IDs to callback functions.
    this.pendingResponseCallbacks = new Map();
    // Timer for DOM monitoring (if captureMethod is "dom")
    this.domMonitorTimer = null;
    // You might have initialization logic here, e.g., checking for specific site features
    // or setting up initial event listeners if absolutely necessary (though most are handled by the core).
    console.log(`[${this.name}] Provider initialized for domains: ${this.supportedDomains.join(', ')}`);
  }
  // Sends a message to the chat interface.
  // text: The message string to send.
  async sendChatMessage(text) {
    console.log(`[${this.name}] sendChatMessage called with:`, text);
    const inputField = document.querySelector(this.inputSelector);
    const sendButton = document.querySelector(this.sendButtonSelector);
    if (!inputField) {
      console.error(`[${this.name}] Input field not found with selector: ${this.inputSelector}`);
      return false;
    }
    if (!sendButton) {
      console.error(`[${this.name}] Send button not found with selector: ${this.sendButtonSelector}`);
      // Attempt to proceed if input field is found, maybe user hits enter.
      // But ideally, both should be found.
    }
    console.log(`[${this.name}] Attempting to send message to target site with:`, {
      inputFieldFound: !!inputField,
      sendButtonFound: !!sendButton
    });
    try {
      this.lastSentMessage = text;
      console.log(`[${this.name}] Stored last sent message:`, this.lastSentMessage);
      // Simulate user input
      inputField.value = text;
      inputField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      inputField.focus();
      // Wait a bit for the site's JavaScript to process the input (e.g., enable the send button)
      await new Promise(resolve => setTimeout(resolve, 100));
      if (sendButton) {
        const isDisabled = sendButton.disabled ||
                           sendButton.getAttribute('aria-disabled') === 'true' ||
                           sendButton.classList.contains('disabled'); // Common ways to disable buttons
        if (!isDisabled) {
          console.log(`[${this.name}] Clicking send button.`);
          sendButton.click();
        } else {
          console.warn(`[${this.name}] Send button is disabled. Attempting to submit differently (e.g., form submission or Enter key press).`);
          // Fallback: Try to dispatch a 'submit' event on the form if applicable,
          // or simulate an Enter key press on the input field.
          // This part is highly site-specific.
          // Example: inputField.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
          // For now, we'll just log and assume the user might press Enter manually if button click fails.
          if (inputField.form) {
            // inputField.form.requestSubmit(); // Modern way
            // or inputField.form.submit(); // Older way, might cause full page reload
          }
        }
      } else {
        // If no send button, perhaps the site relies on Enter key.
        // Consider simulating Enter press here if appropriate for the target site.
        console.log(`[${this.name}] Send button not found. User might need to press Enter or an alternative send mechanism.`);
      }
      return true;
    } catch (error) {
      console.error(`[${this.name}] Error sending message to target site:`, error);
      return false;
    }
  }
  // Initiates response capture for a given request.
  // requestId: A unique ID for the chat request.
  // responseCallback: Function to call with the (requestId, messageText, isFinal)
  initiateResponseCapture(requestId, responseCallback) {
    console.log(`[${this.name}] initiateResponseCapture called for requestId: ${requestId}. Capture method: ${this.captureMethod}`);
    this.pendingResponseCallbacks.set(requestId, responseCallback);
    if (this.captureMethod === "debugger") {
      console.log(`[${this.name}] Debugger capture selected. Callback stored for requestId: ${requestId}. Ensure background script is set up for '${this.debuggerUrlPattern}'.`);
      // The actual debugger attachment and data forwarding is handled by the background script.
      // This provider just needs to be ready to process `handleDebuggerData`.
    } else if (this.captureMethod === "dom") {
      console.log(`[${this.name}] DOM capture selected. Starting DOM monitoring for requestId: ${requestId}`);
      this._stopDOMMonitoring(); // Ensure no old monitors are running
      this._startDOMMonitoring(requestId);
    } else {
      console.error(`[${this.name}] Unknown capture method: ${this.captureMethod}`);
      responseCallback(requestId, `[Error: Unknown capture method '${this.captureMethod}' in provider]`, true);
      this.pendingResponseCallbacks.delete(requestId);
    }
  }
  // Handles data received from the debugger (via background script).
  // requestId: The unique ID for the chat request.
  // rawData: The raw data string from the intercepted network response.
  // isFinalFromBackground: Boolean indicating if the background script considers this the final chunk.
  handleDebuggerData(requestId, rawData, isFinalFromBackground) {
    console.log(`[${this.name}] handleDebuggerData called for requestId: ${requestId}. Raw data length: ${rawData ? rawData.length : 'null'}. isFinalFromBackground: ${isFinalFromBackground}`);
    const callback = this.pendingResponseCallbacks.get(requestId);
    if (!callback) {
      console.warn(`[${this.name}] No pending callback found for debugger data with requestId: ${requestId}. Ignoring.`);
      return;
    }
    let parsedText = "";
    let isFinalChunkAccordingToParser = false;
    if (rawData && rawData.trim() !== "") {
      // **TODO: IMPLEMENT CUSTOM PARSING LOGIC FOR YOUR DEBUGGER DATA**
      // This function needs to extract the actual chat message from `rawData`.
      // It might involve parsing JSON, Server-Sent Events (SSE), or other formats.
      const parseOutput = this.parseDebuggerResponse(rawData);
      parsedText = parseOutput.text;
      isFinalChunkAccordingToParser = parseOutput.isFinalResponse;
      console.log(`[${this.name}] Debugger data parsed for requestId: ${requestId}. Parsed text (first 100 chars): '${(parsedText || "").substring(0,100)}'. Parser says final: ${isFinalChunkAccordingToParser}`);
    } else {
      console.log(`[${this.name}] Received empty or null rawData from debugger for requestId: ${requestId}. isFinalFromBackground: ${isFinalFromBackground}`);
    }
    // The overall response is final if the background script says so,
    // OR if the parser itself determines this chunk is the end.
    const isFinalForCallback = isFinalFromBackground || isFinalChunkAccordingToParser;
    console.log(`[${this.name}] Calling callback for requestId ${requestId} with text (first 100): '${(parsedText || "").substring(0,100)}', isFinalForCallback: ${isFinalForCallback}`);
    callback(requestId, parsedText, isFinalForCallback);
    if (isFinalForCallback) {
      console.log(`[${this.name}] Final event processed for requestId: ${requestId}. Removing callback.`);
      this.pendingResponseCallbacks.delete(requestId);
    }
  }
  // **TODO: CUSTOMIZE THIS METHOD IF USING DEBUGGER CAPTURE**
  // Parses the raw response from the debugger.
  // jsonString: The raw data string (often JSON, but can be anything).
  // Returns an object: { text: "extracted message", isFinalResponse: boolean }
  parseDebuggerResponse(rawDataString) {
    console.log(`[${this.name}] Parsing debugger response. Input (first 200 chars):`, rawDataString ? rawDataString.substring(0,200) : "null");
    // --- GENERIC EXAMPLE: ASSUME SIMPLE TEXT OR JSON ---
    // This is a placeholder. You MUST adapt this to the actual data format.
    let extractedText = "";
    let isFinal = false; // Assume not final unless data indicates otherwise
    if (!rawDataString || rawDataString.trim() === "") {
        return { text: "", isFinalResponse: true }; // Empty response is considered final
    }
    try {
        // Attempt to parse as JSON (common for APIs)
        const jsonData = JSON.parse(rawDataString);
        // **TODO: Adapt JSON parsing to your specific API response structure**
        // Example: data might be in jsonData.choices[0].text or jsonData.message
        if (jsonData.message) {
            extractedText = jsonData.message;
        } else if (jsonData.text) {
            extractedText = jsonData.text;
        } else if (Array.isArray(jsonData) && jsonData.length > 0 && typeof jsonData[0] === 'string') {
            extractedText = jsonData.join("\\n"); // If it's an array of strings
        } else {
            // Fallback: stringify if structure is unknown but valid JSON
            extractedText = JSON.stringify(jsonData);
        }
        // Example: Check for a done flag
        if (typeof jsonData.done === 'boolean') {
            isFinal = jsonData.done;
        } else {
             // If no explicit done flag, assume a single JSON object is a complete, final response.
            isFinal = true;
        }
    } catch (e) {
        // If not JSON, treat as plain text.
        // This could also be Server-Sent Events (SSE), which need line-by-line parsing.
        // Example for SSE:
        // if (rawDataString.startsWith("data:")) {
        //   extractedText = rawDataString.substring(5).trim();
        //   if (extractedText === "[DONE]") {
        //     extractedText = ""; // Or some indicator of completion
        //     isFinal = true;
        //   }
        // } else {
        //   extractedText = rawDataString;
        // }
        // For now, just use the raw string as text
        extractedText = rawDataString;
        isFinal = true; // Assume plain text is a complete response unless part of a stream
    }
    // If `includeThinkingInMessage` is true, you might structure `extractedText` as a JSON string:
    // { "thinking": "...", "answer": "..." }
    // For this generic template, we'll assume simple text.
    const formattedOutput = this.formatOutput("", extractedText); // No separate thinking text for this basic parser
    // Basic guard against returning only empty strings if the marker says final.
    if (formattedOutput.trim() === "" && isFinal) {
        return { text: "", isFinalResponse: true };
    }
    return { text: formattedOutput, isFinalResponse: isFinal };
    // --- END OF GENERIC EXAMPLE ---
  }
  // Formats the output string, potentially including thinking text if configured.
  formatOutput(thinkingText, answerText) {
    if (this.includeThinkingInMessage && thinkingText && thinkingText.trim() !== "") {
        try {
            const result = {
                thinking: thinkingText.trim(),
                answer: (answerText || "").trim()
            };
            return JSON.stringify(result);
        } catch (e) {
            console.error(`[${this.name}] Error stringifying thinking/answer object:`, e);
            return (answerText || "").trim(); // Fallback to just answer
        }
    }
    return (answerText || "").trim(); // Default: just the answer
  }
  // --- DOM CAPTURE METHODS ---
  // Captures the response from the DOM.
  // element: Optional. A specific element to check. If null, queries using `responseSelector`.
  _captureResponseDOM(element = null) {
    // console.log(`[${this.name}] _captureResponseDOM (DOM method) called with element:`, element);
    if (!element && this.captureMethod === "dom") {
        const elements = document.querySelectorAll(this.responseSelector);
        if (elements.length > 0) {
            // **TODO: Determine which element is the LATEST response.**
            // This usually means the last one in document order.
            element = elements[elements.length - 1];
            // console.log(`[${this.name}] _captureResponseDOM: Found element via querySelectorAll:`, element);
        }
    }
    if (!element) {
      // console.log(`[${this.name}] _captureResponseDOM: No element provided or found by primary selector.`);
      // Try fallback selector
      const fallbackElements = document.querySelectorAll(this.responseSelectorForDOMFallback);
      if (fallbackElements.length > 0) {
        element = fallbackElements[fallbackElements.length - 1];
        // console.log(`[${this.name}] _captureResponseDOM: Found element via fallback selector:`, element);
      }
    }
    if (!element) {
        // console.log(`[${this.name}] _captureResponseDOM: No response element found by any selector.`);
        return { found: false, text: '' };
    }
    // Check if the AI is still "thinking" (e.g., spinner is visible)
    if (this._isResponseStillGeneratingDOM()) {
      // console.log(`[${this.name}] Response is still being generated (thinking indicator found), waiting.`);
      return { found: false, text: '' };
    }
    let responseText = "";
    let foundResponse = false;
    try {
      // **TODO: CUSTOMIZE TEXT EXTRACTION FROM THE RESPONSE ELEMENT**
      // This logic needs to reliably get the text content from `element`.
      // It might involve getting `textContent`, `innerText`, or iterating child nodes.
      // Consider cases like code blocks, multiple paragraphs, etc.
      if (element.textContent) {
        let potentialText = element.textContent.trim();
        // Basic filter: ignore if it's the user's last sent message or common loading/placeholder text.
        // This filtering can be made more robust.
        if (potentialText &&
            potentialText !== this.lastSentMessage &&
            !potentialText.toLowerCase().includes("loading") &&
            !potentialText.toLowerCase().includes("generating") &&
            !potentialText.toLowerCase().includes("thinking")) {
          responseText = potentialText;
          foundResponse = true;
          // console.log(`[${this.name}] Found response in element:`, responseText.substring(0, 100));
        } else {
          // console.log(`[${this.name}] Element text is likely noise or self-echo:`, potentialText.substring(0, 100));
        }
      } else {
        // console.log(`[${this.name}] Element has no text content.`);
      }
      // Add more sophisticated extraction if needed (e.g., combining text from multiple child elements)
    } catch (error) {
      console.error(`[${this.name}] Error capturing response from DOM element:`, error, "Element:", element);
    }
    if (foundResponse && responseText) {
      // Basic cleanup
      responseText = responseText.trim()
        .replace(/\\n{3,}/g, '\\n\\n') // Condense multiple newlines
        .trim();
    }
    return {
      found: foundResponse && !!responseText.trim(),
      text: responseText
    };
  }
  // Checks if the AI is still generating a response (for DOM method).
  _isResponseStillGeneratingDOM() {
    // **TODO: REFINE THIS LOGIC FOR YOUR TARGET SITE**
    // This checks for thinking indicators using `thinkingIndicatorSelector` or `thinkingIndicatorSelectorForDOM`.
    let thinkingIndicator = document.querySelector(this.thinkingIndicatorSelector);
    if (!thinkingIndicator) {
        thinkingIndicator = document.querySelector(this.thinkingIndicatorSelectorForDOM);
    }
    if (thinkingIndicator) {
      // Check if the indicator is visible (important for elements that are hidden/shown)
      const style = window.getComputedStyle(thinkingIndicator);
      if (style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0) {
        // console.log(`[${this.name}] DOM: Thinking indicator found and visible.`);
        return true;
      }
    }
    // console.log(`[${this.name}] DOM: No (visible) thinking indicator found.`);
    return false;
  }
  // Starts polling the DOM for responses.
  _startDOMMonitoring(requestId) {
    console.log(`[${this.name}] DOM: _startDOMMonitoring for requestId: ${requestId}`);
    this._stopDOMMonitoring(); // Clear any existing timer
    const callback = this.pendingResponseCallbacks.get(requestId);
    if (!callback) {
      console.error(`[${this.name}] DOM: No callback for requestId ${requestId} in _startDOMMonitoring.`);
      return;
    }
    let attempts = 0;
    const maxAttempts = 30; // Try for ~30 seconds (30 * 1000ms)
    const interval = 1000;  // Poll every 1 second
    this.domMonitorTimer = setInterval(() => {
      // console.log(`[${this.name}] DOM: Polling attempt ${attempts + 1}/${maxAttempts} for requestId: ${requestId}`);
      const responseData = this._captureResponseDOM();
      if (responseData.found && responseData.text.trim() !== "") {
        console.log(`[${this.name}] DOM: Response captured for requestId ${requestId}. Text (first 100): ${responseData.text.substring(0,100)}`);
        this._stopDOMMonitoring();
        // For DOM, we typically assume a captured response is final once the thinking indicator is gone.
        // More complex sites might require observing mutations to detect streaming.
        callback(requestId, responseData.text, true);
        this.pendingResponseCallbacks.delete(requestId);
      } else {
        attempts++;
        if (attempts >= maxAttempts) {
          console.warn(`[${this.name}] DOM: Max attempts reached for requestId ${requestId}. No complete response captured or thinking indicator persisted.`);
          this._stopDOMMonitoring();
          // If still no response, check one last time without waiting for thinking indicator.
          const lastAttemptData = this._captureResponseDOM();
          if (lastAttemptData.found && lastAttemptData.text.trim() !== "") {
               callback(requestId, lastAttemptData.text, true);
          } else {
               callback(requestId, "[Error: Timed out waiting for DOM response or response remained empty]", true);
          }
          this.pendingResponseCallbacks.delete(requestId);
        }
      }
    }, interval);
    console.log(`[${this.name}] DOM: Monitoring started with timer ID ${this.domMonitorTimer} for request ${requestId}.`);
  }
  // Stops the DOM polling timer.
  _stopDOMMonitoring() {
    if (this.domMonitorTimer) {
      // console.log(`[${this.name}] DOM: Stopping DOM monitoring timer ID ${this.domMonitorTimer}`);
      clearInterval(this.domMonitorTimer);
      this.domMonitorTimer = null;
    }
  }
  // --- UTILITY METHODS ---
  // Determines if response monitoring should be skipped.
  // (Primarily for background script to decide if it should attach debuggers)
  shouldSkipResponseMonitoring() {
    // If using debugger, background script handles it. If DOM, content script handles it.
    // console.log(`[${this.name}] shouldSkipResponseMonitoring called. Capture method: ${this.captureMethod}`);
    return this.captureMethod === "debugger";
  }
  // Returns URL patterns for the debugger to intercept (if captureMethod is "debugger").
  getStreamingApiPatterns() {
    console.log(`[${this.name}] getStreamingApiPatterns called. Capture method: ${this.captureMethod}`);
    if (this.captureMethod === "debugger" && this.debuggerUrlPattern && this.debuggerUrlPattern !== "*your-api-endpoint-pattern*") {
      console.log(`[${this.name}] Using debugger URL pattern: ${this.debuggerUrlPattern}`);
      // Background script expects an array of objects with { urlPattern, requestStage }
      return [{ urlPattern: this.debuggerUrlPattern, requestStage: "Response" }];
    }
    console.log(`[${this.name}] No debugger patterns to return (captureMethod is not 'debugger' or pattern is default/empty).`);
    return []; // Return empty array if not using debugger or pattern not set
  }
}
// Ensure the provider is available on the window for the content script (main.js)
// This registration pattern allows the core extension to find and use this provider.
if (window.providerUtils) {
  const providerInstance = new GenericProvider();
  window.providerUtils.registerProvider(
    providerInstance.name,
    providerInstance.supportedDomains,
    providerInstance // The instance of this provider class
  );
  console.log(`[${providerInstance.name}] Provider registered with providerUtils.`);
} else {
  console.error("GenericProvider: providerUtils not found on window. Registration failed. Ensure main.js (content script) loads first or provides providerUtils.");
}