FROM scorpil/rust:stable

RUN apt-get update && \
    apt-get install \
       libssl-dev \
       -qqy \
       --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

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
