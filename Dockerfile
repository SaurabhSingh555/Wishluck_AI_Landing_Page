FROM node:22-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3001
COPY package.json package-lock.json ./
RUN npm ci && npx playwright install --with-deps chromium
COPY --from=build /app/frontend/dist ./frontend/dist
COPY --from=build /app/backend ./backend
COPY --from=build /app/tests ./tests
COPY --from=build /app/tsconfig.json ./tsconfig.json
EXPOSE 3001
CMD ["sh", "-c", "npm run db:push && node --import tsx backend/src/server.ts"]
