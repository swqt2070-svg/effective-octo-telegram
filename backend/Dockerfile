FROM node:20-bookworm-slim
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm install
RUN npx prisma generate
COPY src ./src
ENV NODE_ENV=production
EXPOSE 3001
CMD ["sh","-c","npx prisma db push && node src/index.js"]
