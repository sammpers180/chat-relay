# Chat Relay MCP

A system that allows AI assistants to interact with web-based chat applications through WebSockets.

## Overview

This project consists of two main components:

1. **MCP Server**: A Node.js server that provides tools and resources for AI assistants to send and receive WebSocket messages
2. **Browser Extension**: A Chrome/Edge extension that intercepts WebSocket communications on web pages and relays them to the MCP server

## Architecture

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│             │         │             │         │             │
│  Web Page   │◄────────│  Browser    │◄────────│  MCP Server │◄────┐
│  WebSocket  │         │  Extension  │         │  WebSocket  │     │
│             │         │             │         │  Bridge     │     │
└─────────────┘         └─────────────┘         └─────────────┘     │
                                                       ▲            │
                                                       │            │
                                                       ▼            │
                                                ┌─────────────┐     │
                                                │             │     │
                                                │  MCP Tools  │     │
                                                │  Resources  │     │
                                                │             │     │
                                                └─────────────┘     │
                                                       ▲            │
                                                       │            │
                                                       ▼            │
                                                ┌─────────────┐     │
                                                │             │     │
                                                │     AI      │─────┘
                                                │  Assistant  │
                                                │             │
                                                └─────────────┘
```

## Setup and Usage

### MCP Server

1. Install dependencies:
   ```
   npm install
   ```

2. Build the server:
   ```
   npm run build
   ```

3. Run the server:
   ```
   node dist/index.js
   ```

The server will start with:
- MCP server using stdio transport for AI assistant communication
- WebSocket bridge server on port 8081 for extension communication

### Browser Extension

1. Navigate to `chrome://extensions` or `edge://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `extension` directory
4. The extension is now ready to use

### Using with AI Assistants

AI assistants can use the following MCP tools and resources:

- **send_websocket_message**: Sends a message to the web page's WebSocket
  ```
  tool use chat-relay-mcp.send_websocket_message message="Your message here"
  ```

- **websocket_messages**: Retrieves messages received from the web page
  ```
  tool use chat-relay-mcp.websocket_messages
  ```

## Development

- MCP server code is in the `src` directory
- Browser extension code is in the `extension` directory
- The WebSocket bridge runs on port 8081

## Security Considerations

- The browser extension has access to all WebSocket communications on websites you visit
- Only use the extension when needed and disable it when not in use
- The MCP server should only be run on trusted networks