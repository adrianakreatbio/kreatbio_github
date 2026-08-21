# Build with the repository root as the Docker context:
# docker build -f portal-backend/Dockerfile -t kreatbio-client-portal .
FROM node:20-slim

WORKDIR /app
ENV NODE_ENV=production

COPY portal-backend/package*.json ./
RUN npm install --omit=dev

COPY portal-backend/server.js portal-backend/quota-store.js portal-backend/quota-admin.js ./
COPY client-portal.html ./public/client-portal.html
COPY supplements/0_kreatbio_logo.png ./public/supplements/0_kreatbio_logo.png
COPY client_supplements ./public/client_supplements

EXPOSE 8080
CMD ["node", "server.js"]
