# ChatGPT WebSocket Capture Implementation Plan

This document outlines the plan to implement WebSocket-based response capture for the ChatGPT provider in the Chat Relay browser extension.

## 1. Project Goals

- Implement a new method for capturing ChatGPT responses using WebSockets, as an alternative to the current debugger-based approach.
- Allow users to configure the capture method (debugger or WebSocket) on a per-provider basis through the extension's UI.
- Ensure the new WebSocket method supports streaming responses back to the API relay server in an OpenAI-compatible format.
- Refactor the existing `ChatGptProvider` to be modular and easily support both capture methods.

## 2. Technical Plan

The implementation will be broken down into the following steps:

1.  **Analyze `extension/manifest.json` and `extension/background.js`**: Determine the best approach for injecting a new content script that will proxy the `window.WebSocket` object.

2.  **Create a WebSocket Proxy Content Script**: This script will be responsible for:
    - Replacing the page's native `WebSocket` object with a proxy.
    - Intercepting calls to the `WebSocket` constructor to identify the connection to ChatGPT's backend.
    - Listening for `onmessage` events on the proxied WebSocket to capture incoming data.

3.  **Forward Captured Data**: The content script will forward the captured WebSocket messages to the background script for processing by the `ChatGptProvider`.

4.  **Add Configuration UI**: A new section will be added to the extension's options page to allow users to select the desired capture method for each provider that supports multiple methods.

5.  **Refactor `ChatGptProvider`**: The provider will be updated to:
    - Read the configured capture method.
    - Dynamically switch between the existing debugger-based logic and the new WebSocket-based logic.
    - Process the incoming WebSocket data stream and send it back to the API relay server in chunks to support streaming.

6.  **Testing**: Both the new WebSocket method and the existing debugger method will be thoroughly tested to ensure they function correctly and that the configuration UI works as expected.