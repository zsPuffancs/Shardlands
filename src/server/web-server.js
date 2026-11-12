'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { attachWebSockets } = require('../multiplayer/transport');
const { worldInfo } = require('../world/game-world');
const { CLASSES } = require('../player/characters');
const { readInviteLink } = require('./tunnel');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/vnd.microsoft.icon' };

function createWebServer({ publicDirectory, config, players, clientScripts, handleMessage, onLeave, atlas }) {
  const server = http.createServer((request, response) => {
    if (atlas?.handle(request, response)) return;
    const pathname = request.url.split('?')[0];
    if (pathname === '/api/info') {
      const classes = Object.fromEntries(Object.entries(CLASSES).map(([id, characterClass]) => [
        id, { name: characterClass.name, desc: characterClass.desc || '', color: characterClass.color || '' },
      ]));
      const info = { serverName: config.serverName, classes, scripts: clientScripts(publicDirectory), world: worldInfo(), online: players.size, invite: readInviteLink() };
      response.writeHead(200, { 'Content-Type': 'application/json' });
      return response.end(JSON.stringify(info));
    }

    const requestedFile = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.join(publicDirectory, path.normalize(requestedFile).replace(/^(\.\.[\/\\])+/, ''));
    if (!filePath.startsWith(publicDirectory)) { response.writeHead(403); return response.end(); }
    fs.readFile(filePath, (error, data) => {
      if (error) { response.writeHead(404); return response.end('Not found'); }
      response.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      response.end(data);
    });
  });
  return { server, transport: attachWebSockets(server, handleMessage, onLeave) };
}

module.exports = { createWebServer };
