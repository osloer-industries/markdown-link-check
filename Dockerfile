FROM node:24-alpine

# Use the Open Container Image Annotation Spec (https://github.com/opencontainers/image-spec/blob/master/annotations.md)
LABEL org.opencontainers.image.title="markdown-link-check"
LABEL org.opencontainers.image.description="checks that all hyperlinks in a markdown text to determine if they are alive or dead"
LABEL org.opencontainers.image.documentation="https://github.com/tcort/markdown-link-check/blob/master/README.md"
LABEL org.opencontainers.image.source="https://github.com/tcort/markdown-link-check"

RUN addgroup -g 10001 app && adduser -u 10001 -G app -D app

WORKDIR /src
COPY package.json package-lock.json ./
RUN set -ex; \
    npm ci --ignore-scripts
COPY index.js safe-markdown-parse.js markdown-link-check eslint.config.mjs ./
COPY test ./test
RUN ln -s /src/markdown-link-check /usr/local/bin/markdown-link-check && chown -R app:app /src
USER app
# hadolint ignore=DL3059
RUN npm test
ENTRYPOINT [ "markdown-link-check" ]