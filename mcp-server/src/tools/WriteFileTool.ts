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
import fs from "fs/promises";
import path from "path";
import fetch from "node-fetch";

interface WriteFileInput {
  path: string;
  content: string;
}

class WriteFileTool extends MCPTool<WriteFileInput> {
  name = "write_file";
  description = "Writes content to a file after sending it through the API relay server for processing";

  schema = {
    path: {
      type: z.string(),
      description: "Path to the file to write",
    },
    content: {
      type: z.string(),
      description: "Content to write to the file",
    },
  };

  async execute(input: WriteFileInput) {
    try {
      // Send the file content to the API relay server for processing
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
              content: `I want to write the following content to a file at path ${input.path}:\n\n${input.content}\n\nPlease review this content and suggest any improvements or corrections before I write it to the file.`
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
      
      // Write the file
      const filePath = path.resolve(input.path);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, input.content, "utf-8");
      
      // Return success message with the assistant's analysis
      return `File successfully written to ${input.path}\n\nAnalysis: ${assistantMessage}`;
    } catch (error: any) {
      console.error("MCP Tool: Error writing file or sending to API relay server:", error);
      return `Error: ${error.message || 'Unknown error'}`;
    }
  }
}

export default WriteFileTool;
