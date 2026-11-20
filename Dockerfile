ARG BUN_VERSION=1.3.11

FROM oven/bun:${BUN_VERSION}-slim AS deps

WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
ARG NPM_TOKEN
RUN echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > /root/.npmrc \
  && bun install --frozen-lockfile --production \
  && rm /root/.npmrc

FROM oven/bun:${BUN_VERSION}-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=dopplerhq/cli:3.77.1 /bin/doppler /usr/local/bin/doppler

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
EXPOSE 3000
USER bun
CMD ["doppler", "run", "--", "./docker/entrypoint.sh"]
