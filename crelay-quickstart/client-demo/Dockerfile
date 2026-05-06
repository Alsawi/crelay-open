FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY index.mjs ./
CMD ["node", "index.mjs"]
