# use the official Bun image
# see all versions at https://hub.docker.com/r/oven/bun/tags
FROM oven/bun:latest AS base
WORKDIR /usr/src/app

# install dependencies into temp directory
# this will cache them and speed up future builds
FROM base AS install
RUN mkdir -p /temp/dev
RUN mkdir -p /temp/dev/patches
COPY ./package.json ./bun.lock /temp/dev/
COPY ./patches /temp/dev/patches/
RUN cd /temp/dev && bun install

# install with --production (exclude devDependencies)
RUN mkdir -p /temp/prod
RUN mkdir -p /temp/prod/patches
COPY ./package.json ./bun.lock /temp/prod/
COPY ./patches /temp/prod/patches/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# copy node_modules from temp directory
# then copy all (non-ignored) project files into the image
FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY ./ .

# [optional] tests & build
ENV NODE_ENV=production

# initialize env vars for testing and building
# secrets should be mounted here too
# VOLUME /usr/src/db/
# ENV DATABASE_URL=/usr/src/db/local.db

RUN bun run prepare
RUN bun --bun run build

# copy production dependencies and source code into final image
FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /usr/src/app/build build
COPY --from=prerelease /usr/src/app/package.json .

# run the app
USER bun

# initialize env vars for app execution
# secrets should be mounted here too
# VOLUME /usr/src/db/
# ENV DATABASE_URL=/usr/src/db/local.db

EXPOSE 3000/tcp
CMD [ "bun", "run", "build/index.js" ]