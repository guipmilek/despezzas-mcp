FROM node:22-slim AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-slim

ENV NODE_ENV=production
ENV MCP_TRANSPORT=http
ENV HOST=0.0.0.0

WORKDIR /app
COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

EXPOSE 8787
CMD ["node", "dist/index.js"]
