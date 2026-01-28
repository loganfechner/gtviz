# Build stage - Install dependencies and build client
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./
COPY client/package*.json ./client/

# Install root dependencies
RUN npm ci --only=production=false

# Install client dependencies
WORKDIR /app/client
RUN npm ci

# Copy source files
WORKDIR /app
COPY . .

# Build the client
WORKDIR /app/client
RUN npm run build

# Production stage - Slim runtime image
FROM node:20-alpine AS production

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy server and source files
COPY src/ ./src/
COPY server/ ./server/

# Copy built client assets from builder stage
COPY --from=builder /app/client/dist ./client/dist

# Create non-root user for security
RUN addgroup -g 1001 -S gtviz && \
    adduser -S gtviz -u 1001 -G gtviz

# Default GT_DIR location (can be overridden with volume mount)
ENV GT_DIR=/gt
ENV NODE_ENV=production
ENV PORT=3001

# Expose the server port
EXPOSE 3001

# Switch to non-root user
USER gtviz

# Start the server
CMD ["node", "server/index.js"]
