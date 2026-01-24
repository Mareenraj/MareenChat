# Use Node 20 on Alpine Linux (Small & Fast)
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install OpenSSL (Required for Prisma on Alpine)
RUN apk add --no-cache openssl

# Copy package files first (better caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the code
COPY . .

# Generate Prisma Client (Uses the binaryTargets we added)
RUN npx prisma generate

# Build the NestJS application
RUN npm run build

# Expose the port (Cloud Run defaults to 8080, but we set env var)
EXPOSE 3000

# Start the server
CMD ["npm", "run", "start:prod"]