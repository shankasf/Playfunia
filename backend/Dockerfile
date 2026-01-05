FROM node:20-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --ignore-scripts
COPY . .
EXPOSE 5000
CMD ["npm", "run", "dev"]
