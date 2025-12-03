# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /usr/src/app

# Install OS deps
RUN apk add --no-cache python3 make g++

# Install prod deps first
COPY backend-node/package.json backend-node/package-lock.json* ./
RUN npm ci --only=production && cp -r node_modules /prod_node_modules

# Install dev deps (optional for building)
RUN npm ci

# Copy source
COPY backend-node/ .

# Build (if you have a build step; otherwise skip)
# RUN npm run build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /usr/src/app

# Copy only production node_modules
COPY --from=base /prod_node_modules ./node_modules

# Copy app source
COPY --from=base /usr/src/app .

# Expose port
EXPOSE 5050

# Healthcheck (adjust path)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:5050/health || exit 1

# Start
CMD ["node", "src/server.js"]
