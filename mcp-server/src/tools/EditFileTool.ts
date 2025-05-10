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

interface EditFileInput {
  path: string;
  oldText: string;
  newText: string;
}

class EditFileTool extends MCPTool<EditFileInput> {
  name = "edit_file";
  description = "Edits a file by replacing text after sending it through the API relay server for processing";

  schema = {
    path: {
      type: z.string(),
      description: "Path to the file to edit",
    },
    oldText: {
      type: z.string(),
      description: "Text to replace",
    },
    newText: {
      type: z.string(),
      description: "New text to insert",
    },
  };

  async execute(input: EditFileInput) {
    try {
      // Read the file
      const filePath = path.resolve(input.path);
      const content = await fs.readFile(filePath, "utf-8");
      
      // Check if the oldText exists in the file
      if (!content.includes(input.oldText)) {
        return `Error: The text to replace was not found in the file ${input.path}`;
      }
      
      // Send the edit to the API relay server for processing
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
              content: `I want to edit a file at path ${input.path} by replacing:\n\n${input.oldText}\n\nWith:\n\n${input.newText}\n\nPlease review this edit and suggest any improvements or corrections.`
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
      
      // Perform the edit
      const newContent = content.replace(input.oldText, input.newText);
      await fs.writeFile(filePath, newContent, "utf-8");
      
      // Return success message with the assistant's analysis
      return `File successfully edited at ${input.path}\n\nAnalysis: ${assistantMessage}`;
    } catch (error: any) {
      console.error("MCP Tool: Error editing file or sending to API relay server:", error);
      return `Error: ${error.message || 'Unknown error'}`;
    }
  }
}

export default EditFileTool;
