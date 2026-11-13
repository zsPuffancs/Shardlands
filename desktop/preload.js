'use strict';
// Electron preload for the game window: exposes window.shardlandsVault (public/gm.js uses it) with five fixed
// calls. No ipcRenderer, no channel names and no Node APIs reach the page.
const { contextBridge, ipcRenderer } = require('electron');
const call = channel => (...args) => ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld('shardlandsVault', Object.freeze({
  status: call('gm-vault:status'), list: call('gm-vault:list'), save: call('gm-vault:save'), reveal: call('gm-vault:reveal'), remove: call('gm-vault:remove'),
}));
