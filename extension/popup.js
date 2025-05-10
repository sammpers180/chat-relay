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
// DOM elements
const connectionStatus = document.getElementById('connectionStatus');
const openOptionsButton = document.getElementById('openOptions');
const serverUrlSpan = document.getElementById('serverUrl');

// Default settings
const DEFAULT_SETTINGS = {
  serverHost: 'localhost',
  serverPort: 3003,
  serverProtocol: 'ws'
};

// Load settings and update UI
function loadSettings() {
  chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
    const serverUrl = `${items.serverProtocol}://${items.serverHost}:${items.serverPort}`;
    serverUrlSpan.textContent = serverUrl;
    
    // Check connection status
    checkConnectionStatus();
  });
}

// Check connection status with the background script
function checkConnectionStatus() {
  chrome.runtime.sendMessage({ action: "GET_CONNECTION_STATUS" }, (response) => {
    if (chrome.runtime.lastError) {
      updateConnectionStatus(false);
      return;
    }
    
    if (response && response.connected) {
      updateConnectionStatus(true);
    } else {
      updateConnectionStatus(false);
    }
  });
}

// Update the connection status UI
function updateConnectionStatus(isConnected) {
  if (isConnected) {
    connectionStatus.className = 'status connected';
    connectionStatus.textContent = 'Connected to relay server';
  } else {
    connectionStatus.className = 'status disconnected';
    connectionStatus.textContent = 'Disconnected from relay server';
  }
}

// Open the options page
function openOptions() {
  chrome.runtime.openOptionsPage();
}

// Event listeners
document.addEventListener('DOMContentLoaded', loadSettings);
openOptionsButton.addEventListener('click', openOptions);