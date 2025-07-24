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
// AI Chat Relay - WebSocket Proxy

(function() {
  if (window.chatRelayProxyInitialized) {
    console.log('[WebSocket Proxy] Already initialized. Skipping.');
    return;
  }
  window.chatRelayProxyInitialized = true;
  if (window.chatRelayProxyInitialized) {
    console.log('[WebSocket Proxy] Already initialized. Skipping.');
    return;
  }
  window.chatRelayProxyInitialized = true;
  console.log('[WebSocket Proxy] Initializing...');
  const nativeWebSocket = window.WebSocket;
  let currentRequestId = null;

  // Listen for the requestId from the content script
  window.addEventListener('chatRelay-setWebsocketRequestId', (event) => {
    if (event.detail && event.detail.requestId) {
      currentRequestId = event.detail.requestId;
      console.log('[WebSocket Proxy] Received and set requestId:', currentRequestId);
    }
  });

  window.WebSocket = function(...args) {
    const socket = new nativeWebSocket(...args);
    const [url] = args;
    const LOG_PREFIX = '[WebSocket Proxy]';

    if (url.includes('chatgpt.com/backend-api/conversation')) {
      console.log(LOG_PREFIX, 'Proxying WebSocket for URL:', url);

      const originalAddEventListener = socket.addEventListener;
      let messageListeners = [];

      // Proxy addEventListener
      socket.addEventListener = function(type, listener, options) {
        if (type === 'message') {
          console.log(LOG_PREFIX, 'Intercepted an "addEventListener" for "message". Storing listener instead of attaching.');
          messageListeners.push(listener);
          return;
        }
        return originalAddEventListener.call(this, type, listener, options);
      };

      // Proxy onmessage setter
      let originalOnMessage = null;
      Object.defineProperty(socket, 'onmessage', {
        get: () => originalOnMessage,
        set: (listener) => {
          console.log(LOG_PREFIX, 'Intercepted an "onmessage" assignment. Storing listener.');
          originalOnMessage = listener;
        },
        configurable: true
      });

      // Attach OUR SINGLE listener to the native socket
      originalAddEventListener.call(socket, 'message', (event) => {
        if (currentRequestId === null) {
          console.warn(LOG_PREFIX, 'Intercepted a message, but currentRequestId is null. The message will be dropped.');
          return;
        }
        console.log(LOG_PREFIX, `Native message event fired for requestId ${currentRequestId}. Sending to background script.`);
        chrome.runtime.sendMessage({
          type: 'WEBSOCKET_MESSAGE',
          requestId: currentRequestId,
          data: event.data
        }).catch(err => {
            console.error(LOG_PREFIX, "Error sending message to background:", err);
        });
        // IMPORTANT: We DO NOT call the original listeners.
      });
    }

    return socket;
  };

  // Copy static properties from the native WebSocket to our proxy
  Object.keys(nativeWebSocket).forEach(key => {
    if (key in window.WebSocket) return;
    window.WebSocket[key] = nativeWebSocket[key];
  });

  console.log('[WebSocket Proxy] Initialization complete.');
  // Announce that the proxy is ready
  window.dispatchEvent(new CustomEvent('chatRelay-proxyReady'));
})();