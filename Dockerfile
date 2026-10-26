# Image de production (hébergeur en France ou dans l'UE : Scaleway, OVHcloud, Clever Cloud…)
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN BUILD_STANDALONE=1 npx next build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
COPY --from=deps /app/node_modules ./node_modules
USER node
EXPOSE 3000
# Met la base à jour puis démarre
CMD ["sh", "-c", "npx tsx scripts/preparer.ts && node server.js"]
