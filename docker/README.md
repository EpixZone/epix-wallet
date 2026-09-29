# Firefox build containers

These containers build or copy artifacts and run as an unprivileged user.
When writing to a bind mount, use the host user's UID and GID:

```sh
docker run --rm --user "$(id -u):$(id -g)" -v "$(pwd):/data" builder
```

The builder accepts configuration through BuildKit secrets instead of Docker
build arguments. For example, export `KEPLR_EXT_ETHEREUM_ENDPOINT` in the shell
and pass `--secret id=KEPLR_EXT_ETHEREUM_ENDPOINT,env=KEPLR_EXT_ETHEREUM_ENDPOINT`
to `docker build`. The release workflow lists every supported setting.

Use `docker build --no-cache` when configuration changes. BuildKit does not
invalidate cached steps when a secret value changes.

The configuration is available only during the build step and is not stored in
image environment metadata. Any value compiled into the extension is still
public client configuration. Do not supply privileged server credentials.
