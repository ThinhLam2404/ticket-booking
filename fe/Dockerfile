FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
COPY fe/package*.json ./fe/
RUN npm ci --prefix fe

COPY fe ./fe
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=$VITE_API_URL
RUN npm --prefix fe run build

FROM nginx:1.27-alpine AS runtime

COPY fe/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/fe/dist /usr/share/nginx/html

EXPOSE 80
