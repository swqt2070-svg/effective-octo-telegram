FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
COPY prisma ./prisma
RUN npm install
RUN npx prisma generate
COPY src ./src
ENV NODE_ENV=production
EXPOSE 3001
CMD ["sh","-c","npx prisma db push && node src/index.js"]
