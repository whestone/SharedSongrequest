FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8888 DATA_DIR=/data
RUN mkdir /data && chown node:node /data
VOLUME /data
EXPOSE 8888
USER node
CMD ["node", "src/server.js"]
