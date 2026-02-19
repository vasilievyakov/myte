# Stage 1: Build client
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Build server
FROM node:20-alpine AS server-build
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# Stage 3: Production runtime
FROM node:20-alpine
WORKDIR /app
COPY --from=server-build /app/server/dist ./dist
COPY --from=server-build /app/server/node_modules ./node_modules
COPY --from=server-build /app/server/package.json ./
COPY --from=client-build /app/client/dist ./public
EXPOSE 2567
CMD ["node", "dist/index.js"]
