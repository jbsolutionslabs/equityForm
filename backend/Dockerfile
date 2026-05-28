FROM node:18-slim

# Prisma's query engine binary requires OpenSSL
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Build context must be the repo root (set in Railway: Builder → Dockerfile,
# Dockerfile Path: backend/Dockerfile, Root Directory: leave empty / set to /)
WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/package.json
COPY backend/package.json ./backend/package.json

# Install all workspace dependencies from repo root
RUN npm ci

# Copy source after install to maximize cache hits
COPY shared/ ./shared/
COPY backend/ ./backend/

# Generate Prisma client
WORKDIR /app/backend
RUN npx prisma generate

EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/index.ts"]
