# Decision Log
This file records significant architectural decisions, their rationale, and implications for the Chat Relay project.
---
**`[YYYY-MM-DD]` - Initial System Architecture: Three-Component Design**
-   **Decision**: The system will be composed of three main components:
    1.  An OpenAI-Compatible API Server ([`api-relay-server/`](api-relay-server/)).
    2.  A Browser Extension ([`extension/`](extension/)).
    3.  An optional MCP (Model Context Protocol) Server ([`mcp-server/`](mcp-server/)).
-   **Rationale**:
    *   Decouples the client application (e.g., Cline/RooCode) from the complexities of web browser automation.
    *   Provides a standardized API interface for clients.
    *   Allows the browser extension to focus solely on interacting with specific chat UIs.
    *   The MCP server offers extendability for developer tools without impacting core relay functionality.
-   **Alternatives Considered**:
    *   *Monolithic Application*: Combining server and extension logic would reduce flexibility and make supporting multiple chat UIs more complex.
    *   *Direct Client-to-Browser Automation*: Could be less secure and require significant client-side complexity for each supported browser/UI.
-   **Implications**: Requires managing inter-component communication (HTTP for client-server, WebSockets for server-extension).
---
**`[YYYY-MM-DD]` - API Standard: OpenAI Compatibility**
-   **Decision**: The API Relay Server will expose an OpenAI-compatible endpoint (specifically `/v1/chat/completions`).
-   **Rationale**:
    *   Ensures seamless integration with existing AI development tools like Cline/RooCode that already support the OpenAI API format.
    *   Lowers the barrier to adoption for users familiar with this standard.
    *   Standardizes the data format for requests and responses.
-   **Alternatives Considered**:
    *   *Custom API*: Would require bespoke client integrations for each application using the relay, increasing development overhead.
-   **Implications**: The server must accurately mimic the expected request/response structure of the OpenAI API.
---
**`[YYYY-MM-DD]` - Server-Extension Communication: WebSockets**
-   **Decision**: Communication between the API Relay Server and the Browser Extension will be handled via WebSockets.
-   **Rationale**:
    *   Provides persistent, bidirectional, and real-time communication, essential for promptly relaying chat messages and responses.
    *   More efficient than HTTP polling for this use case.
-   **Alternatives Considered**:
    *   *HTTP Long Polling/Polling*: Would introduce higher latency and be less efficient for frequent message exchange.
    *   *Server-Sent Events (SSE)*: Suitable for server-to-client streaming, but WebSockets offer better bidirectional capabilities needed here.
-   **Implications**: Requires careful management of WebSocket connection states, heartbeats (ping/pong), and potential reconnections on both server and extension sides.
---
**`[YYYY-MM-DD]` - Browser Extension Technology Stack**
-   **Decision**:
    *   Adhere to Chrome Extension Manifest V3 standards.
    *   Utilize a Service Worker ([`extension/background.js`](extension/background.js)) for background processing and WebSocket management.
    *   Employ Content Scripts (e.g., [`extension/content.js`](extension/content.js)) for DOM manipulation and interaction with chat interface pages.
-   **Rationale**:
    *   Manifest V3 is the current standard for Chrome extensions, offering improved security and performance.
    *   Service workers are the standard for background tasks in Manifest V3.
    *   Content scripts are necessary for direct interaction with web page content.
-   **Implications**: Development must follow Manifest V3 guidelines and lifecycle.
---
**`[YYYY-MM-DD]` - Extension Modularity: Provider-Based Architecture**
-   **Decision**: The browser extension will use a modular "provider" architecture to handle interactions with different chat UIs. Each supported chat interface (e.g., Gemini, ChatGPT, AI Studio) will have its own provider script (e.g., [`extension/providers/chatgpt.js`](extension/providers/chatgpt.js)).
-   **Rationale**:
    *   Simplifies adding support for new chat interfaces by encapsulating UI-specific logic within individual provider modules.
    *   Improves code organization and maintainability within the extension.
    *   Allows for shared utilities via scripts like [`extension/providers/provider-utils.js`](extension/providers/provider-utils.js).
-   **Alternatives Considered**:
    *   *Single Large Content Script*: Would become unwieldy and difficult to manage as support for more UIs is added. Conditional logic for different UIs would make the code complex.
-   **Implications**: Requires a clear interface or convention for providers to adhere to.
---
**`[YYYY-MM-DD]` - Chat Response Capture Mechanism**
-   **Decision**: Primarily rely on DOM manipulation and potentially debugger APIs (as suggested in [`README.md`](README.md)) for injecting messages and capturing responses from chat web UIs.
-   **Rationale**:
    *   Direct interaction with the DOM is often the only way to automate web UIs that do not provide external APIs for message exchange.
    *   Debugger APIs (if used) can offer more robust ways to intercept data or events.
-   **Alternatives Considered**:
    *   *Optical Character Recognition (OCR)*: Too complex, slow, and error-prone for real-time chat.
    *   *Network Request Sniffing*: May be blocked by HTTPS, difficult to parse consistently, or violate terms of service.
-   **Implications**: Capture logic is highly dependent on the specific DOM structure of each chat UI and can be brittle if UIs change frequently. Requires careful selector management and robust error handling.
---
**`[YYYY-MM-DD]` - MCP Server Role: Optional Developer Utility**
-   **Decision**: The MCP Server ([`mcp-server/`](mcp-server/)) will be an optional component, primarily serving as a developer utility.
-   **Rationale**:
    *   The core functionality of relaying chat messages does not depend on the MCP server.
    *   Keeps the primary system simpler for end-users who may not need developer tools.
    *   Provides valuable tools for testing, simulation, and debugging during development or for advanced users.
-   **Implications**: Documentation should clearly state its optional nature. The main system should function correctly without it.
---
**`2025-05-09` - Single Active Request Processing by Extension**
-   **Decision**: The API Relay Server will enforce that only one message/request is actively being processed by the connected browser extension at any given time.
-   **Rationale**: To prevent race conditions within the browser extension, ensure reliable association of responses to requests, and avoid overloading the extension or the target chat UI. This simplifies state management in the extension.
-   **Implementation Details**: A state variable `activeExtensionProcessingId` in [`api-relay-server/src/server.ts`](api-relay-server/src/server.ts) tracks the `requestId` of the job currently with the extension.
-   **Implications**: Necessitates a strategy for handling concurrent incoming requests when the extension is busy.
---
**`2025-05-09` - Configurable Behavior for Busy Extension (Queue/Drop)**
-   **Decision**: When the browser extension is busy, the API Relay Server's behavior for new incoming requests will be configurable: either 'queue' or 'drop'.
-   **Rationale**:
    *   'Queue': Ensures all requests are eventually processed, suitable for non-interactive or batch tasks.
    *   'Drop': Provides immediate feedback (429 error) for interactive tasks, preventing long client wait times or large queue build-ups. Offers users control based on their needs.
-   **Implementation Details**:
    *   A global variable `newRequestBehavior: 'queue' | 'drop'` in [`api-relay-server/src/server.ts`](api-relay-server/src/server.ts).
    *   An in-memory `requestQueue: QueuedRequest[]` to hold requests when behavior is 'queue'.
    *   Logic within the `/v1/chat/completions` endpoint to check `activeExtensionProcessingId` and `newRequestBehavior`.
-   **Alternatives Considered**:
    *   *Always Queue*: Simpler, but could lead to very long wait times for clients if the queue grows large.
    *   *Always Drop*: Simpler, but might lose important non-interactive requests.
-   **Implications**: The chosen behavior directly impacts client experience and system throughput under load.
---
**`2025-05-09` - Configuration Mechanism for Request Handling Behavior**
-   **Decision**: The `newRequestBehavior` setting, along with existing settings like `port` and `requestTimeoutMs`, will be configurable via:
    1.  A `server-config.json` file (stored in `api-relay-server/dist/`).
    2.  An Admin Web UI served by the API Relay Server.
-   **Rationale**:
    *   `server-config.json` allows for persistent configuration across server restarts.
    *   The Admin UI provides a user-friendly interface for viewing and modifying these settings without direct file manipulation, making it more accessible.
    *   Changes to `newRequestBehavior` and `requestTimeoutMs` via the Admin UI are effective immediately. Port changes require a restart.
-   **Implementation Details**:
    *   Updates to `loadServerConfig()` and `saveServerConfig()` in [`api-relay-server/src/server.ts`](api-relay-server/src/server.ts).
    *   Enhancements to `/v1/admin/server-info` and `/v1/admin/update-settings` API endpoints.
    *   UI elements (radio buttons for `newRequestBehavior`) and corresponding JavaScript logic in [`api-relay-server/src/admin-ui/admin.html`](api-relay-server/src/admin-ui/admin.html).
-   **Implications**: Adds complexity to the server for handling configuration loading, saving, and UI interaction, but significantly improves usability and control.
---
**`2025-05-09` - In-Memory Request Queue**
-   **Decision**: The request queue for the 'queue' behavior will be implemented as an in-memory array within the API Relay Server.
-   **Rationale**:
    *   Sufficient for the current expected load and use case of the system.
    *   Simplifies the implementation by avoiding external dependencies (e.g., Redis, RabbitMQ) for queuing, which would be overkill.
-   **Alternatives Considered**:
    *   *Persistent Queue (e.g., Redis-backed)*: Would provide durability across server restarts but adds operational complexity and dependencies not justified at this stage.
-   **Implications**: Queued requests are volatile and will be lost if the API Relay Server restarts. The queue size is limited by available server memory.
---
**`2025-05-09` - Deferred HTTP Response for Queued Requests**
-   **Decision**: When a request is added to the queue, its corresponding HTTP response to the client (e.g., Cline/RooCode) will be deferred. The response will only be sent once the request is dequeued, processed by the browser extension, and a result (or error/timeout) is obtained.
-   **Rationale**: This approach maintains the synchronous-like interaction model expected by clients using an OpenAI-compatible API. The client sends one request and waits for one eventual response, abstracting the queuing mechanism.
-   **Implementation Details**: The Express `res` (response) object is stored as part of the `QueuedRequest` object in the `requestQueue`. When `processRequest` handles a dequeued item, it uses this stored `res` object to send the final HTTP response.
-   **Implications**: Client connections will be held open longer for queued requests. Requires careful management of the `res` object to ensure it's not prematurely closed or written to.
---
**`2025-05-10` - Claude Provider Debugger URL Pattern Confirmation**
-   **Decision**: Confirmed that `debuggerUrlPattern: "*/completion*"` in `extension/providers/claude.js` is the correct pattern for intercepting Claude's chat SSE stream.
-   **Rationale**: Initial assumptions that Claude might use a different endpoint (e.g., `*/api/append_message*`) for its chat stream were incorrect. Browser network inspection during testing clearly showed the SSE stream originating from a URL matching `*/completion*`.
-   **Implications**: Debugger attachment relies on this pattern. Future changes by Claude to this endpoint URL would require updating this pattern.
---
**`2025-05-10` - Claude Provider SSE Stream Parsing for End-of-Message**
-   **Decision**: Refined the `parseDebuggerResponse` method in `extension/providers/claude.js` to robustly detect end-of-message signals from Claude's SSE stream.
-   **Rationale**: The provider was not consistently sending the complete message back to the application. The fix involved:
  -   Ensuring direct detection of `event: message_stop`.
  -   Correctly parsing `event: message_delta` for a `stop_reason` in its JSON data.
  -   Accumulating text from `content_block_delta` events until one of these end-of-message signals is received.
-   **Implications**: Improves reliability of message completion for the Claude provider. The parsing logic is specific to Claude's current SSE structure.
---
**`2025-05-10` - Disabling Function Calling Logic for Claude Provider**
-   **Decision**: Commented out the `ensureFunctionCallingEnabled` method and its invocations within `extension/providers/claude.js`.
-   **Rationale**: The Claude web interface (`claude.ai`) does not currently present a user-toggleable option for "Function calling" similar to what might be found in other AI platforms (like AI Studio, for which this feature was originally designed). Attempting to find and click a non-existent toggle was unnecessary and cluttered console logs.
-   **Implications**: If Claude introduces such a UI feature in the future, this code would need to be uncommented and potentially adapted. For now, it simplifies the provider's initialization.
---
*(Note: Replace `[YYYY-MM-DD]` with actual decision dates or approximate dates when these architectural choices were likely made based on project evolution.)*