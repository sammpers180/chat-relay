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
import { MCPServer } from "mcp-framework";
import SendMessageTool from "./tools/SendMessageTool.js";
import ReadFileTool from "./tools/ReadFileTool.js";
import WriteFileTool from "./tools/WriteFileTool.js";
import EditFileTool from "./tools/EditFileTool.js";

async function startServer() {
  console.log("Initializing Chat Relay MCP Server...");
  
  // Create instances of tools
  const sendMessageTool = new SendMessageTool();
  const readFileTool = new ReadFileTool();
  const writeFileTool = new WriteFileTool();
  const editFileTool = new EditFileTool();
  
  // Create the MCP server with configuration
  // Use 'as any' to bypass TypeScript type checking
  const mcpServer = new MCPServer({
    transport: { type: "stdio" }
  } as any);
  
  // Use 'as any' to bypass TypeScript type checking for method calls
  try {
    (mcpServer as any).registerTool(sendMessageTool);
    (mcpServer as any).registerTool(readFileTool);
    (mcpServer as any).registerTool(writeFileTool);
    (mcpServer as any).registerTool(editFileTool);
    console.log("Registered tools using 'registerTool' method");
  } catch (error) {
    console.error("Error registering tools:", error);
    console.warn("Falling back to direct property assignment");
    (mcpServer as any).tools = [sendMessageTool, readFileTool, writeFileTool, editFileTool];
  }
  try {
    await mcpServer.start();
    console.log(`MCP Server started with stdio transport. Registered operations: send_message, read_file, write_file, edit_file`);
    console.log(`MCP Server is configured to communicate with API Relay Server on http://localhost:3003`);
  } catch (error) {
    console.error("Failed to start MCP Server:", error);
    process.exit(1);
  }
}
startServer().catch(err => {
  console.error("Unhandled error during server startup:", err);
  process.exit(1);
});
