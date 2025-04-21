# Stage 1: build
FROM apify/actor-node-playwright-chrome:20 AS builder

# Switch to the non-root user defined in the base image
USER myuser
WORKDIR /home/myuser

# 1) Copy package manifests and install all dependencies (including dev)
COPY package*.json ./
RUN npm install --include=dev --audit=false

# 2) Copy the rest of the source and build
COPY . ./
RUN npm run build


# Stage 2: runtime
FROM apify/actor-node-playwright-chrome:20

# Switch to the non-root user and set working dir
USER myuser
WORKDIR /home/myuser

# 1) Copy package manifests and install only production deps
COPY package*.json ./
# Ensure Camoufox postinstall runs if needed
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0
RUN npm --quiet set progress=false \
    && npm install --omit=dev --omit=optional --audit=false \
    && rm -rf ~/.npm

# 2) Copy the built artifacts
COPY --from=builder /home/myuser/dist ./dist

# 3) Copy any startup scripts (e.g. Xvfb launcher)
COPY start_xvfb_and_run_cmd.sh ./

# 4) Copy only other runtime files if absolutely needed
#    (avoid copying full context to preserve layer cache)
# COPY input_schema.json ./

# Entry point: start Xvfb and launch production server
CMD ["bash", "start_xvfb_and_run_cmd.sh", "npm", "run", "start:prod", "--silent"]
