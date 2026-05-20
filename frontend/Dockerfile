FROM node:20-alpine

WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Install packages
RUN npm install

# Copy application source
COPY . .

EXPOSE 5173

# Launch development server
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
