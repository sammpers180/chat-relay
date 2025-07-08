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
// AI Chat Relay - Gemini Provider

class GeminiProvider {
  constructor() {
    this.name = 'GeminiProvider'; // Updated
    this.supportedDomains = ['gemini.google.com'];

    // --- START OF CONFIGURABLE PROPERTIES (similar to other providers) ---
    this.captureMethod = "dom"; // Switched to DOM capture by default
    // TODO: DEVELOPER ACTION REQUIRED! Verify this URL pattern with Gemini's actual network requests.
    this.debuggerUrlPattern = "*StreamGenerate*"; // Kept for potential future switch
    this.includeThinkingInMessage = false; // Gemini likely doesn't have a separate "thinking" stream like some others.
    // --- END OF CONFIGURABLE PROPERTIES ---

    // Selectors for the Gemini interface
    this.inputSelector = 'div.ql-editor, div[contenteditable="true"], textarea[placeholder="Enter a prompt here"], textarea.message-input, textarea.input-area';
    this.sendButtonSelector = 'button[aria-label="Send message"], button.send-button, button.send-message-button';

    // Response selector - updated to the specific div for DOM capture
    this.responseSelector = 'div.markdown.markdown-main-panel[id^="model-response-message-content"]';
    // Thinking indicator selector - kept as is, assuming these are still relevant
    this.thinkingIndicatorSelector = '.thinking-indicator, .loading-indicator, .typing-indicator, .response-loading, .blue-circle, .stop-icon';

    // Fallback selectors are less relevant now that DOM is primary but kept for completeness
    this.responseSelectorForDOMFallback = 'model-response, message-content, .model-response-text, .markdown-main-panel';
    this.thinkingIndicatorSelectorForDOM = '.thinking-indicator, .loading-indicator, .blue-circle, .stop-icon';

    // Last sent message to avoid capturing it as a response
    this.lastSentMessage = '';
    // Flag to prevent double-sending - IMPORTANT: This must be false by default
    this.hasSentMessage = false;

    // For debugger-based response capture
    this.pendingResponseCallbacks = new Map();
    this.requestAccumulators = new Map(); // To accumulate response chunks for a given request
  }

  // Send a message to the chat interface (MODIFIED)
  async sendChatMessage(text) {
    console.log(`[${this.name}] [${this.captureMethod.toUpperCase()}] sendChatMessage called with:`, text);
    const inputElement = document.querySelector(this.inputSelector);
    const sendButton = document.querySelector(this.sendButtonSelector);

    if (!inputElement || !sendButton) {
      console.error(`[${this.name}] [${this.captureMethod.toUpperCase()}] Missing input field (${this.inputSelector}) or send button (${this.sendButtonSelector})`);
      return false;
    }

    console.log(`[${this.name}] [${this.captureMethod.toUpperCase()}] Attempting to send message with:`, {
        inputFieldInfo: inputElement.outerHTML.substring(0,100),
        sendButtonInfo: sendButton.outerHTML.substring(0,100)
    });

    try {
      this.lastSentMessage = text;
      console.log(`[${this.name}] [${this.captureMethod.toUpperCase()}] Stored last sent message:`, this.lastSentMessage);

      if (inputElement.tagName.toLowerCase() === 'div' && (inputElement.contentEditable === 'true' || inputElement.getAttribute('contenteditable') === 'true')) {
        console.log(`[${this.name}] [${this.captureMethod.toUpperCase()}] Input field is a contentEditable div.`);
        inputElement.focus();
        inputElement.innerHTML = ''; // Clear existing content
        inputElement.textContent = text; // Set the new text content
        inputElement.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        console.log(`[${this.name}] [${this.captureMethod.toUpperCase()}] Set text content and dispatched input event for contentEditable div.`);
      } else { // Standard input or textarea
        console.log(`[${this.name}] [${this.captureMethod.toUpperCase()}] Input field is textarea/input.`);
        inputElement.value = text;
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        inputElement.focus();
        console.log(`[${this.name}] [${this.captureMethod.toUpperCase()}] Set value and dispatched input event for textarea/input.`);
      }

      await new Promise(resolve => setTimeout(resolve, 500)); // Preserved delay

      const isDisabled = sendButton.disabled ||
                        sendButton.getAttribute('aria-disabled') === 'true' ||
                        sendButton.classList.contains('disabled');

      if (!isDisabled) {
        console.log(`[${this.name}] [${this.captureMethod.toUpperCase()}] Clicking send button.`);
        sendButton.click();
        return true;
      } else {
        console.warn(`[${this.name}] [${this.captureMethod.toUpperCase()}] Send button is disabled. Cannot send message.`);
        return false;
      }
    } catch (error) {
      console.error(`[${this.name}] [${this.captureMethod.toUpperCase()}] Error sending message:`, error);
      return false;
    }
  }

  // Capture response from the chat interface (Original logic, logs updated for consistency)
  captureResponse(element) {
    // This method is called when this.captureMethod === "dom"
    // 'element' is expected to be the one matching this.responseSelector
    if (!element) {
      console.log(`[${this.name}] [${this.captureMethod.toUpperCase()}] No element provided to captureResponse (expected match for ${this.responseSelector})`);
      return { found: false, text: '' };
    }

    console.log(`[${this.name}] [${this.captureMethod.toUpperCase()}] Attempting to capture response from Gemini element:`, element.outerHTML.substring(0, 200) + "...");

    let responseText = "";
    let foundResponse = false;

    try {
      // Primarily rely on the textContent of the matched element
      if (element.textContent) {
        responseText = element.textContent.trim();
        console.log(`[${this.name}] [${this.captureMethod.toUpperCase()}] Raw textContent from element (len ${responseText.length}): "${responseText.substring(0, 100)}..."`);

        // Basic validation
        if (responseText &&
            responseText !== this.lastSentMessage &&
            !responseText.toLowerCase().includes("loading") && // Case-insensitive for common words
            !responseText.toLowerCase().includes("thinking") &&
            !responseText.includes("You stopped this response")) {
          
          // HTML entities like < are automatically decoded by textContent
          console.log(`[${this.name}] [${this.captureMethod.toUpperCase()}] Valid response found:`, responseText.substring(0, 100) + (responseText.length > 100 ? "..." : ""));
          foundResponse = true;
        } else {
          if (responseText === this.lastSentMessage) {
            console.log(`[${this.name}] [${this.captureMethod.toUpperCase()}] Text content matches last sent message. Not a new response.`);
          } else {
            console.log(`[${this.name}] [${this.captureMethod.toUpperCase()}] Text content appears to be invalid or loading state: "${responseText.substring(0, 100)}..."`);
          }
          responseText = ""; // Clear if not a valid new response
        }
      } else {
        console.log(`[${this.name}] [${this.captureMethod.toUpperCase()}] Element has no textContent.`);
      }

      // Fallback: if textContent was empty but there are <p> tags inside the matched element.
      if (!foundResponse && responseText === "" && element.querySelectorAll) {
          const paragraphs = element.querySelectorAll('p');
          if (paragraphs && paragraphs.length > 0) {
              console.log(`[${this.name}] [${this.captureMethod.toUpperCase()}] textContent was empty, trying to combine ${paragraphs.length} <p> tags.`);
              let combinedPText = "";
              paragraphs.forEach(p => {
                  combinedPText += p.textContent.trim() + "\n";
              });
              responseText = combinedPText.trim();
              // Re-validate
              if (responseText &&
                  responseText !== this.lastSentMessage &&
                  !responseText.toLowerCase().includes("loading") &&
                  !responseText.toLowerCase().includes("thinking") &&
                  !responseText.includes("You stopped this response")) {
                  console.log(`[${this.name}] [${this.captureMethod.toUpperCase()}] Valid response found from combined <p> tags:`, responseText.substring(0, 100) + (responseText.length > 100 ? "..." : ""));
                  foundResponse = true;
              } else {
                  responseText = ""; // Clear if not valid after combining paragraphs
              }
          }
      }

    } catch (error) {
      console.error(`[${this.name}] [${this.captureMethod.toUpperCase()}] Error capturing response from Gemini:`, error);
    }

    // Final cleanup (mostly for newlines)
    if (foundResponse && responseText) {
      responseText = responseText.replace(/\n{3,}/g, '\n\n').trim();
    }
    
    return {
      found: foundResponse && !!responseText.trim(),
      text: responseText
    };
  }

  // --- START: Methods for Debugger-based Response Capture ---

  initiateResponseCapture(requestId, responseCallback) {
    console.log(`[${this.name}] [${this.captureMethod.toUpperCase()}] initiateResponseCapture called for requestId: ${requestId}. Current provider captureMethod: ${this.captureMethod}`);
    this.pendingResponseCallbacks.set(requestId, responseCallback);
    if (this.captureMethod === "debugger") {
      // Ensure accumulator is ready for this request
      if (!this.requestAccumulators.has(requestId)) {
        this.requestAccumulators.set(requestId, { text: "", isDefinitelyFinal: false });
      }
      console.log(`[${this.name}] [DEBUGGER] Debugger capture selected. Callback stored for requestId: ${requestId}. Ensure background script is set up for '${this.debuggerUrlPattern}'.`);
    } else if (this.captureMethod === "dom") {
      // For DOM method, no specific initiation is needed here as polling is handled by content.js
      console.log(`[${this.name}] [DOM] DOM capture selected. Response will be handled by polling in content.js using captureResponse.`);
    } else {
      console.error(`[${this.name}] [${this.captureMethod.toUpperCase()}] Unknown capture method: ${this.captureMethod}`);
      responseCallback(requestId, `[Error: Unknown capture method '${this.captureMethod}' in provider]`, true);
      this.pendingResponseCallbacks.delete(requestId);
    }
  }

  handleDebuggerData(requestId, rawData, isFinalFromBackground) {
    // This method is only relevant if this.captureMethod === "debugger"
    console.log(`[${this.name}] [DEBUGGER] handleDebuggerData ENTER - requestId: ${requestId}, isFinalFromBackground: ${isFinalFromBackground}, rawData: "${rawData ? rawData.substring(0,100) + "..." : "null/empty"}"`);
    const callback = this.pendingResponseCallbacks.get(requestId);
    if (!callback) {
      console.warn(`[${this.name}] [DEBUGGER] handleDebuggerData - No callback for requestId: ${requestId}.`);
      return;
    }

    let accumulator = this.requestAccumulators.get(requestId);
    if (!accumulator) {
      console.warn(`[${this.name}] [DEBUGGER] handleDebuggerData - No accumulator for requestId: ${requestId}. Initializing.`);
      accumulator = { text: "", isDefinitelyFinal: false };
      this.requestAccumulators.set(requestId, accumulator);
    }

    if (accumulator.isDefinitelyFinal) {
      console.log(`[${this.name}] [DEBUGGER] handleDebuggerData - Accumulator for ${requestId} is already final. Skipping.`);
      return;
    }

    if (rawData && rawData.trim() !== "") {
      const parseOutput = this.parseDebuggerResponse(rawData); // Gemini-specific parsing
      console.log(`[${this.name}] [DEBUGGER] handleDebuggerData - requestId: ${requestId}, parseOutput: ${JSON.stringify(parseOutput)}`);

      if (parseOutput.text !== null) { // Allow empty string if it's a valid part of the response
        accumulator.text = parseOutput.text;    // parseOutput.text is the total text from rawData
      }

      if (parseOutput.isFinalResponse) { // If the parser itself detected a definitive end
        accumulator.isDefinitelyFinal = true;
        console.log(`[${this.name}] [DEBUGGER] handleDebuggerData - ${requestId} marked as definitelyFinal by parseOutput.`);
      }
    }

    const isFinalForCallback = accumulator.isDefinitelyFinal || isFinalFromBackground;

    if (accumulator.text || isFinalForCallback) {
        console.log(`[${this.name}] [DEBUGGER] handleDebuggerData - INVOKING CALLBACK for ${requestId}. Text length: ${accumulator.text.length}, isFinal: ${isFinalForCallback}`);
        callback(requestId, accumulator.text, isFinalForCallback);
    }

    if (isFinalForCallback) {
      console.log(`[${this.name}] [DEBUGGER] handleDebuggerData - CLEANING UP for ${requestId} (isDefinitelyFinal: ${accumulator.isDefinitelyFinal}, isFinalFromBackground: ${isFinalFromBackground}).`);
      this.pendingResponseCallbacks.delete(requestId);
      this.requestAccumulators.delete(requestId);
    }
  }

  // TODO: DEVELOPER ACTION REQUIRED!
  // This is a placeholder parser. You MUST inspect Gemini's actual SSE
  // stream format and update this parser accordingly.
  parseDebuggerResponse(rawDataString) {
    let accumulatedTextFromThisCall = "";
    let isStreamDefinitelyFinished = false;

    console.log(`[${this.name}] [DEBUGGER] parseDebuggerResponse INPUT rawDataString (len ${rawDataString.length}): ${rawDataString.substring(0, 300)}`);

    if (!rawDataString) {
      console.log(`[${this.name}] [DEBUGGER] parseDebuggerResponse: Empty rawDataString received.`);
      return { text: "", isFinalResponse: false };
    }

    let cleanData = rawDataString;
    if (cleanData.startsWith(")]}'")) {
      const firstNewlineIndex = cleanData.indexOf('\n');
      if (firstNewlineIndex !== -1) {
        cleanData = cleanData.substring(firstNewlineIndex + 1);
      } else {
        console.log(`[${this.name}] [DEBUGGER] parseDebuggerResponse: rawDataString starts with )]}' but no newline found.`);
        cleanData = "";
      }
    }
    cleanData = cleanData.trimStart();
    console.log(`[${this.name}] [DEBUGGER] parseDebuggerResponse cleanData after prefix strip (len ${cleanData.length}): ${cleanData.substring(0, 300)}`);

    const chunks = [];
    let currentIndex = 0;
    while (currentIndex < cleanData.length) {
      // Skip leading whitespace/newlines to find the start of a potential length line
      while (currentIndex < cleanData.length && /\s/.test(cleanData.charAt(currentIndex))) {
        currentIndex++;
      }
      if (currentIndex >= cleanData.length) { // Reached end after skipping whitespace
        // console.log(`[${this.name}] Reached end of data after skipping initial whitespace.`);
        break;
      }

      const nextNewline = cleanData.indexOf('\n', currentIndex);
      if (nextNewline === -1) {
        // Last line processing (potential trailing length or garbage)
        const remainingStr = cleanData.substring(currentIndex).trim();
        if (/^\d+$/.test(remainingStr) && chunks.length > 0) {
          // console.log(`[${this.name}] [DEBUGGER] Trailing number found, likely length for a future (missing) chunk: ${remainingStr}`);
        } else if (remainingStr.length > 0 && chunks.length > 0) { // If there's non-numeric trailing data and we have prior chunks, it might be an error or unparseable.
            // console.warn(`[${this.name}] [DEBUGGER] Trailing non-numeric, non-empty data found: ${remainingStr.substring(0,100)}`);
        } else if (remainingStr.length > 0 && chunks.length === 0) { // If it's the *only* data and not a number.
            // console.warn(`[${this.name}] [DEBUGGER] Single line of non-numeric, non-empty data found, cannot parse as chunk: ${remainingStr.substring(0,100)}`);
        }
        break; // End of data or unparseable trailing data
      }

      const lengthLineContent = cleanData.substring(currentIndex, nextNewline).trim();
      let length = NaN;

      if (/^\d+$/.test(lengthLineContent)) { // Check if the line *only* contains digits
        length = parseInt(lengthLineContent, 10);
      }

      // console.log(`[${this.name}] [DEBUGGER] Chunk parsing: Potential lengthLineContent="${lengthLineContent}", parsed length=${length}`);

      if (isNaN(length) || length < 0) { // This will catch non-numeric lines or negative/invalid lengths
        console.warn(`[${this.name}] [DEBUGGER] Invalid, non-positive, or non-numeric length line: "${lengthLineContent}". CurrentIndex: ${currentIndex}. Skipping to next line.`);
        currentIndex = nextNewline + 1; // Advance past the problematic line
        continue; // Restart loop to find next potential length line from the new currentIndex
      }
      
      const jsonStringStart = nextNewline + 1;
      const jsonStringEnd = jsonStringStart + length;

      if (length === 0) {
          // console.log(`[${this.name}] [DEBUGGER] Encountered 0-length chunk at currentIndex ${currentIndex}. Advancing to after its conceptual position.`);
          currentIndex = jsonStringEnd; // This is effectively nextNewline + 1, the start of where the empty JSON "was"
          continue;
      }

      if (jsonStringEnd > cleanData.length) {
        console.warn(`[${this.name}] [DEBUGGER] Declared length ${length} (from line "${lengthLineContent}") exceeds available data. cleanData.length: ${cleanData.length}, required end: ${jsonStringEnd}. Discarding this length and attempting to resynchronize.`);
        currentIndex = nextNewline + 1; // Skip the problematic length line
        continue; // Try to find the next valid length line
      }

      const jsonString = cleanData.substring(jsonStringStart, jsonStringEnd);
      // console.log(`[${this.name}] [DEBUGGER] Extracted jsonString (len ${jsonString.length}, expected ${length}): ${jsonString.substring(0,100)}`);
      
      try {
        JSON.parse(jsonString);
        chunks.push(jsonString);
        currentIndex = jsonStringEnd;
      } catch (parseError) {
        const errorMsg = parseError.message || "";
        const nonWhitespaceMatch = errorMsg.match(/Unexpected non-whitespace character after JSON at position (\d+)/);

        if (nonWhitespaceMatch && nonWhitespaceMatch[1]) {
          const actualEndPositionInJsonString = parseInt(nonWhitespaceMatch[1], 10);
          const validJsonSubstring = jsonString.substring(0, actualEndPositionInJsonString);
          
          try {
            JSON.parse(validJsonSubstring);
            chunks.push(validJsonSubstring);
            currentIndex = jsonStringStart + actualEndPositionInJsonString;
            console.warn(`[${this.name}] [DEBUGGER] Corrected oversized JSON chunk. Original length ${length} (from line "${lengthLineContent}") was too long. Used shorter valid part of length ${actualEndPositionInJsonString}. New currentIndex: ${currentIndex}. Original error: ${parseError.message}`);
          } catch (innerParseError) {
            console.warn(`[${this.name}] [DEBUGGER] Failed to parse even the corrected shorter JSON substring (original length ${length} from line "${lengthLineContent}", attempted correction to ${actualEndPositionInJsonString}). Inner Error: ${innerParseError.message}. JSON hint for corrected: "${validJsonSubstring.substring(0,100)}...". Skipping original length declaration.`);
            currentIndex = nextNewline + 1;
          }
        } else {
          console.warn(`[${this.name}] [DEBUGGER] Failed to parse JSON chunk (length ${length} from line "${lengthLineContent}", Error: ${parseError.message}). This suggests the reported length was incorrect or JSON malformed. JSON hint: "${jsonString.substring(0, 100)}...". Skipping this length declaration and attempting to resynchronize.`);
          currentIndex = nextNewline + 1;
        }
        continue;
      }
    }

    for (const rawChunkJson of chunks) {
      try {
        const chunkJsonToParse = rawChunkJson.trim();
        if (!chunkJsonToParse) {
          continue;
        }
        const outerArray = JSON.parse(chunkJsonToParse);
        if (!Array.isArray(outerArray)) continue;

        for (const item of outerArray) {
          if (Array.isArray(item) && item.length > 0) {
            if (item[0] === "wrb.fr" && item.length >= 3 && typeof item[2] === 'string') {
              const nestedJsonString = item[2];
              try {
                const trimmedNestedJsonString = nestedJsonString.trim();
                if (!trimmedNestedJsonString) {
                  continue;
                }
                const innerData = JSON.parse(trimmedNestedJsonString);
                if (Array.isArray(innerData) && innerData.length > 4 && Array.isArray(innerData[4])) {
                  for (const contentBlock of innerData[4]) {
                    if (Array.isArray(contentBlock) && contentBlock.length >= 2 && typeof contentBlock[0] === 'string' && contentBlock[0].startsWith("rc_") && Array.isArray(contentBlock[1])) {
                      const newText = contentBlock[1].join("");
                      if (newText) {
                        accumulatedTextFromThisCall += newText;
                      }
                    }
                  }
                }
              } catch (e) {
                console.warn(`[${this.name}] [DEBUGGER] Failed to parse nested JSON: "${nestedJsonString.substring(0,100)}...". Error: ${e.message}`);
              }
            } else if (item[0] === "e" && item.length >= 1) {
              isStreamDefinitelyFinished = true;
              console.log(`[${this.name}] [DEBUGGER] End-of-stream marker 'e' detected in chunk: ${JSON.stringify(item)}`);
            }
          }
        }
      } catch (e) {
        console.warn(`[${this.name}] [DEBUGGER] Failed to parse chunk JSON: "${chunkJsonToParse.substring(0,100)}...". Error: ${e.message}`);
      }
    }
    console.log(`[${this.name}] [DEBUGGER] parseDebuggerResponse FINAL output - text length: ${accumulatedTextFromThisCall.length}, accumulatedText: "${accumulatedTextFromThisCall.substring(0,200)}", isFinalByParser: ${isStreamDefinitelyFinished}`);
    
    if (accumulatedTextFromThisCall.includes("\\<") || accumulatedTextFromThisCall.includes("\\>")) {
      console.log(`[${this.name}] [DEBUGGER] Unescaping escaped tool call brackets in final text.`);
      accumulatedTextFromThisCall = accumulatedTextFromThisCall.replace(/\\</g, "<").replace(/\\>/g, ">");
    }

    if (accumulatedTextFromThisCall.includes("\\_")) {
      console.log(`[${this.name}] [DEBUGGER] Unescaping escaped underscores in final text.`);
      accumulatedTextFromThisCall = accumulatedTextFromThisCall.replace(/\\_/g, "_");
    }

    return { text: accumulatedTextFromThisCall, isFinalResponse: isStreamDefinitelyFinished };
  }

  // --- END: Methods for Debugger-based Response Capture ---

  getStreamingApiPatterns() {
    console.log(`[${this.name}] [${this.captureMethod.toUpperCase()}] getStreamingApiPatterns called. Current provider captureMethod: ${this.captureMethod}`);
    if (this.captureMethod === "debugger" && this.debuggerUrlPattern) {
      console.log(`[${this.name}] [DEBUGGER] Using debugger URL pattern: ${this.debuggerUrlPattern}`);
      return [{ urlPattern: this.debuggerUrlPattern, requestStage: "Response" }];
    }
    console.log(`[${this.name}] [${this.captureMethod.toUpperCase()}] No debugger patterns to return (captureMethod is '${this.captureMethod}' or no pattern set).`);
    return [];
  }

  // (NEW) Optional Fallback Methods - these are largely placeholders if debugger is primary
  async captureResponseDOMFallback() {
    console.log(`[${this.name}] captureResponseDOMFallback called. Implement DOM observation logic here if needed as a fallback.`);
    // TODO: Implement or verify existing DOM fallback logic for Gemini if it's to be kept.
    // This method would typically use this.responseSelectorForDOMFallback
    // For example:
    // const responseElements = document.querySelectorAll(this.responseSelectorForDOMFallback);
    // if (responseElements.length > 0) {
    //   const lastResponse = responseElements[responseElements.length - 1];
    //   return lastResponse.textContent.trim();
    // }
    return "Response from DOM fallback (GeminiProvider)"; // Placeholder
  }

  isResponseStillGeneratingForDOM() {
    console.log(`[${this.name}] isResponseStillGeneratingForDOM called. Implement DOM check here.`);
    // TODO: Implement or verify existing DOM check for thinking indicator for Gemini.
    // This method would typically use this.thinkingIndicatorSelectorForDOM
    // const thinkingIndicator = document.querySelector(this.thinkingIndicatorSelectorForDOM);
    // return thinkingIndicator && thinkingIndicator.offsetParent !== null; // Check if visible
    return false; // Placeholder
  }

  // Find a response element in a container (Original logic, logs updated for consistency)
  findResponseElement(container) {
    console.log(`[${this.name}] Finding response element in container:`, container);

    if (container.id && container.id.startsWith("model-response-message-content")) {
      console.log(`[${this.name}] Container is a model-response-message-content element`);
      return container;
    }

    if (container.querySelector) {
      const modelResponseMessage = container.querySelector('div[id^="model-response-message-content"]');
      if (modelResponseMessage) {
        console.log(`[${this.name}] Found model-response-message-content element in container`);
        return modelResponseMessage;
      }
    }

    if (container.classList && container.classList.contains('conversation-container')) {
      console.log(`[${this.name}] Container is a conversation container`);
      const modelResponse = container.querySelector('model-response');
      if (modelResponse) {
        console.log(`[${this.name}] Found model-response in conversation container`);
        const messageContent = modelResponse.querySelector('message-content.model-response-text');
        if (messageContent) {
          console.log(`[${this.name}] Found message-content in model-response`);
          const markdownDiv = messageContent.querySelector('.markdown');
          if (markdownDiv) {
            console.log(`[${this.name}] Found markdown div in message-content`);
            return markdownDiv;
          }
          return messageContent;
        }
        return modelResponse;
      }
    }

    if (container.matches && container.matches(this.responseSelector)) {
      console.log(`[${this.name}] Container itself is a response element`);
      return container;
    }

    if (container.querySelector) {
      const responseElement = container.querySelector(this.responseSelector);
      if (responseElement) {
        console.log(`[${this.name}] Found response element in container`);
        return responseElement;
      }
    }

    if (container.tagName && container.tagName.toLowerCase() === 'p') {
      console.log(`[${this.name}] Container is a paragraph`);
      const isUserQuery = container.closest('.user-query-container, .user-query-bubble-container');
      if (!isUserQuery) {
        console.log(`[${this.name}] Paragraph is not inside a user-query, returning it`);
        return container;
      } else {
        console.log(`[${this.name}] Paragraph is inside a user-query`);
      }
    }

    console.log(`[${this.name}] No response element found in container`);
    return null;
  }

  // Check if we should skip response monitoring
  shouldSkipResponseMonitoring() {
    // If using debugger, we skip DOM-based monitoring.
    // console.log(`[${this.name}] shouldSkipResponseMonitoring called. Capture method: ${this.captureMethod}`);
    return this.captureMethod === "debugger";
  }
}

// Ensure this runs after the class definition (NEW REGISTRATION)
(function() {
    if (window.providerUtils) {
        const providerInstance = new GeminiProvider();
        window.providerUtils.registerProvider(providerInstance.name, providerInstance.supportedDomains, providerInstance);
    } else {
        console.error("ProviderUtils not found. GeminiProvider cannot be registered.");
    }
})();