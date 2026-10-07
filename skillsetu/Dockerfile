# Single-container build: compiles the React frontend, then serves it from the Express API.
FROM node:22-bookworm-slim AS web
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npx vite build

FROM node:22-bookworm-slim AS api
WORKDIR /app/backend
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY backend/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=4000 DATA_DIR=/data WEB_DIST=/app/frontend/dist
WORKDIR /app/backend
COPY --from=api /app/backend/node_modules ./node_modules
COPY backend/ ./
COPY --from=web /app/frontend/dist /app/frontend/dist
RUN mkdir -p /data && chown -R node:node /data
USER node
EXPOSE 4000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:4000/api/public/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
