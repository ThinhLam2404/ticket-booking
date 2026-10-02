#!/bin/sh
set -eu

npm run prisma:deploy
exec node dist/main.js
