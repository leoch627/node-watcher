FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Install mihomo (clash meta)
RUN apk add --no-cache curl gzip \
    && curl -L -o mihomo.gz https://github.com/MetaCubeX/mihomo/releases/download/v1.17.0/mihomo-linux-amd64-v1.17.0.gz \
    && gzip -d mihomo.gz \
    && mv mihomo /usr/local/bin/mihomo \
    && chmod +x /usr/local/bin/mihomo

# Copy application files
COPY . .

# Create logs directory
RUN mkdir -p logs

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production

# Start the application
CMD ["npm", "start"]
