FROM debian:jessie
MAINTAINER Andrew Scorpil "dev@scorpil.com"

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && \
    apt-get install \
       ca-certificates \
       curl \
       gcc \
       libc6-dev \
       libssl-dev \
       -qqy \
       --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV RUST_ARCHIVE=rust-1.12.0-x86_64-unknown-linux-gnu.tar.gz
ENV RUST_DOWNLOAD_URL=https://static.rust-lang.org/dist/$RUST_ARCHIVE

RUN mkdir /rust
WORKDIR /rust

RUN curl -fsOSL $RUST_DOWNLOAD_URL \
    && curl -s $RUST_DOWNLOAD_URL.sha256 | sha256sum -c - \
    && tar -C /rust -xzf $RUST_ARCHIVE --strip-components=1 \
    && rm $RUST_ARCHIVE \
    && ./install.sh

RUN mkdir -p /rust/app
WORKDIR /rust/app

COPY Cargo.toml .
COPY Cargo.lock .
RUN mkdir src && touch src/lib.rs && cargo build --release --lib
COPY src src
RUN cargo build --release
RUN mkdir www
COPY www www
CMD target/release/wish api:80 www
