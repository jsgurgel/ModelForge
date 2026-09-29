FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM nginxinc/nginx-unprivileged:alpine
#  O nginx repassa /api para o back: o navegador fala só com a origem do front (sem CORS).
#  Sozinho (sem compose) aponta para o back publicado no host; o compose sobrescreve para http://backend:3000.
ENV BACKEND_URL=http://host.docker.internal:3000
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
