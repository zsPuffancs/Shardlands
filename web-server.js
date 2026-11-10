'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { attachWebSockets } = require('./transport');
const { worldInfo } = require('./game-world');
const { CLASSES } = require('./characters');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

function createWebServer({ publicDirectory, config, players, clientScripts, handleMessage, onLeave }) {
  const server = http.createServer((request, response) => {
    const pathname = request.url.split('?')[0];
    if (pathname === '/api/info') {
      const classes = Object.fromEntries(Object.entries(CLASSES).map(([id, characterClass]) => [
        id, { name: characterClass.name, desc: characterClass.desc || '', color: characterClass.color || '' },
      ]));
      const info = { serverName: config.serverName, classes, scripts: clientScripts(publicDirectory), world: worldInfo(), online: players.size };
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
