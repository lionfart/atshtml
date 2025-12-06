# Stage 1: Build the Next.js application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock) to leverage Docker cache
COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Build the Next.js application
# 'output' directory contains the optimized Next.js build
RUN yarn build

# Stage 2: Create the production-ready image
FROM node:20-alpine

# Set environment variables for Next.js production mode
ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

# Copy only necessary files from the builder stage
# The .next directory contains the production build of Next.js
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public
# If you have static assets in a separate 'static' folder, copy them too
# COPY --from=builder /app/static ./static

# No native dependencies for lowdb or @foreast/file-async, so no extra build tools or libs needed.

# Expose the port Next.js will run on
EXPOSE 3000

# Command to run the Next.js application in production mode
CMD ["yarn", "start"]

