FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/db/schema.prisma ./src/db/schema.prisma
COPY --from=build /app/package*.json ./
RUN mkdir -p uploads
EXPOSE 4000
CMD ["node", "dist/server.js"]
