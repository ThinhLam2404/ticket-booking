FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
COPY be/package*.json ./be/
RUN npm ci --prefix be

COPY be/nest-cli.json ./be/
COPY be/tsconfig*.json ./be/
COPY be/prisma ./be/prisma
RUN npm --prefix be run prisma:generate

COPY be/src ./be/src
RUN npm --prefix be run build

FROM node:22-alpine AS runtime

WORKDIR /app/be
ENV NODE_ENV=production

COPY --from=build /app/be/package*.json ./
COPY --from=build /app/be/node_modules ./node_modules
COPY --from=build /app/be/dist ./dist
COPY --from=build /app/be/prisma ./prisma
COPY be/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER node
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
