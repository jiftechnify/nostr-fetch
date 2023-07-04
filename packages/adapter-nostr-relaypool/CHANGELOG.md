# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [0.10.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.9.0...v0.10.0) (2023-07-04)

### Bug Fixes

* write tests for nostr-relaypool adapter ([b0aae57](https://github.com/jiftechnify/nostr-fetch/commit/b0aae57346f65aa9f4df0b84a7185099f616b497))

### Features

* rename NostrFetcherBase to NostrFetcherBackend ([0a36def](https://github.com/jiftechnify/nostr-fetch/commit/0a36def032667b1f92124559271cdc4843aaf6ff))

# [0.9.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.8.0...v0.9.0) (2023-06-16)

**Note:** Version bump only for package @nostr-fetch/adapter-nostr-relaypool

# [0.8.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.7.0...v0.8.0) (2023-06-11)

### Bug Fixes

* change default debug log level (none -> warn) ([6d14042](https://github.com/jiftechnify/nostr-fetch/commit/6d1404230750c51c8da3cda25a1b6c4d0008b7e1))
* fetchTillEose impls ([ab4d6a5](https://github.com/jiftechnify/nostr-fetch/commit/ab4d6a56ece56cc5b6d05ff5ed2a9d6c4d7ec33b))
* replace all logForDebug with DebugLogger ([807e110](https://github.com/jiftechnify/nostr-fetch/commit/807e11028d5fc082d53623d77642b881b0ad1d23))
* use subloggers for scoped log (adapters) ([8c2bd9a](https://github.com/jiftechnify/nostr-fetch/commit/8c2bd9a5e1b6d23bac97488bfd47cb2557dbac1f))

### Features

* fetchers now allow only single filters per request ([dbceb8d](https://github.com/jiftechnify/nostr-fetch/commit/dbceb8da3456a3c410b0f97a5d1f50d75fbf6c85))
* improve ergonomics of initializing fetchers ([2a2070e](https://github.com/jiftechnify/nostr-fetch/commit/2a2070e691a08d57eb22d50a3cfb491e414c6a4b))
* rename closeAll -> shutdown ([7c625e3](https://github.com/jiftechnify/nostr-fetch/commit/7c625e3c347977d64368d670e34d885fcf7af9de))

# [0.7.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.6.1...v0.7.0) (2023-06-02)

### Bug Fixes

* move responsibility of relay URL normalization to `ensureRelays` ([c0e747d](https://github.com/jiftechnify/nostr-fetch/commit/c0e747d106425eaf6ba290c683a9a57409a7049c))

## [0.6.1](https://github.com/jiftechnify/nostr-fetch/compare/v0.6.0...v0.6.1) (2023-05-31)

### Bug Fixes

* **adapter-nostr-relaypool:** add kernel as dependency ([ae22ff2](https://github.com/jiftechnify/nostr-fetch/commit/ae22ff2bf6ec7e74a111912fda2369eddbc24894))
* **adapter-nostr-relaypool:** configure exports in package.json ([43b02d7](https://github.com/jiftechnify/nostr-fetch/commit/43b02d7aadfe65e42d2398a6906b3c396985dfa7))

# [0.6.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.5.4...v0.6.0) (2023-05-31)

### Bug Fixes

* build config for adapter-nostr-relaypool ([3e66a6d](https://github.com/jiftechnify/nostr-fetch/commit/3e66a6d11dead9b717c8f4c20619630957c15d37))
* initiate sub auto abortion timer ([0fce069](https://github.com/jiftechnify/nostr-fetch/commit/0fce06977d376c484b78d753739e542cbb830942))
