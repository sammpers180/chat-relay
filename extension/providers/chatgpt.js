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
// AI Chat Relay - ChatGPT Provider

class ChatGptProvider {
  constructor() {
    // --- START OF CONFIGURABLE PROPERTIES ---
    this.captureMethod = "debugger"; // Default value
    this.debuggerUrlPattern = "*chatgpt.com/backend-api/conversation*";
    this.includeThinkingInMessage = true;
    // --- END OF CONFIGURABLE PROPERTIES ---
    this.name = "ChatGptProvider";
    this.supportedDomains = ["chatgpt.com"];
    this.inputSelector = '#prompt-textarea';
    this.sendButtonSelector = 'button[data-testid="send-button"]'; // Use data-testid
    this.responseSelector = '.message-bubble .text-content';
    this.thinkingIndicatorSelector = '.loading-spinner';
    this.responseSelectorForDOMFallback = '.message-container .response-text';
    this.thinkingIndicatorSelectorForDOM = '.thinking-dots, .spinner-animation';
    this.lastSentMessage = '';
    this.pendingResponseCallbacks = new Map();
    this.requestAccumulators = new Map();
    this.domMonitorTimer = null;

    // This is now an async constructor, which is not ideal but necessary here.
    // The registration in the main script will need to handle the promise.
    return (async () => {
      await this._loadSettings();
      console.log(`[${this.name}] Provider initialized for domains: ${this.supportedDomains.join(', ')}`);
      return this;
    })();
  }

  _loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get({ chatGptCaptureMethod: 'debugger' }, (items) => {
        this.captureMethod = items.chatGptCaptureMethod;
        console.log(`[${this.name}] Capture method set to: ${this.captureMethod}`);
        resolve();
      });
    });
  }

  async sendChatMessage(messageContent, requestId) { // Changed parameter name
    console.log(`[${this.name}] sendChatMessage called for requestId ${requestId} with content type:`, typeof messageContent, Array.isArray(messageContent) ? `Array length: ${messageContent.length}` : '');
    const MAX_RETRIES = 5;
    const RETRY_DELAY_MS_BASE = 250;

    // --- 1. Find and check the input field ---
    const inputField = document.querySelector(this.inputSelector);
    if (!inputField) {
      console.error(`[${this.name}] Input field (selector: ${this.inputSelector}) not found for requestId ${requestId}.`);
      this._reportSendError(requestId, `Input field not found: ${this.inputSelector}`);
      return false;
    }
    if (inputField.disabled || inputField.hasAttribute('disabled')) {
      console.warn(`[${this.name}] Input field (selector: ${this.inputSelector}) is disabled for requestId ${requestId}.`);
      this._reportSendError(requestId, `Input field is disabled: ${this.inputSelector}`);
      return false;
    }

    // --- 2. Prepare and set content ONCE ---
    try {
      let textToInput = "";
      let blobToPaste = null;
      let blobMimeType = "image/png"; // Default

      if (typeof messageContent === 'string') {
        textToInput = messageContent;
        this.lastSentMessage = textToInput;
        console.log(`[${this.name}] Handling string content for requestId ${requestId}:`, textToInput.substring(0, 70) + "...");
      } else if (messageContent instanceof Blob) {
        blobToPaste = messageContent;
        blobMimeType = messageContent.type || blobMimeType;
        this.lastSentMessage = `Blob data (type: ${blobMimeType}, size: ${blobToPaste.size}) for requestId ${requestId}`;
        console.log(`[${this.name}] Handling Blob content for requestId ${requestId}. Size: ${blobToPaste.size}, Type: ${blobMimeType}`);
      } else if (Array.isArray(messageContent)) {
        console.log(`[${this.name}] Handling array content for requestId ${requestId}.`);
        for (const part of messageContent) {
          if (part.type === "text" && typeof part.text === 'string') {
            textToInput += (textToInput ? "\n" : "") + part.text;
          } else if (part.type === "image_url" && part.image_url && typeof part.image_url.url === 'string') {
            if (!blobToPaste) { // Prioritize the first image
              try {
                const response = await fetch(part.image_url.url);
                blobToPaste = await response.blob();
                blobMimeType = blobToPaste.type || blobMimeType;
                console.log(`[${this.name}] Fetched image_url as Blob for requestId ${requestId}. Size: ${blobToPaste.size}, Type: ${blobMimeType}`);
              } catch (e) {
                console.error(`[${this.name}] Error fetching image_url ${part.image_url.url} for requestId ${requestId}:`, e);
                // Optionally report error and return false if image is critical
              }
            } else {
              console.warn(`[${this.name}] Multiple image_urls found for requestId ${requestId}, only the first will be processed.`);
            }
          }
        }
        this.lastSentMessage = `Array content (Text: "${textToInput.substring(0,50)}...", Image: ${blobToPaste ? 'Yes' : 'No'}) for requestId ${requestId}`;
      } else {
        console.error(`[${this.name}] Unhandled message content type: ${typeof messageContent} for requestId ${requestId}. Cannot send.`);
        this.lastSentMessage = `Unhandled data type: ${typeof messageContent}`;
        this._reportSendError(requestId, `Unhandled message content type: ${typeof messageContent}`);
        return false;
      }

      // Set text input if any
      if (textToInput) {
        inputField.innerText = textToInput; // Use .innerText for contenteditable div
        console.log(`[${this.name}] Set inputField.innerText for requestId ${requestId}.`);
      } else {
        inputField.innerText = ""; // Clear if only image or no text
        console.log(`[${this.name}] Cleared inputField.innerText (no text part) for requestId ${requestId}.`);
      }
      inputField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      
      // Paste blob if any
      if (blobToPaste) {
        const dataTransfer = new DataTransfer();
        const file = new File([blobToPaste], "pasted_image." + (blobMimeType.split('/')[1] || 'png'), { type: blobMimeType });
        dataTransfer.items.add(file);
        const pasteEvent = new ClipboardEvent('paste', {
          clipboardData: dataTransfer,
          bubbles: true,
          cancelable: true
        });
        inputField.dispatchEvent(pasteEvent);
        console.log(`[${this.name}] Dispatched paste event with Blob data for requestId ${requestId}.`);
      }

      inputField.focus();
      await new Promise(resolve => setTimeout(resolve, 750)); // Delay for UI to update after content set

    } catch (error) {
      console.error(`[${this.name}] Error during content preparation for requestId ${requestId}:`, error);
      this._reportSendError(requestId, `Exception during content preparation: ${error.message}`);
      return false;
    }

    // --- 3. Retry loop for finding and clicking the send button ---
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const currentDelay = RETRY_DELAY_MS_BASE + (attempt * 100);
      if (attempt > 0) await new Promise(resolve => setTimeout(resolve, currentDelay)); // No delay on first attempt of this loop

      try {
        const sendButton = document.querySelector(this.sendButtonSelector);
        if (!sendButton) {
          console.error(`[${this.name}] Send button (selector: ${this.sendButtonSelector}) not found on attempt ${attempt + 1} for requestId ${requestId}.`);
          if (attempt === MAX_RETRIES - 1) {
            this._reportSendError(requestId, `Send button not found: ${this.sendButtonSelector}`);
            return false;
          }
          continue;
        }

        const isDisabled = sendButton.disabled ||
                           sendButton.hasAttribute('disabled') ||
                           sendButton.getAttribute('aria-disabled') === 'true' ||
                           sendButton.classList.contains('disabled');

        console.log(`[${this.name}] Attempt ${attempt + 1} for requestId ${requestId} (Send Button Loop): Selector: '${this.sendButtonSelector}', Found: ${!!sendButton}, Disabled: ${isDisabled}, aria-disabled: ${sendButton.getAttribute('aria-disabled')}`);

        if (!isDisabled) {
          console.log(`[${this.name}] Clicking send button (selector: ${this.sendButtonSelector}) on attempt ${attempt + 1} for requestId ${requestId}.`);
          sendButton.click();
          console.log(`[${this.name}] Send button clicked for requestId ${requestId}. Returning true.`);
          return true;
        } else {
          console.warn(`[${this.name}] Send button (selector: ${this.sendButtonSelector}) is disabled on attempt ${attempt + 1} for requestId ${requestId}.`);
          
          // If button is disabled, try to trigger UI updates that might enable it
          // These events are on inputField as they might influence the button's state
          inputField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
          inputField.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
          inputField.focus(); // Re-focus input field
          await new Promise(resolve => setTimeout(resolve, 50)); // Short delay

          if (attempt === MAX_RETRIES - 1) {
            console.error(`[${this.name}] Send button still disabled on final attempt for requestId ${requestId}. Selectors: Input='${this.inputSelector}', Button='${this.sendButtonSelector}'.`);
            this._reportSendError(requestId, `Send button remained disabled after ${MAX_RETRIES} attempts: ${this.sendButtonSelector}`);
            return false;
          }
        }
      } catch (error) {
        console.error(`[${this.name}] Error during send button click attempt ${attempt + 1} for requestId ${requestId}:`, error);
        if (attempt === MAX_RETRIES - 1) {
          this._reportSendError(requestId, `Exception during send button click: ${error.message}`);
          return false;
        }
        // Continue to next attempt if error is not on the last attempt
      }
    }
    this._reportSendError(requestId, `Exhausted all retries for sendChatMessage (send button loop) for requestId ${requestId}.`);
    return false;
  }

  _reportSendError(requestId, errorMessage) {
      console.error(`[${this.name}] Reporting send error for requestId ${requestId}: ${errorMessage}`);
      const callback = this.pendingResponseCallbacks.get(requestId);
      if (callback) {
          callback(requestId, `[PROVIDER_SEND_ERROR: ${errorMessage}]`, true); 
          this.pendingResponseCallbacks.delete(requestId);
          this.requestAccumulators.delete(requestId); 
      } else {
          console.warn(`[${this.name}] No callback found to report send error for requestId ${requestId}.`);
      }
  }

  initiateResponseCapture(requestId, responseCallback) {
    console.log(`[${this.name}] initiateResponseCapture called for requestId: ${requestId}. Capture method: ${this.captureMethod}`);
    this.pendingResponseCallbacks.set(requestId, responseCallback);
    if (this.captureMethod === "websocket") {
      console.log(`[${this.name}] WebSocket capture selected. Storing callback and waiting for proxy to be ready for requestId: ${requestId}.`);
      
      // Wait for the proxy to announce it's ready, then send the requestId
      const sendRequestId = () => {
        console.log(`[${this.name}] Proxy is ready. Sending requestId ${requestId}.`);
        const event = new CustomEvent('chatRelay-setWebsocketRequestId', { detail: { requestId } });
        window.dispatchEvent(event);
      };

      // The proxy might already be ready, so we check for a flag or just try to send.
      // A more robust way is to listen for the ready signal.
      window.addEventListener('chatRelay-proxyReady', sendRequestId, { once: true });
    } else if (this.captureMethod === "debugger") {
      console.log(`[${this.name}] Debugger capture selected. Callback stored for requestId: ${requestId}. Ensure background script is set up for '${this.debuggerUrlPattern}'.`);
    } else if (this.captureMethod === "dom") {
      console.log(`[${this.name}] DOM capture selected. Starting DOM monitoring for requestId: ${requestId}`);
      this._stopDOMMonitoring();
      this._startDOMMonitoring(requestId);
    } else {
      console.error(`[${this.name}] Unknown capture method: ${this.captureMethod}`);
      responseCallback(requestId, `[Error: Unknown capture method '${this.captureMethod}' in provider]`, true);
      this.pendingResponseCallbacks.delete(requestId);
    }
  }

  handleDebuggerData(requestId, rawData, isFinalFromBackground) {
    console.log(`[${this.name}] handleDebuggerData ENTER - requestId: ${requestId}, isFinalFromBackground: ${isFinalFromBackground}, rawData: "${rawData ? rawData.substring(0,150) + (rawData.length > 150 ? "..." : "") : "null/empty"}"`);
    const callback = this.pendingResponseCallbacks.get(requestId);
    if (!callback) {
      console.warn(`[${this.name}] handleDebuggerData - No callback for requestId: ${requestId}. RawData: ${rawData ? rawData.substring(0,50) : "null"}`);
      return;
    }
    let accumulator = this.requestAccumulators.get(requestId);
    if (!accumulator) {
      accumulator = { text: "", isDefinitelyFinal: false, currentProcessingStage: undefined }; // Initialize stage
      this.requestAccumulators.set(requestId, accumulator);
      console.log(`[${this.name}] handleDebuggerData - Initialized new accumulator for ${requestId}: ${JSON.stringify(accumulator)}`);
    }
    console.log(`[${this.name}] handleDebuggerData - Accumulator state for ${requestId} BEFORE processing: ${JSON.stringify(accumulator)}`);

    if (accumulator.isDefinitelyFinal) {
      console.log(`[${this.name}] handleDebuggerData - Accumulator for ${requestId} is already final. Skipping.`);
      return;
    }

    if (rawData && rawData.trim() !== "") {
      let isLikelyNonChatJson = false;
      if (!rawData.includes("data:") && rawData.trim().startsWith("{") && rawData.trim().endsWith("}")) {
          try {
              const jsonData = JSON.parse(rawData);
              if (typeof jsonData.safe === 'boolean' && typeof jsonData.blocked === 'boolean') {
                  isLikelyNonChatJson = true;
                  console.log(`[${this.name}] handleDebuggerData - Detected likely non-chat JSON for ${requestId}, skipping parse.`);
              }
          } catch (e) { /* Not simple JSON */ }
      }

      if (isLikelyNonChatJson) {
        // Ignore
      } else {
          const parseOutput = this.parseDebuggerResponse(rawData, accumulator.currentProcessingStage);
          accumulator.currentProcessingStage = parseOutput.newProcessingStage; // Update stage
          console.log(`[${this.name}] handleDebuggerData - requestId: ${requestId}, parseOutput: ${JSON.stringify(parseOutput)}`);
          
          if (parseOutput.text !== null || parseOutput.operation === "replace") { // Check for null explicitly if empty string is valid
              if (parseOutput.operation === "replace") {
                  console.log(`[${this.name}] handleDebuggerData - Operation: replace. Old text for ${requestId}: "${accumulator.text.substring(0,50)}...". New text: "${parseOutput.text ? parseOutput.text.substring(0,50) : "null"}..."`);
                  accumulator.text = parseOutput.text;
              } else { // append
                  console.log(`[${this.name}] handleDebuggerData - Operation: append. Current text for ${requestId}: "${accumulator.text.substring(0,50)}...". Appending: "${parseOutput.text ? parseOutput.text.substring(0,50) : "null"}..."`);
                  accumulator.text += parseOutput.text;
              }
          }
          console.log(`[${this.name}] handleDebuggerData - Accumulator text for ${requestId} AFTER update: "${accumulator.text.substring(0,100)}..."`);

          if (parseOutput.isFinalResponse) {
              accumulator.isDefinitelyFinal = true;
              console.log(`[${this.name}] handleDebuggerData - ${requestId} marked as definitelyFinal by parseOutput.`);
          }
          
          // Invoke callback if there's new text, or if it's final, or if it was a replace operation (even with empty string)
          if (parseOutput.text !== null || accumulator.isDefinitelyFinal || parseOutput.operation === "replace") {
            console.log(`[${this.name}] handleDebuggerData - INVOKING CALLBACK for ${requestId}. Text: "${accumulator.text.substring(0,100)}...", isFinal: ${accumulator.isDefinitelyFinal}, Stage: ${accumulator.currentProcessingStage}`);
            callback(requestId, accumulator.text, accumulator.isDefinitelyFinal);
          }
      }
    } else {
      if (isFinalFromBackground && !accumulator.isDefinitelyFinal) {
          accumulator.isDefinitelyFinal = true;
          console.log(`[${this.name}] handleDebuggerData - RawData empty, but isFinalFromBackground=true. INVOKING CALLBACK for ${requestId}. Text: "${accumulator.text.substring(0,100)}...", isFinal: true (forced)`);
          callback(requestId, accumulator.text, accumulator.isDefinitelyFinal);
      }
    }

    if (accumulator.isDefinitelyFinal) {
      console.log(`[${this.name}] handleDebuggerData - CLEANING UP for ${requestId} as accumulator.isDefinitelyFinal is true.`);
      this.pendingResponseCallbacks.delete(requestId);
      this.requestAccumulators.delete(requestId);
    }
  }

  handleWebSocketData(requestId, rawData) {
    const callback = this.pendingResponseCallbacks.get(requestId);
    if (!callback) {
      console.warn(`[${this.name}] handleWebSocketData - No callback for requestId: ${requestId}.`);
      return;
    }

    let accumulator = this.requestAccumulators.get(requestId);
    if (!accumulator) {
      accumulator = { text: "", isDefinitelyFinal: false, currentProcessingStage: undefined };
      this.requestAccumulators.set(requestId, accumulator);
    }

    if (accumulator.isDefinitelyFinal) {
      return;
    }

    const parseOutput = this.parseDebuggerResponse(rawData, accumulator.currentProcessingStage);
    accumulator.currentProcessingStage = parseOutput.newProcessingStage;

    if (parseOutput.text !== null || parseOutput.operation === "replace") {
      if (parseOutput.operation === "replace") {
        accumulator.text = parseOutput.text;
      } else {
        accumulator.text += parseOutput.text;
      }
    }

    if (parseOutput.isFinalResponse) {
      accumulator.isDefinitelyFinal = true;
    }

    if (parseOutput.text !== null || accumulator.isDefinitelyFinal || parseOutput.operation === "replace") {
      callback(requestId, accumulator.text, accumulator.isDefinitelyFinal);
    }

    if (accumulator.isDefinitelyFinal) {
      this.pendingResponseCallbacks.delete(requestId);
      this.requestAccumulators.delete(requestId);
    }
  }

  // Parses the raw response from the debugger.
  // Returns an object: { text: "content_from_this_chunk", isFinalResponse: boolean, operation: "replace" | "append", newProcessingStage: string }
  parseDebuggerResponse(rawDataString, currentProcessingStage) {
    let textForThisChunk = null; // Use null to distinguish from empty string if needed
    let isFinalResponse = false;
    let chunkOverallOperation = "append"; // Default to append
    let newProcessingStage = currentProcessingStage;

    console.log(`[${this.name}] parseDebuggerResponse ENTER. currentProcessingStage: ${currentProcessingStage}, includeThinking: ${this.includeThinkingInMessage}, rawDataString: "${rawDataString ? rawDataString.substring(0,100) + "..." : "null"}"`);

    if (rawDataString === null || typeof rawDataString === 'undefined' || rawDataString.trim() === "") {
      return { text: null, isFinalResponse: false, operation: "append", newProcessingStage };
    }

    // Skip non-SSE JSON like {"safe": true, "blocked": false}
    if (!rawDataString.includes("data:") && rawDataString.trim().startsWith("{") && rawDataString.trim().endsWith("}")) {
      try {
        const jsonData = JSON.parse(rawDataString);
        if (typeof jsonData.safe === 'boolean' && typeof jsonData.blocked === 'boolean') {
          console.log(`[${this.name}] parseDebuggerResponse - Skipping non-chat JSON: ${rawDataString.substring(0,50)}`);
          return { text: null, isFinalResponse: false, operation: "append", newProcessingStage };
        }
      } catch (e) { /* Fall through, might be a malformed SSE line or other JSON */ }
    }

    const lines = rawDataString.split('\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const dataJson = line.substring(6).trim();
        if (dataJson === '[DONE]') {
          isFinalResponse = true;
          console.log(`[${this.name}] parseDebuggerResponse - Encountered [DONE]`);
          break;
        }
        if (dataJson === "") continue;

        try {
          const data = JSON.parse(dataJson);
          console.log(`[${this.name}] parseDebuggerResponse - Processing SSE data: ${JSON.stringify(data).substring(0,150)}...`);
          let currentLineText = "";
          let currentLineIsReplaceOperation = false; // Indicates if this specific line's content should replace prior content *within this chunk*
          
          let messageNode = data.message;
          if (data.p === "" && data.o === "add" && data.v && data.v.message) {
            messageNode = data.v.message;
          }

          let contentType = null;
          if (messageNode && messageNode.content && messageNode.content.content_type) {
            contentType = messageNode.content.content_type;
          }
          console.log(`[${this.name}] parseDebuggerResponse - Identified contentType: ${contentType}, currentProcessingStage: ${newProcessingStage}`);

          // --- Stage and Text Extraction Logic ---
          if (this.includeThinkingInMessage) {
            // --- INCLUDE THINKING: Extract text from thoughts and content ---
            if (contentType === "thoughts") {
              if (newProcessingStage !== "processing_thoughts") {
                chunkOverallOperation = "replace"; // Replace previous stage's content
                textForThisChunk = ""; // Start fresh for this chunk
              }
              newProcessingStage = "processing_thoughts";
              if (messageNode.content.thoughts && Array.isArray(messageNode.content.thoughts)) {
                messageNode.content.thoughts.forEach(thought => {
                  if (thought.summary) currentLineText += thought.summary + "\n";
                  if (thought.content) currentLineText += thought.content + "\n";
                });
              }
              console.log(`[${this.name}] parseDebuggerResponse (Thinking TRUE) - THOUGHTS: "${currentLineText.substring(0,50)}..."`);
            } else if (contentType === "reasoning_recap") {
              if (newProcessingStage === "processing_thoughts") {
                newProcessingStage = "awaiting_content"; // Thoughts ended, expecting content
              }
              // No text from recap itself
              console.log(`[${this.name}] parseDebuggerResponse (Thinking TRUE) - REASONING_RECAP. New stage: ${newProcessingStage}`);
            } else if (contentType === "text") {
              if (newProcessingStage !== "processing_content") {
                chunkOverallOperation = "replace"; // Replace previous stage's content
                textForThisChunk = ""; // Start fresh for this chunk
              }
              newProcessingStage = "processing_content";
              if (messageNode.content.parts && messageNode.content.parts.length > 0 && typeof messageNode.content.parts[0] === 'string') {
                currentLineText = messageNode.content.parts[0];
                currentLineIsReplaceOperation = true; // A full text part replaces
              }
              console.log(`[${this.name}] parseDebuggerResponse (Thinking TRUE) - TEXT: "${currentLineText.substring(0,50)}..."`);
            }
          } else {
            // --- INCLUDE THINKING FALSE: Skip thoughts, only process text ---
            if (contentType === "thoughts") {
              newProcessingStage = "processing_thoughts";
              textForThisChunk = ""; // Ensure no text from thoughts is carried
              chunkOverallOperation = "replace"; // Next "text" content should replace this empty string
              console.log(`[${this.name}] parseDebuggerResponse (Thinking FALSE) - SKIPPING THOUGHTS. Stage: ${newProcessingStage}. Chunk op: ${chunkOverallOperation}`);
              // Check for finality even in thoughts
               if (messageNode && messageNode.status === "finished_successfully" && messageNode.end_turn === true) isFinalResponse = true;
              continue;
            } else if (contentType === "reasoning_recap") {
              if (newProcessingStage === "processing_thoughts") {
                newProcessingStage = "awaiting_content";
              }
              console.log(`[${this.name}] parseDebuggerResponse (Thinking FALSE) - SKIPPING REASONING_RECAP. Stage: ${newProcessingStage}`);
               if (messageNode && messageNode.status === "finished_successfully" && messageNode.end_turn === true) isFinalResponse = true;
              continue;
            } else if (contentType === "text") {
              if (newProcessingStage === "processing_thoughts" || newProcessingStage === "awaiting_content" || newProcessingStage === undefined) {
                chunkOverallOperation = "replace"; // This is the first actual content, replace anything prior (e.g. empty from thoughts)
                textForThisChunk = ""; // Ensure we start fresh for this chunk if replacing
              }
              newProcessingStage = "processing_content";
              if (messageNode.content.parts && messageNode.content.parts.length > 0 && typeof messageNode.content.parts[0] === 'string') {
                currentLineText = messageNode.content.parts[0];
                currentLineIsReplaceOperation = true; // A full text part
              }
              console.log(`[${this.name}] parseDebuggerResponse (Thinking FALSE) - TEXT: "${currentLineText.substring(0,50)}...". Stage: ${newProcessingStage}. Chunk op: ${chunkOverallOperation}`);
            }
          }

          // JSON Patch operations (apply to both includeThinking true/false if it's for content parts)
          if (data.p === "" && data.o === "patch" && Array.isArray(data.v)) {
            for (const patch of data.v) {
              if (patch.p === "/message/content/parts/0" && typeof patch.v === 'string') {
                 // If we are not including thinking, and we haven't hit a "text" content type yet, this patch might be the first "text"
                if (!this.includeThinkingInMessage && newProcessingStage !== "processing_content") {
                    if (newProcessingStage === "processing_thoughts" || newProcessingStage === "awaiting_content" || newProcessingStage === undefined) {
                        chunkOverallOperation = "replace";
                        textForThisChunk = ""; // Start fresh
                    }
                    newProcessingStage = "processing_content"; // Patches to content/parts/0 mean we are in content
                    console.log(`[${this.name}] parseDebuggerResponse - Patch to content/parts/0, transitioning to 'processing_content'. Chunk op: ${chunkOverallOperation}`);
                }
                // If including thinking, and current stage is not content, this patch might be the first content
                else if (this.includeThinkingInMessage && newProcessingStage !== "processing_content") {
                    chunkOverallOperation = "replace"; // Replace thoughts
                    textForThisChunk = ""; // Start fresh
                    newProcessingStage = "processing_content";
                    console.log(`[${this.name}] parseDebuggerResponse (Thinking TRUE) - Patch to content/parts/0, transitioning to 'processing_content'. Chunk op: ${chunkOverallOperation}`);
                }


                if (patch.o === "append") {
                  currentLineText += patch.v;
                  currentLineIsReplaceOperation = false; // Append to current line's text
                } else if (patch.o === "replace") {
                  currentLineText = patch.v;
                  currentLineIsReplaceOperation = true; // Replace current line's text
                }
                 console.log(`[${this.name}] parseDebuggerResponse - Patch applied. currentLineText: "${currentLineText.substring(0,50)}...", currentLineIsReplaceOp: ${currentLineIsReplaceOperation}`);
              }
              // Finality from patch metadata
              if ((patch.p === "/message/metadata/finish_details/type" && patch.v === "stop") ||
                  (patch.p === "/message/metadata/finish_reason" && patch.v === "stop") ||
                  (patch.p === "/message/status" && patch.v === "finished_successfully")) {
                isFinalResponse = true;
              }
            }
          }
          // Direct operations on content parts (e.g., from o3 model logs)
          else if (data.p === "/message/content/parts/0" && typeof data.v === 'string' && (this.includeThinkingInMessage || newProcessingStage === "processing_content" || newProcessingStage === undefined)) {
             if (!this.includeThinkingInMessage && newProcessingStage !== "processing_content") {
                if (newProcessingStage === "processing_thoughts" || newProcessingStage === "awaiting_content" || newProcessingStage === undefined) {
                    chunkOverallOperation = "replace";
                    textForThisChunk = "";
                }
                newProcessingStage = "processing_content";
             } else if (this.includeThinkingInMessage && newProcessingStage !== "processing_content") {
                chunkOverallOperation = "replace";
                textForThisChunk = "";
                newProcessingStage = "processing_content";
             }

            if (data.o === "replace") {
              currentLineText = data.v;
              currentLineIsReplaceOperation = true;
            } else if (data.o === "append") {
              currentLineText = data.v;
              currentLineIsReplaceOperation = false;
            }
            console.log(`[${this.name}] parseDebuggerResponse - Direct op on content/parts/0. currentLineText: "${currentLineText.substring(0,50)}...", currentLineIsReplaceOp: ${currentLineIsReplaceOperation}`);
          }
          // Simple delta format (e.g., data: {"v": " some text"}) - common in 4o
          else if (typeof data.v === 'string' && data.p === undefined && data.o === undefined && !contentType) {
            // This is likely a text delta if no specific content_type was identified yet.
            // Treat as content if we are not explicitly in 'thoughts' when includeThinkingInMessage is false.
            if (!this.includeThinkingInMessage && newProcessingStage !== "processing_content") {
                if (newProcessingStage === "processing_thoughts" || newProcessingStage === "awaiting_content" || newProcessingStage === undefined) {
                    chunkOverallOperation = "replace";
                    textForThisChunk = "";
                }
                newProcessingStage = "processing_content";
            } else if (this.includeThinkingInMessage && newProcessingStage !== "processing_content" && newProcessingStage !== "processing_thoughts") {
                // If including thinking, but not in thoughts or content, this is likely start of content
                chunkOverallOperation = "replace";
                textForThisChunk = "";
                newProcessingStage = "processing_content";
            }
            currentLineText = data.v;
            currentLineIsReplaceOperation = false; // Assume append for simple deltas unless it's the first part of content
            console.log(`[${this.name}] parseDebuggerResponse - Simple delta {"v": ...}. currentLineText: "${currentLineText.substring(0,50)}..."`);
          }
          // Fallback for OpenAI standard delta (choices...delta.content)
          else if (data.choices && data.choices[0] && data.choices[0].delta && typeof data.choices[0].delta.content === 'string') {
             if (!this.includeThinkingInMessage && newProcessingStage !== "processing_content") {
                if (newProcessingStage === "processing_thoughts" || newProcessingStage === "awaiting_content" || newProcessingStage === undefined) {
                    chunkOverallOperation = "replace";
                    textForThisChunk = "";
                }
                newProcessingStage = "processing_content";
            } else if (this.includeThinkingInMessage && newProcessingStage !== "processing_content" && newProcessingStage !== "processing_thoughts") {
                chunkOverallOperation = "replace";
                textForThisChunk = "";
                newProcessingStage = "processing_content";
            }
            currentLineText = data.choices[0].delta.content;
            currentLineIsReplaceOperation = false;
            console.log(`[${this.name}] parseDebuggerResponse - OpenAI delta. currentLineText: "${currentLineText.substring(0,50)}..."`);
          }

          // Accumulate text for this chunk based on operations
          if (currentLineText) {
            if (textForThisChunk === null) textForThisChunk = ""; // Initialize if null

            if (currentLineIsReplaceOperation) { // If this line's content is a replacement for the chunk
              textForThisChunk = currentLineText;
              // If this is the first text part of the chunk, and we decided the chunk should replace, it's already set.
              // If not, this specific line replaces previous lines *within this chunk*.
            } else {
              textForThisChunk += currentLineText;
            }
          }
          console.log(`[${this.name}] parseDebuggerResponse - After line processing. textForThisChunk: "${textForThisChunk ? textForThisChunk.substring(0,70) : "null"}...", chunkOverallOperation: ${chunkOverallOperation}`);

          // General finality checks
          if (messageNode) {
            if (messageNode.metadata && messageNode.metadata.finish_details && messageNode.metadata.finish_details.type === "stop") isFinalResponse = true;
            if (messageNode.status === "finished_successfully" && messageNode.end_turn === true) isFinalResponse = true;
          }
          if (data.choices && data.choices[0] && data.choices[0].finish_reason === 'stop') isFinalResponse = true;

        } catch (e) { console.warn(`[${this.name}] parseDebuggerResponse - Error parsing dataJson from line: '${line}'. dataJson: '${dataJson}'. Error:`, e); }
      } else if (line.trim() === "" || line.startsWith("event:") || line.startsWith("id:")) {
        continue;
      } else if (line.trim()) { console.warn(`[${this.name}] parseDebuggerResponse - Unexpected non-data SSE line: ${line}`); }
    }
    console.log(`[${this.name}] parseDebuggerResponse FINISHING. Returning: text: "${textForThisChunk ? textForThisChunk.substring(0,100) + "..." : "null"}", isFinal: ${isFinalResponse}, operation: "${chunkOverallOperation}", newStage: ${newProcessingStage}`);
    return { text: textForThisChunk, isFinalResponse: isFinalResponse, operation: chunkOverallOperation, newProcessingStage };
  }

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
            return (answerText || "").trim();
        }
    }
    return (answerText || "").trim(); 
  }

  _captureResponseDOM(element = null) {
    if (!element && this.captureMethod === "dom") {
        const elements = document.querySelectorAll(this.responseSelector);
        if (elements.length > 0) {
            element = elements[elements.length - 1];
        }
    }
    if (!element) {
        return { text: null, isStillGenerating: false };
    }
    let responseText = element.innerText || element.textContent || "";
    if (this.lastSentMessage && responseText.trim().startsWith(this.lastSentMessage.trim())) {
        const potentialActualResponse = responseText.substring(this.lastSentMessage.length).trim();
        if (potentialActualResponse === "") {
            return { text: null, isStillGenerating: this._isResponseStillGeneratingDOM() };
        }
    }
    const isStillGenerating = this._isResponseStillGeneratingDOM();
    if (responseText && responseText.trim() !== "" && responseText.trim() !== this.lastSentMessage.trim()) {
        return {
            text: this.formatOutput("", responseText), 
            isStillGenerating: isStillGenerating
        };
    }
    return { text: null, isStillGenerating: isStillGenerating };
  }

  _isResponseStillGeneratingDOM() {
    if (this.thinkingIndicatorSelector && document.querySelector(this.thinkingIndicatorSelector)) {
        return true;
    }
    if (this.thinkingIndicatorSelectorForDOM && document.querySelector(this.thinkingIndicatorSelectorForDOM)) {
        return true;
    }
    return false; 
  }

  _startDOMMonitoring(requestId) {
    console.log(`[${this.name}] Starting DOM monitoring for requestId: ${requestId}. Interval: 500ms.`);
    let lastCapturedText = "";
    let lastCheckTime = Date.now();
    let noChangeStreak = 0;
    const monitor = () => {
        const callback = this.pendingResponseCallbacks.get(requestId);
        if (!callback) {
            console.log(`[${this.name}] DOM monitor: Callback for ${requestId} no longer exists. Stopping.`);
            this._stopDOMMonitoring();
            return;
        }
        const captureResult = this._captureResponseDOM();
        const currentText = captureResult.text;
        const isStillGenerating = captureResult.isStillGenerating;
        let isFinalDOMResponse = false;
        if (currentText && currentText !== lastCapturedText) {
            console.log(`[${this.name}] DOM monitor (ReqID: ${requestId}): New content detected. Length: ${currentText.length}. Last length: ${lastCapturedText.length}. Still generating: ${isStillGenerating}`);
            lastCapturedText = currentText;
            noChangeStreak = 0; 
            callback(requestId, currentText, false); 
        } else if (currentText && currentText === lastCapturedText) {
            noChangeStreak++;
        } else if (!currentText) {
            noChangeStreak++;
        }
        const STABILITY_CHECKS = 4; 
        if (!isStillGenerating && noChangeStreak >= STABILITY_CHECKS && lastCapturedText.trim() !== "") {
            console.log(`[${this.name}] DOM monitor (ReqID: ${requestId}): Response appears stable and complete. No generating indicator, and ${noChangeStreak} unchanged checks.`);
            isFinalDOMResponse = true;
        }
        const MAX_WAIT_AFTER_NO_GENERATING = 5000; 
        if (!isStillGenerating && lastCapturedText.trim() !== "" && (Date.now() - lastCheckTime > MAX_WAIT_AFTER_NO_GENERATING) && noChangeStreak > 0) {
            console.log(`[${this.name}] DOM monitor (ReqID: ${requestId}): Max wait time reached after no 'generating' signal. Assuming final.`);
            isFinalDOMResponse = true;
        }
        if (isFinalDOMResponse) {
            console.log(`[${this.name}] DOM monitor (ReqID: ${requestId}): Sending final response. Text length: ${lastCapturedText.length}`);
            callback(requestId, lastCapturedText, true);
            this.pendingResponseCallbacks.delete(requestId);
            this._stopDOMMonitoring();
        } else {
            lastCheckTime = Date.now(); 
            this.domMonitorTimer = setTimeout(monitor, 500); 
        }
    };
    this.domMonitorTimer = setTimeout(monitor, 100); 
  }

  _stopDOMMonitoring() {
    if (this.domMonitorTimer) {
      clearTimeout(this.domMonitorTimer);
      this.domMonitorTimer = null;
      console.log(`[${this.name}] DOM monitoring stopped.`);
    }
  }

  shouldSkipResponseMonitoring(inputText) {
    return false; 
  }

  getStreamingApiPatterns() {
    if (this.captureMethod === "debugger") {
      return [
        { urlPattern: "*chatgpt.com/backend-api/conversation*", requestStage: "Response" },
        { urlPattern: "*chatgpt.com/backend-api/f/conversation*", requestStage: "Response" }
      ];
    }
    // For websocket method, we don't need to return any patterns as we are not using the debugger.
    return [];
  }

  stopStreaming(requestId) {
    console.log(`[${this.name}] stopStreaming called for requestId: ${requestId}`);
    const callback = this.pendingResponseCallbacks.get(requestId);
    const accumulator = this.requestAccumulators.get(requestId);
    let lastKnownText = "";

    if (accumulator && typeof accumulator.text === 'string') {
      lastKnownText = accumulator.text;
    }

    if (callback) {
      // Send one final message indicating it was stopped, using the last known accumulated text.
      console.log(`[${this.name}] stopStreaming - Invoking callback for ${requestId} with final=true and STREAM_STOPPED_BY_USER. Last text: "${lastKnownText.substring(0,50)}..."`);
      callback(requestId, `${lastKnownText}[STREAM_STOPPED_BY_USER]`, true);
    } else {
      console.warn(`[${this.name}] stopStreaming - No pending callback found for requestId: ${requestId} when attempting to stop.`);
    }

    // Clean up
    if (this.pendingResponseCallbacks.has(requestId)) {
      this.pendingResponseCallbacks.delete(requestId);
      console.log(`[${this.name}] stopStreaming - Deleted pendingResponseCallback for ${requestId}.`);
    }
    if (this.requestAccumulators.has(requestId)) {
      this.requestAccumulators.delete(requestId);
      console.log(`[${this.name}] stopStreaming - Deleted requestAccumulator for ${requestId}.`);
    }

    // If DOM monitoring was active for this request (though less likely if debugger is primary)
    if (this.domMonitorTimer && this.captureMethod === "dom") { // Check if this request was the one being monitored
        // This is a bit tricky as domMonitorTimer isn't directly tied to a requestId in its current form.
        // For now, we'll assume a general stop might also stop DOM monitoring if it was the active one.
        // A more robust solution would tie DOM monitor to a specific requestId.
        // For debugger method, this part is less relevant.
        console.log(`[${this.name}] stopStreaming - Stopping DOM monitoring if it was active (relevant for DOM capture method).`);
        this._stopDOMMonitoring();
    }
    console.log(`[${this.name}] stopStreaming - Cleanup complete for requestId: ${requestId}.`);
  }
}

if (window.providerUtils && window.providerUtils.registerProvider) {
  new ChatGptProvider().then(providerInstance => {
    window.providerUtils.registerProvider(
      providerInstance.name,
      providerInstance.supportedDomains,
      providerInstance
    );
    console.log(`[${providerInstance.name}] Provider registered with providerUtils.`);
  });
} else {
  console.error("[ChatGptProvider] providerUtils not found. Registration failed. Ensure provider-utils.js is loaded before chatgpt.js");
}
