# syntax=docker/dockerfile:1
FROM public.ecr.aws/r3a1l1p0/chainapsis/ubuntu:24.04-keplr-firefox-build-multi

# Keep the upstream Firefox build tools, with the same Node runtime as CI.
COPY --from=node:22.22.1-bookworm-slim /usr/local/ /usr/local/
ENV PATH="/usr/local/bin:${PATH}"
RUN corepack enable

WORKDIR /app
COPY ./ /app

RUN yarn install --immutable

# Expose build configuration only to this step, not image metadata or history.
# Values compiled into the extension remain public client configuration and
# must never contain privileged server credentials.
RUN --mount=type=secret,id=KEPLR_EXT_ETHEREUM_ENDPOINT,env=KEPLR_EXT_ETHEREUM_ENDPOINT \
    --mount=type=secret,id=KEPLR_EXT_ANALYTICS_API_AUTH_TOKEN,env=KEPLR_EXT_ANALYTICS_API_AUTH_TOKEN \
    --mount=type=secret,id=KEPLR_EXT_ANALYTICS_API_URL,env=KEPLR_EXT_ANALYTICS_API_URL \
    --mount=type=secret,id=KEPLR_EXT_COINGECKO_ENDPOINT,env=KEPLR_EXT_COINGECKO_ENDPOINT \
    --mount=type=secret,id=KEPLR_EXT_COINGECKO_GETPRICE,env=KEPLR_EXT_COINGECKO_GETPRICE \
    --mount=type=secret,id=KEPLR_EXT_COINGECKO_COIN_DATA_BY_TOKEN_ADDRESS,env=KEPLR_EXT_COINGECKO_COIN_DATA_BY_TOKEN_ADDRESS \
    --mount=type=secret,id=KEPLR_EXT_CHAIN_REGISTRY_URL,env=KEPLR_EXT_CHAIN_REGISTRY_URL \
    --mount=type=secret,id=KEPLR_EXT_GOOGLE_MEASUREMENT_ID,env=KEPLR_EXT_GOOGLE_MEASUREMENT_ID \
    --mount=type=secret,id=KEPLR_EXT_GOOGLE_API_KEY_FOR_MEASUREMENT,env=KEPLR_EXT_GOOGLE_API_KEY_FOR_MEASUREMENT \
    --mount=type=secret,id=KEPLR_EXT_TOKEN_FACTORY_BASE_URL,env=KEPLR_EXT_TOKEN_FACTORY_BASE_URL \
    --mount=type=secret,id=KEPLR_EXT_TOKEN_FACTORY_URI,env=KEPLR_EXT_TOKEN_FACTORY_URI \
    --mount=type=secret,id=KEPLR_EXT_TX_HISTORY_BASE_URL,env=KEPLR_EXT_TX_HISTORY_BASE_URL \
    --mount=type=secret,id=KEPLR_EXT_CONFIG_SERVER,env=KEPLR_EXT_CONFIG_SERVER \
    --mount=type=secret,id=WC_PROJECT_ID,env=WC_PROJECT_ID \
    --mount=type=secret,id=SKIP_API_KEY,env=SKIP_API_KEY \
    --mount=type=secret,id=KEPLR_EXT_PROVIDER_META_ID,env=KEPLR_EXT_PROVIDER_META_ID \
    --mount=type=secret,id=KEPLR_EXT_AMPLITUDE_API_KEY,env=KEPLR_EXT_AMPLITUDE_API_KEY \
    --mount=type=secret,id=KEPLR_API_ENDPOINT,env=KEPLR_API_ENDPOINT \
    --mount=type=secret,id=KEPLR_EXT_TX_CODEC_BASE_URL,env=KEPLR_EXT_TX_CODEC_BASE_URL \
    --mount=type=secret,id=KEPLR_EXT_TOPUP_BASE_URL,env=KEPLR_EXT_TOPUP_BASE_URL \
    --mount=type=secret,id=KEPLR_EXT_TOPUP_API_KEY,env=KEPLR_EXT_TOPUP_API_KEY \
    yarn build

RUN install -d -o 10001 -g 10001 /data
USER 10001:10001
VOLUME /data
WORKDIR /data

HEALTHCHECK CMD test -r /app/apps/extension/build/firefox/manifest.json
CMD ["sh", "-c", "mkdir -p ./build && cd ./build && find . -type f -delete && cp -r /app/apps/extension/build /data"]
