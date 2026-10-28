FROM node:22-bookworm-slim
WORKDIR /app
ARG INSTALL_QLOO_HARNESS=false
RUN if [ "$INSTALL_QLOO_HARNESS" = "true" ]; then npm install --global @qloo/qloo-harness@0.1.26; fi
COPY --chown=node:node . .
RUN npm ci --omit=dev --ignore-scripts
RUN mkdir -p /app/.data && chown node:node /app/.data
USER node
ENV HOST=0.0.0.0 PORT=4312 APP_MODE=fixture
EXPOSE 4312
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4312)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
