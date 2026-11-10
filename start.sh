#!/bin/sh
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Install Node.js first: https://nodejs.org"; exit 1; }
node local-server.js
