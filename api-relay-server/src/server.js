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
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const http = require('http');

// Create Express app
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  const aliveConnections = activeConnections.filter(conn => conn.isAlive);
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    activeBrowserConnections: aliveConnections.length,
    totalTrackedBrowserConnections: activeConnections.length,
    webSocketServerState: wss.options.server.listening ? 'listening' : 'not_listening' // wss.readyState is not standard for server
  });
});

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server for browser extension communication
const wss = new WebSocketServer({ server });

// Global variables
let activeConnections = [];
const pendingRequests = new Map();
let requestCounter = 0;

// Connection health check interval (in milliseconds)
const PING_INTERVAL = 30000; // 30 seconds
const CONNECTION_TIMEOUT = 45000; // 45 seconds

// Handle WebSocket connections from browser extensions
wss.on('connection', (ws, req) => { // Added req to log client IP
  const clientIp = req.socket.remoteAddress;
  console.log(`SERVER: Browser extension connected from IP: ${clientIp}`);
  
  // Initialize connection state
  ws.isAlive = true;
  ws.pendingPing = false;
  ws.lastActivity = Date.now();
  
  // Add to active connections
  activeConnections.push(ws);

  // Set up ping interval for this connection
  const pingInterval = setInterval(() => {
    // Check if connection is still alive
    if (!ws.isAlive) {
      console.log('Browser extension connection timed out, terminating');
      clearInterval(pingInterval);
      ws.terminate();
      return;
    }
    
    // If we're still waiting for a pong from the last ping, mark as not alive
    if (ws.pendingPing) {
      console.log('Browser extension not responding to ping, marking as inactive');
      ws.isAlive = false;
      return;
    }
    
    // Check if there's been activity recently
    const inactiveTime = Date.now() - ws.lastActivity;
    if (inactiveTime > CONNECTION_TIMEOUT) {
      console.log(`Browser extension inactive for ${inactiveTime}ms, sending ping`);
      // Send a ping to check if still alive
      ws.pendingPing = true;
      try {
        ws.ping();
      } catch (error) {
        console.error('Error sending ping:', error);
        ws.isAlive = false;
      }
    }
  }, PING_INTERVAL);

  // Handle pong messages (response to ping)
  ws.on('pong', () => {
    ws.isAlive = true;
    ws.pendingPing = false;
    ws.lastActivity = Date.now();
    console.log('Browser extension responded to ping');
  });

  // Handle messages from browser extension
  ws.on('message', (messageBuffer) => {
    const rawMessage = messageBuffer.toString();
    console.log(`SERVER: Received raw message from extension (IP: ${clientIp}): ${rawMessage.substring(0, 500)}${rawMessage.length > 500 ? '...' : ''}`);
    try {
      // Update last activity timestamp
      ws.lastActivity = Date.now();
      
      const data = JSON.parse(rawMessage);
      console.log(`SERVER: Parsed message data from extension (IP: ${clientIp}):`, data);
      
      const { requestId, type } = data;

      if (requestId === undefined) {
        console.warn(`SERVER: Received message without requestId from IP ${clientIp}:`, data);
        // Handle other non-request-specific messages if any (e.g., status pings initiated by extension)
        if (type === 'EXTENSION_STATUS') {
            console.log(`SERVER: Browser extension status from IP ${clientIp}: ${data.status}`);
        }
        return;
      }
      
      // Log based on new message types from background.js
      if (type === 'CHAT_RESPONSE_CHUNK') {
        const chunkContent = data.chunk ? data.chunk.substring(0, 200) + (data.chunk.length > 200 ? '...' : '') : '[empty chunk]';
        console.log(`SERVER: Received CHAT_RESPONSE_CHUNK for requestId: ${requestId} from IP ${clientIp}. Chunk (first 200): ${chunkContent}. IsFinal: ${data.isFinal}`);
        
        const pendingRequest = pendingRequests.get(requestId);
        if (pendingRequest) {
          console.log(`SERVER: Processing CHAT_RESPONSE_CHUNK for pending request ${requestId} from IP ${clientIp}. IsFinal: ${data.isFinal}, Chunk (first 200): ${chunkContent}`);
          // Initialize accumulatedChunks if it doesn't exist (should be set on creation)
          if (typeof pendingRequest.accumulatedChunks === 'undefined') {
            pendingRequest.accumulatedChunks = '';
          }
          
          if (data.chunk) { // Ensure chunk is not null or undefined
            pendingRequest.accumulatedChunks += data.chunk;
          }

          if (data.isFinal) {
            console.log(`SERVER: Request ${requestId} (IP: ${clientIp}) received final CHAT_RESPONSE_CHUNK. Attempting to resolve promise.`);
            if (pendingRequest.timeoutId) {
              clearTimeout(pendingRequest.timeoutId);
              console.log(`SERVER: Request ${requestId} (IP: ${clientIp}) timeout cleared.`);
            }
            pendingRequest.resolve(pendingRequest.accumulatedChunks);
            pendingRequests.delete(requestId);
            console.log(`SERVER: Request ${requestId} (IP: ${clientIp}) promise resolved and removed from pending. Total length: ${pendingRequest.accumulatedChunks.length}`);
          } else {
            console.log(`SERVER: Accumulated chunk for requestId ${requestId} (IP: ${clientIp}). Current total length: ${pendingRequest.accumulatedChunks.length}`);
          }
        } else {
          console.log(`SERVER: Received CHAT_RESPONSE_CHUNK for request ${requestId} (IP: ${clientIp}, isFinal: ${data.isFinal}), but no pending request found.`);
        }
      } else if (type === 'CHAT_RESPONSE_STREAM_ENDED') {
        const pendingRequestStream = pendingRequests.get(requestId);
        if (pendingRequestStream) {
            console.log(`SERVER: Processing CHAT_RESPONSE_STREAM_ENDED for pending request ${requestId} (IP: ${clientIp}).`);
            // This message type now primarily signals the end. The actual data comes in CHAT_RESPONSE_CHUNK.
            // If a request is still pending and we haven't resolved it with a final chunk,
            // it might indicate an issue or a stream that ended without complete data.
            if (!pendingRequestStream.resolved) {
                console.warn(`SERVER: Stream ended for requestId ${requestId} (IP: ${clientIp}), but request was not fully resolved with data. This might be an issue.`);
            }
        } else {
            console.log(`SERVER: Received CHAT_RESPONSE_STREAM_ENDED for request ${requestId} (IP: ${clientIp}), but no pending request found.`);
        }
      } else if (type === 'CHAT_RESPONSE_ERROR') {
        const errorMsg = data.error || "Unknown error from extension.";
        console.error(`SERVER: Received CHAT_RESPONSE_ERROR for requestId: ${requestId} (IP: ${clientIp}). Error: ${errorMsg}`);
        const pendingRequestError = pendingRequests.get(requestId);
        if (pendingRequestError) {
            console.log(`SERVER: Processing CHAT_RESPONSE_ERROR for pending request ${requestId} (IP: ${clientIp}).`);
            if (pendingRequestError.timeoutId) {
              clearTimeout(pendingRequestError.timeoutId);
              console.log(`SERVER: Request ${requestId} (IP: ${clientIp}) timeout cleared due to error.`);
            }
            pendingRequestError.reject(new Error(`Extension reported error for request ${requestId}: ${errorMsg}`));
            pendingRequests.delete(requestId);
            console.log(`SERVER: Request ${requestId} (IP: ${clientIp}) rejected due to CHAT_RESPONSE_ERROR and removed from pending.`);
        } else {
            console.log(`SERVER: Received CHAT_RESPONSE_ERROR for request ${requestId} (IP: ${clientIp}), but no pending request found.`);
        }
      } else if (type === 'CHAT_RESPONSE') { // Keep old CHAT_RESPONSE for compatibility if content script DOM fallback sends it
        const { response } = data;
        console.log(`SERVER: Received (legacy) CHAT_RESPONSE for requestId: ${requestId} from IP ${clientIp}. Response (first 100): ${response ? response.substring(0,100) : '[empty]'}`);
        const pendingRequest = pendingRequests.get(requestId);
        if (pendingRequest) {
          if (pendingRequest.timeoutId) clearTimeout(pendingRequest.timeoutId);
          pendingRequest.resolve(response);
          pendingRequests.delete(requestId);
          console.log(`SERVER: Request ${requestId} resolved with (legacy) CHAT_RESPONSE from IP ${clientIp}.`);
        } else {
          console.log(`SERVER: Received (legacy) CHAT_RESPONSE for request ${requestId} from IP ${clientIp}, but no pending request found.`);
        }
      } else if (type === 'EXTENSION_ERROR') { // General extension error not tied to a request
        console.error(`SERVER: Browser extension (IP: ${clientIp}) reported general error: ${data.error}`);
      } else if (type === 'EXTENSION_STATUS') {
        console.log(`SERVER: Browser extension (IP: ${clientIp}) status: ${data.status}`);
      } else {
        console.warn(`SERVER: Received unknown message type '${type}' from IP ${clientIp} for requestId ${requestId}:`, data);
      }
    } catch (error) {
      console.error(`SERVER: Error processing WebSocket message from IP ${clientIp}:`, error, `Raw message: ${rawMessage}`);
    }
  });

  // Handle disconnection
  ws.on('close', (code, reason) => {
    const reasonString = reason ? reason.toString() : 'No reason given';
    console.log(`SERVER: Browser extension (IP: ${clientIp}) disconnected. Code: ${code}, Reason: ${reasonString}`);
    clearInterval(pingInterval);
    activeConnections = activeConnections.filter(conn => conn !== ws);
    
    // Check if there are any pending requests that were using this connection
    // and reject them with a connection closed error
    pendingRequests.forEach((request, requestId) => {
      if (request.connection === ws) {
        console.log(`Rejecting request ${requestId} due to connection close`);
        request.reject(new Error('Browser extension disconnected'));
        pendingRequests.delete(requestId);
      }
    });
  });
  
  // Handle errors
  ws.on('error', (error) => {
    console.error(`SERVER: WebSocket error for connection from IP ${clientIp}:`, error);
    ws.isAlive = false; // Mark as not alive on error
    // Consider terminating and cleaning up like in 'close' if error is fatal
  });
});

// Create API router
const apiRouter = express.Router();

// Configuration
const REQUEST_TIMEOUT = 300000; // 5 minutes (in milliseconds)
const MAX_RETRIES = 2; // Maximum number of retries for a failed request

// Helper function to find the best active connection
function getBestConnection() {
  // Filter out connections that are not alive
  const aliveConnections = activeConnections.filter(conn => conn.isAlive);
  
  if (aliveConnections.length === 0) {
    return null;
  }
  
  // Sort connections by last activity (most recent first)
  aliveConnections.sort((a, b) => b.lastActivity - a.lastActivity);
  
  return aliveConnections[0];
}

// OpenAI-compatible chat completions endpoint
apiRouter.post('/chat/completions', async (req, res) => {
  try {
    const { messages, model, temperature, max_tokens } = req.body;
    console.log(`SERVER: Full incoming HTTP request body for request ID (to be generated):`, JSON.stringify(req.body, null, 2));
    
    // Generate a unique request ID
    const requestId = requestCounter++;
    
    // Extract the user's message (last message in the array)
    const userMessage = messages[messages.length - 1].content;
    
    // Get the best active connection
    const extension = getBestConnection();
    
    // Check if we have any active connections
    if (!extension) {
      return res.status(503).json({
        error: {
          message: "No active browser extension connected. Please open the chat interface and ensure the extension is active.",
          type: "server_error",
          code: "no_extension_connected"
        }
      });
    }
    
    // Create a promise that will be resolved when the response is received
    console.log(`SERVER: Request ${requestId} creating response promise.`);
    const responsePromise = new Promise((resolve, reject) => {
      const internalResolve = (value) => {
        console.log(`SERVER: Request ${requestId} internal promise resolve function called.`);
        resolve(value);
      };
      const internalReject = (reason) => {
        console.log(`SERVER: Request ${requestId} internal promise reject function called.`);
        reject(reason);
      };

      // Set a timeout to reject the promise after the configured timeout
      const timeoutId = setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          console.error(`SERVER: Request ${requestId} timed out after ${REQUEST_TIMEOUT}ms. Rejecting promise.`);
          pendingRequests.delete(requestId); // Ensure cleanup
          internalReject(new Error('Request timed out'));
        } else {
          console.warn(`SERVER: Request ${requestId} timeout triggered, but request no longer in pendingRequests. It might have resolved or errored just before timeout.`);
        }
      }, REQUEST_TIMEOUT);
      
      // Store the promise resolvers and the connection being used
      pendingRequests.set(requestId, {
        resolve: internalResolve,
        reject: internalReject,
        connection: extension,
        timeoutId,
        retryCount: 0,
        accumulatedChunks: '' // Initialize for chunk accumulation
      });
      console.log(`SERVER: Request ${requestId} added to pendingRequests. Timeout ID: ${timeoutId}`);
    });
    
    // Prepare the message
    const message = {
      type: 'SEND_CHAT_MESSAGE',
      requestId,
      message: userMessage,
      settings: {
        model,
        temperature,
        max_tokens
      }
    };
    
    // Send the message to the browser extension
    try {
      console.log(`SERVER: Request ${requestId} - Sending full message to extension:`, JSON.stringify(message, null, 2));
      extension.send(JSON.stringify(message));
      console.log(`SERVER: Request ${requestId} (message type: ${message.type}) sent to browser extension (IP: ${extension.remoteAddress || 'unknown'}). Waiting for response...`);
      
      // Update last activity timestamp
      extension.lastActivity = Date.now();
    } catch (error) {
      console.error(`Error sending message to extension for request ${requestId}:`, error);
      
      // Clean up the pending request
      if (pendingRequests.has(requestId)) {
        const pendingRequest = pendingRequests.get(requestId);
        if (pendingRequest.timeoutId) {
          clearTimeout(pendingRequest.timeoutId);
        }
        pendingRequests.delete(requestId);
      }
      
      return res.status(500).json({
        error: {
          message: "Failed to send message to browser extension",
          type: "server_error",
          code: "extension_communication_error"
        }
      });
    }
    
    // Wait for the response
    const awaitStartTime = Date.now();
    console.log(`SERVER: Request ${requestId} is now awaiting responsePromise (extension response). Timeout set to ${REQUEST_TIMEOUT}ms.`);
    const response = await responsePromise;
    const awaitEndTime = Date.now();
    console.log(`SERVER: Request ${requestId} await responsePromise completed in ${awaitEndTime - awaitStartTime}ms. Received response from extension. Preparing to send to client.`);
    
    // Format the response in OpenAI format
    const formatStartTime = Date.now();
    const formattedResponse = {
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: model || "relay-model", // model is from req.body
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: response // response is the string from the extension
          },
          finish_reason: "stop"
        }
      ],
      usage: {
        prompt_tokens: -1, // We don't track tokens
        completion_tokens: -1,
        total_tokens: -1
      }
      // Removed service_tier, logprobs, refusal, annotations, and detailed usage to match simpler working version
    };
    
    console.log(`SERVER: Request ${requestId} - Full outgoing HTTP response body:`, JSON.stringify(formattedResponse, null, 2));
    res.json(formattedResponse);
    const sendEndTime = Date.now();
    console.log(`SERVER: Request ${requestId} formatted and sent response to client in ${sendEndTime - formatStartTime}ms (total after await: ${sendEndTime - awaitEndTime}ms).`);
  } catch (error) {
    const reqIdForLog = typeof requestId !== 'undefined' ? requestId : (error && typeof error.requestId !== 'undefined' ? error.requestId : 'UNKNOWN');
    console.error(`SERVER: Error processing chat completion for request ${reqIdForLog}:`, error);
    if (typeof requestId === 'undefined') {
      console.error(`SERVER: CRITICAL - 'requestId' was undefined in catch block. Error object requestId: ${error && error.requestId}`);
    }
    
    // Determine the appropriate status code based on the error
    let statusCode = 500;
    let errorType = "server_error";
    let errorCode = "internal_error";
    
    if (error.message === 'Request timed out') {
      statusCode = 504; // Gateway Timeout
      errorType = "timeout_error";
      errorCode = "request_timeout";
    } else if (error.message === 'Browser extension disconnected') {
      statusCode = 503; // Service Unavailable
      errorType = "server_error";
      errorCode = "extension_disconnected";
    }
    
    const errorResponsePayload = {
      error: {
        message: error.message,
        type: errorType,
        code: errorCode
      }
    };
    console.log(`SERVER: Request ${reqIdForLog} - Sending error response to client:`, JSON.stringify(errorResponsePayload, null, 2));
    res.status(statusCode).json(errorResponsePayload);
  }
});

// Models endpoint
apiRouter.get('/models', (req, res) => {
  res.json({
    object: "list",
    data: [
      {
        id: "gemini-pro",
        object: "model",
        created: 1677610602,
        owned_by: "relay"
      },
      {
        id: "chatgpt",
        object: "model",
        created: 1677610602,
        owned_by: "relay"
      },
      {
        id: "claude-3",
        object: "model",
        created: 1677610602,
        owned_by: "relay"
      }
    ]
  });
});

// Mount the API router
app.use('/v1', apiRouter);

// Start the server
const PORT = process.env.PORT || 3003;
server.listen(PORT, () => {
  console.log(`OpenAI-compatible relay server running on port ${PORT}`);
  console.log(`WebSocket server for browser extensions running on ws://localhost:${PORT}`);
});

module.exports = server;
