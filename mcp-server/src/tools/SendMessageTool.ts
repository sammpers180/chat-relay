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
import { MCPTool } from "mcp-framework";
import { z } from "zod";
import fetch from "node-fetch";

interface SendMessageInput {
  message: string;
}

class SendMessageTool extends MCPTool<SendMessageInput> {
  name = "send_message";
  description = "Sends a message through the API relay server to the browser extension";

  schema = {
    message: {
      type: z.string(),
      description: "The message to send to the API relay server",
    },
  };

  async execute(input: SendMessageInput) {
    try {
      // Send a POST request to the API relay server
      const response = await fetch('http://localhost:3003/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: "chatgpt",
          messages: [
            {
              role: "user",
              content: input.message
            }
          ],
          temperature: 0.7,
          max_tokens: 100
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`MCP Tool: Error from API relay server: ${response.status} ${response.statusText}`, errorText);
        return `Error from API relay server: ${response.status} ${response.statusText}`;
      }

      const data = await response.json();
      console.log(`MCP Tool: Received response from API relay server:`, data);
      
      // Extract the assistant's message from the response
      const responseData = data as any; // Type assertion
      const assistantMessage = responseData.choices[0].message.content;
      return `Message sent successfully. Response: "${assistantMessage}"`;
    } catch (error: any) {
      console.error("MCP Tool: Error sending message to API relay server:", error);
      return `Error sending message to API relay server: ${error.message || 'Unknown error'}`;
    }
  }
}

export default SendMessageTool;
