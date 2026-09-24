# BeltBattles ghost server and game page: one zero-dependency Node process (deploy/RUNBOOK.md).
# Build context: the repo root, cut by .dockerignore to exactly two inputs, made beforehand by
#   node deploy/stage.mjs <game.html>
# server/dist/ (the vite bundle; it imports only node: built-ins, so there is no npm install) and
# deploy/public/index.html (the staged single-file game, recorded in deploy/GAME_BUILD.txt).
# Node 22 LTS: Node 20 reached end of life on 2026-04-30. The bundle uses only node:http, fs, path
# and crypto plus the global fetch; the server suites and the smoke run pass on 22 locally.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# root-owned and read-only for the process: it cannot rewrite its own code or page
COPY server/dist/ ./dist/
COPY deploy/public/index.html ./public/index.html

USER node
EXPOSE 8080
CMD ["node", "/app/dist/ghost-server.mjs"]
