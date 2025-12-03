# syntax=docker/dockerfile:1

# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY frontend-react/package.json frontend-react/package-lock.json* ./
RUN npm ci
COPY frontend-react/ .
# Vite will read VITE_* envs during build; can be passed via build args
ARG VITE_API_URL
ARG VITE_LINE_PY_URL
ARG VITE_LINE_CLIENT_ID
ARG VITE_LINE_REDIRECT_URI
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_LINE_PY_URL=${VITE_LINE_PY_URL}
ENV VITE_LINE_CLIENT_ID=${VITE_LINE_CLIENT_ID}
ENV VITE_LINE_REDIRECT_URI=${VITE_LINE_REDIRECT_URI}
RUN npm run build

# Runtime stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Copy custom nginx config for SPA routing
COPY frontend-react/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
