FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.json tsconfig.http.json ./
COPY src/ ./src/
RUN npm ci --ignore-scripts
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/http-index.js"]
