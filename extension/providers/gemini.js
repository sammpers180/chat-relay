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

    // Selectors for the Gemini interface
    this.inputSelector = 'div.ql-editor, div[contenteditable="true"], textarea[placeholder="Enter a prompt here"], textarea.message-input, textarea.input-area';
    this.sendButtonSelector = 'button[aria-label="Send message"], button.send-button, button.send-message-button';

    // Response selector - updated to match the actual elements
    this.responseSelector = 'model-response, message-content, .model-response-text, .markdown-main-panel, .model-response, div[id^="model-response-message"]';
    // Thinking indicator selector
    this.thinkingIndicatorSelector = '.thinking-indicator, .loading-indicator, .typing-indicator, .response-loading, .blue-circle, .stop-icon';

    // Fallback selectors (NEW)
    this.responseSelectorForDOMFallback = 'model-response, message-content, .model-response-text, .markdown-main-panel'; // Placeholder
    this.thinkingIndicatorSelectorForDOM = '.thinking-indicator, .loading-indicator, .blue-circle, .stop-icon'; // Placeholder

    // Last sent message to avoid capturing it as a response
    this.lastSentMessage = '';
    // Flag to prevent double-sending - IMPORTANT: This must be false by default
    this.hasSentMessage = false;
  }

  // Send a message to the chat interface (MODIFIED)
  async sendChatMessage(text) {
    console.log(`[${this.name}] sendChatMessage called with:`, text);
    const inputElement = document.querySelector(this.inputSelector);
    const sendButton = document.querySelector(this.sendButtonSelector);

    if (!inputElement || !sendButton) {
      console.error(`[${this.name}] Missing input field (${this.inputSelector}) or send button (${this.sendButtonSelector})`);
      return false;
    }

    console.log(`[${this.name}] Attempting to send message with:`, {
        inputFieldInfo: inputElement.outerHTML.substring(0,100),
        sendButtonInfo: sendButton.outerHTML.substring(0,100)
    });

    try {
      this.lastSentMessage = text;
      console.log(`[${this.name}] Stored last sent message:`, this.lastSentMessage);

      if (inputElement.tagName.toLowerCase() === 'div' && (inputElement.contentEditable === 'true' || inputElement.getAttribute('contenteditable') === 'true')) {
        console.log(`[${this.name}] Input field is a contentEditable div.`);
        inputElement.focus();
        inputElement.innerHTML = ''; // Clear existing content
        inputElement.textContent = text; // Set the new text content
        inputElement.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        console.log(`[${this.name}] Set text content and dispatched input event for contentEditable div.`);
      } else { // Standard input or textarea
        console.log(`[${this.name}] Input field is textarea/input.`);
        inputElement.value = text;
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        inputElement.focus();
        console.log(`[${this.name}] Set value and dispatched input event for textarea/input.`);
      }

      await new Promise(resolve => setTimeout(resolve, 500)); // Preserved delay

      const isDisabled = sendButton.disabled ||
                        sendButton.getAttribute('aria-disabled') === 'true' ||
                        sendButton.classList.contains('disabled');

      if (!isDisabled) {
        console.log(`[${this.name}] Clicking send button.`);
        sendButton.click();
        return true;
      } else {
        console.warn(`[${this.name}] Send button is disabled. Cannot send message.`);
        return false;
      }
    } catch (error) {
      console.error(`[${this.name}] Error sending message:`, error);
      return false;
    }
  }

  // Capture response from the chat interface (Original logic, logs updated for consistency)
  captureResponse(element) {
    if (!element) {
      console.log(`[${this.name}] No element provided to captureResponse`);
      return { found: false, text: '' };
    }

    console.log(`[${this.name}] Attempting to capture response from Gemini:`, element);

    let responseText = "";
    let foundResponse = false;

    try {
      console.log(`[${this.name}] Looking for response in various elements...`);

      if (element.textContent) {
        console.log(`[${this.name}] Element has text content`);
        responseText = element.textContent.trim();

        if (responseText &&
            responseText !== this.lastSentMessage &&
            !responseText.includes("Loading") &&
            !responseText.includes("Thinking") &&
            !responseText.includes("You stopped this response")) {
          console.log(`[${this.name}] Found response in element:`, responseText.substring(0, 50) + (responseText.length > 50 ? "..." : ""));
          foundResponse = true;
        } else {
          console.log(`[${this.name}] Element text appears to be invalid:`, responseText.substring(0, 50) + (responseText.length > 50 ? "..." : ""));
        }
      } else {
        console.log(`[${this.name}] Element has no text content`);
      }

      console.log(`[${this.name}] Trying to find the most recent conversation container...`);

      const conversationContainers = document.querySelectorAll('.conversation-container');
      if (conversationContainers && conversationContainers.length > 0) {
        console.log(`[${this.name}] Found ${conversationContainers.length} conversation containers`);
        const lastContainer = conversationContainers[conversationContainers.length - 1];
        console.log(`[${this.name}] Last container ID:`, lastContainer.id);

        const userQuery = lastContainer.querySelector('.user-query-container');
        const userText = userQuery ? userQuery.textContent.trim() : '';

        if (userText === this.lastSentMessage) {
          console.log(`[${this.name}] Found container with our last sent message, looking for response`);
        }

        const modelResponse = lastContainer.querySelector('model-response');
        if (modelResponse) {
          console.log(`[${this.name}] Found model-response in last conversation container`);
          const messageContent = modelResponse.querySelector('message-content.model-response-text');
          if (messageContent) {
            console.log(`[${this.name}] Found message-content in model-response`);
            const markdownDiv = messageContent.querySelector('.markdown');
            if (markdownDiv) {
              console.log(`[${this.name}] Found markdown div in message-content`);
              const text = markdownDiv.textContent.trim();
              if (text &&
                  text !== this.lastSentMessage &&
                  !text.includes("Loading") &&
                  !text.includes("Thinking") &&
                  !text.includes("You stopped this response")) {
                responseText = text;
                console.log(`[${this.name}] Found response in markdown div:`, responseText.substring(0, 50) + (responseText.length > 50 ? "..." : ""));
                foundResponse = true;
              }
            }
          }
        }
      } else {
        console.log(`[${this.name}] No conversation containers found`);
      }

      if (!foundResponse) {
        console.log(`[${this.name}] Trying to find model-response-message-content elements...`);
        const responseMessages = document.querySelectorAll('div[id^="model-response-message-content"]');
        if (responseMessages && responseMessages.length > 0) {
          console.log(`[${this.name}] Found ${responseMessages.length} model-response-message-content elements`);
          const sortedMessages = Array.from(responseMessages).sort((a, b) => {
            return a.id.localeCompare(b.id);
          });
          const responseMessage = sortedMessages[sortedMessages.length - 1];
          console.log(`[${this.name}] Last response message ID:`, responseMessage.id);
          const text = responseMessage.textContent.trim();
          if (text &&
              text !== this.lastSentMessage &&
              !text.includes("Loading") &&
              !text.includes("Thinking") &&
              !text.includes("You stopped this response")) {
            responseText = text;
            console.log(`[${this.name}] Found response in model-response-message:`, responseText.substring(0, 50) + (responseText.length > 50 ? "..." : ""));
            foundResponse = true;
          }
        } else {
          console.log(`[${this.name}] No model-response-message-content elements found`);
        }
      }

      if (!foundResponse) {
        console.log(`[${this.name}] Trying to find message-content elements...`);
        const messageContents = document.querySelectorAll('message-content.model-response-text');
        if (messageContents && messageContents.length > 0) {
          console.log(`[${this.name}] Found ${messageContents.length} message-content elements`);
          const sortedContents = Array.from(messageContents).sort((a, b) => {
            return (a.id || '').localeCompare(b.id || '');
          });
          const lastMessageContent = sortedContents[sortedContents.length - 1];
          console.log(`[${this.name}] Last message content ID:`, lastMessageContent.id || 'no-id');
          const markdownDiv = lastMessageContent.querySelector('.markdown');
          if (markdownDiv) {
            console.log(`[${this.name}] Found markdown div`);
            const paragraphs = markdownDiv.querySelectorAll('p');
            if (paragraphs && paragraphs.length > 0) {
              console.log(`[${this.name}] Found ${paragraphs.length} paragraphs in markdown div`);
              let combinedText = "";
              paragraphs.forEach((p, index) => {
                const text = p.textContent.trim();
                console.log(`[${this.name}] Paragraph ${index} text:`, text.substring(0, 30) + (text.length > 30 ? "..." : ""));
                if (text &&
                    text !== this.lastSentMessage &&
                    !text.includes("Loading") &&
                    !text.includes("Thinking") &&
                    !text.includes("You stopped this response")) {
                  combinedText += text + "\n";
                }
              });
              if (combinedText.trim()) {
                responseText = combinedText.trim();
                console.log(`[${this.name}] Found response in paragraphs:`, responseText.substring(0, 50) + (responseText.length > 50 ? "..." : ""));
                foundResponse = true;
              } else {
                console.log(`[${this.name}] No valid text found in paragraphs`);
              }
            } else {
              console.log(`[${this.name}] No paragraphs found in markdown div`);
              const text = markdownDiv.textContent.trim();
              if (text &&
                  text !== this.lastSentMessage &&
                  !text.includes("Loading") &&
                  !text.includes("Thinking") &&
                  !text.includes("You stopped this response")) {
                responseText = text;
                console.log(`[${this.name}] Found response in markdown div:`, responseText.substring(0, 50) + (responseText.length > 50 ? "..." : ""));
                foundResponse = true;
              } else {
                console.log(`[${this.name}] Markdown div text appears to be invalid:`, text.substring(0, 50) + (text.length > 50 ? "..." : ""));
              }
            }
          } else {
            console.log(`[${this.name}] No markdown div found in message-content`);
            const text = lastMessageContent.textContent.trim();
            if (text &&
                text !== this.lastSentMessage &&
                !text.includes("Loading") &&
                !text.includes("Thinking") &&
                !text.includes("You stopped this response")) {
              responseText = text;
              console.log(`[${this.name}] Found response in message-content:`, responseText.substring(0, 50) + (responseText.length > 50 ? "..." : ""));
              foundResponse = true;
            } else {
              console.log(`[${this.name}] Message-content text appears to be invalid:`, text.substring(0, 50) + (text.length > 50 ? "..." : ""));
            }
          }
        } else {
          console.log(`[${this.name}] No message-content elements found`);
        }
      }

      if (!foundResponse) {
        console.log(`[${this.name}] Trying to find paragraphs in the document...`);
        const paragraphs = document.querySelectorAll('p');
        if (paragraphs && paragraphs.length > 0) {
          console.log(`[${this.name}] Found ${paragraphs.length} paragraphs`);
          let combinedText = "";
          for (let i = paragraphs.length - 1; i >= 0; i--) {
            const paragraph = paragraphs[i];
            const text = paragraph.textContent.trim();
            const isUserQuery = paragraph.closest('.user-query-container, .user-query-bubble-container');
            if (isUserQuery) {
              continue;
            }
            if (text &&
                text !== this.lastSentMessage &&
                !text.includes("Loading") &&
                !text.includes("Thinking") &&
                !text.includes("You stopped this response")) {
              combinedText = text + "\n" + combinedText;
              if (text.startsWith("Hello") || text.includes("I'm doing") || text.includes("How can I assist")) {
                break;
              }
            }
          }
          if (combinedText.trim()) {
            responseText = combinedText.trim();
            console.log(`[${this.name}] Found response in paragraphs:`, responseText.substring(0, 50) + (responseText.length > 50 ? "..." : ""));
            foundResponse = true;
          } else {
            console.log(`[${this.name}] No valid text found in paragraphs`);
          }
        } else {
          console.log(`[${this.name}] No paragraphs found`);
        }
      }

      if (!foundResponse) {
        console.log(`[${this.name}] Response not found yet, will try again in the next polling cycle`);
      }
    } catch (error) {
      console.error(`[${this.name}] Error capturing response from Gemini:`, error);
    }

    if (foundResponse && responseText) {
      console.log(`[${this.name}] Cleaning up response text...`);
      responseText = responseText.trim()
        .replace(/^(Loading|Thinking).*/gim, '')
        .replace(/You stopped this response.*/gim, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      console.log(`[${this.name}] Cleaned response text:`, responseText.substring(0, 50) + (responseText.length > 50 ? "..." : ""));
    }

    return {
      found: foundResponse && !!responseText.trim(),
      text: responseText
    };
  }

  // (NEW) Method for streaming API patterns
  getStreamingApiPatterns() {
    console.log(`[${this.name}] getStreamingApiPatterns called`);
    // TODO: DEVELOPER ACTION REQUIRED!
    // Use browser Network DevTools on gemini.google.com to identify the
    // exact URL(s) that deliver the AI's streaming response when a prompt is sent.
    // Replace the placeholder pattern below with the correct one(s).
    // Example: return [{ urlPattern: "*://gemini.google.com/api/generate*", requestStage: "Response" }];
    return [
        { urlPattern: "*://gemini.google.com/api/stream/generateContent*", requestStage: "Response" } // Placeholder - VERIFY THIS!
    ];
  }

  // (NEW) Optional Fallback Methods
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

  // Check if we should skip response monitoring (Original - UNCHANGED)
  shouldSkipResponseMonitoring() {
    // We want to monitor for responses now that we've fixed the response capturing
    return false;
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