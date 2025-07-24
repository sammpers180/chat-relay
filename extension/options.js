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
// Default settings
const DEFAULT_SETTINGS = {
  serverHost: 'localhost',
  serverPort: 3003,
  serverProtocol: 'ws',
  chatGptCaptureMethod: 'debugger'
};

// DOM elements
const chatGptCaptureMethodSelect = document.getElementById('chatGptCaptureMethod');
const hostInput = document.getElementById('serverHost');
const portInput = document.getElementById('serverPort');
const protocolSelect = document.getElementById('serverProtocol');
const saveButton = document.getElementById('save');
const statusDiv = document.getElementById('status');

// Load saved settings
function loadSettings() {
  chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
    hostInput.value = items.serverHost;
    portInput.value = items.serverPort;
    protocolSelect.value = items.serverProtocol;
    chatGptCaptureMethodSelect.value = items.chatGptCaptureMethod;
  });
}

// Save settings
function saveSettings() {
  const settings = {
    serverHost: hostInput.value.trim() || DEFAULT_SETTINGS.serverHost,
    serverPort: parseInt(portInput.value) || DEFAULT_SETTINGS.serverPort,
    serverProtocol: protocolSelect.value,
    chatGptCaptureMethod: chatGptCaptureMethodSelect.value
  };
  
  chrome.storage.sync.set(settings, () => {
    // Show success message
    showStatus('Settings saved successfully!', 'success');
    
    // Update host permissions if needed
    updateHostPermissions(settings);
  });
}

// Show status message
function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = 'status ' + type;
  statusDiv.style.display = 'block';
  
  // Hide after 3 seconds
  setTimeout(() => {
    statusDiv.style.display = 'none';
  }, 3000);
}

// Update host permissions if needed
function updateHostPermissions(settings) {
  const url = `${settings.serverProtocol}://${settings.serverHost}:${settings.serverPort}/`;
  
  // Check if we already have permission
  chrome.permissions.contains({
    origins: [url]
  }, (hasPermission) => {
    if (!hasPermission) {
      // Request new permission
      chrome.permissions.request({
        origins: [url]
      }, (granted) => {
        if (granted) {
          console.log(`Permission granted for ${url}`);
        } else {
          showStatus('Warning: Permission not granted for the server URL. The extension may not work correctly.', 'error');
        }
      });
    }
  });
}

// Event listeners
document.addEventListener('DOMContentLoaded', loadSettings);
saveButton.addEventListener('click', saveSettings);