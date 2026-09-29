FROM ubuntu:24.04

WORKDIR /app
COPY ./ /app

# Remove all .DS_Store files which exist only in OSX.
RUN find . -name .DS_Store -delete && tar czf /firefox-archive.tar.gz .

RUN install -d -o 10001 -g 10001 /data
USER 10001:10001
VOLUME /data
WORKDIR /data

HEALTHCHECK CMD test -r /firefox-archive.tar.gz
CMD ["sh", "-c", "mkdir -p ./build && cp /firefox-archive.tar.gz /data/build/firefox-archive.tar.gz"]
