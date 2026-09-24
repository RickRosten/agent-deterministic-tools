# Build from the repository root:
#   docker build -f apps/server/Dockerfile -t deterministic-tools-server .
#   docker run -p 3333:3333 -e DETERMINISTIC_TOOLS_AUTH_TOKEN=change-me deterministic-tools-server
FROM node:22-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3333
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/server ./apps/server
USER node
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3333/healthz || exit 1
CMD ["node", "apps/server/dist/main.js"]
