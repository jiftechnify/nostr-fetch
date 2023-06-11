# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [0.8.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.7.0...v0.8.0) (2023-06-11)

### Bug Fixes

* add periodic auto re-connection to the default relay pool ([c974d0e](https://github.com/jiftechnify/nostr-fetch/commit/c974d0e54497be98d02ffe1494f9062b1c5d9419))
* change default debug log level (none -> warn) ([6d14042](https://github.com/jiftechnify/nostr-fetch/commit/6d1404230750c51c8da3cda25a1b6c4d0008b7e1))
* fetchTillEose impls ([ab4d6a5](https://github.com/jiftechnify/nostr-fetch/commit/ab4d6a56ece56cc5b6d05ff5ed2a9d6c4d7ec33b))
* make format specs available in DebugLogger with prefix ([ff69d0f](https://github.com/jiftechnify/nostr-fetch/commit/ff69d0f3114ec7bb74ebc6f8745c20d455b4b86a))
* reduct CloseEvent being passed to relay event lister ([e214729](https://github.com/jiftechnify/nostr-fetch/commit/e21472983bfe47c5b0bae929e617e01586afaf7d))
* replace all logForDebug with DebugLogger ([807e110](https://github.com/jiftechnify/nostr-fetch/commit/807e11028d5fc082d53623d77642b881b0ad1d23))
* use subloggers for scoped log ([297e8e4](https://github.com/jiftechnify/nostr-fetch/commit/297e8e416d564cc0160835b88202907328fc8a16))
* use subloggers for scoped log (adapters) ([8c2bd9a](https://github.com/jiftechnify/nostr-fetch/commit/8c2bd9a5e1b6d23bac97488bfd47cb2557dbac1f))

### Features

* add adapter for NDK ([6eaaf82](https://github.com/jiftechnify/nostr-fetch/commit/6eaaf82b2e98d0b5aacae3b4d24ec986f6bccf85))
* add DebugLogger class with minimum log level support ([086b139](https://github.com/jiftechnify/nostr-fetch/commit/086b1399abfc432951cb19e4767ed4a29da3370e))
* add NDK adapter example ([f8891bb](https://github.com/jiftechnify/nostr-fetch/commit/f8891bbc82739e597b3ef164185c7eececbad10f))
* fetchers now allow only signle filters per request ([dbceb8d](https://github.com/jiftechnify/nostr-fetch/commit/dbceb8da3456a3c410b0f97a5d1f50d75fbf6c85))
* improve ergonomics of initializing fetchers ([2a2070e](https://github.com/jiftechnify/nostr-fetch/commit/2a2070e691a08d57eb22d50a3cfb491e414c6a4b))
* rename closeAll -> shutdown ([7c625e3](https://github.com/jiftechnify/nostr-fetch/commit/7c625e3c347977d64368d670e34d885fcf7af9de))

# [0.7.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.6.1...v0.7.0) (2023-06-02)

### Bug Fixes

* move responsibility of relay URL normalization to `ensureRelays` ([c0e747d](https://github.com/jiftechnify/nostr-fetch/commit/c0e747d106425eaf6ba290c683a9a57409a7049c))
* options for fetchLastEvent is now reflected properly ([2009e2a](https://github.com/jiftechnify/nostr-fetch/commit/2009e2aa065f66c0b4c2c616c9e56b6ac7149417))

### Features

* add new fetchers ([32baa5b](https://github.com/jiftechnify/nostr-fetch/commit/32baa5b7e01f94659c3bebf681a40f313cdd181c))
* validate parameters for fetchers and throw if invalid ([ca4e49d](https://github.com/jiftechnify/nostr-fetch/commit/ca4e49df1cf20a64d63c727bfb493aa3e53ef5dd))

## [0.6.1](https://github.com/jiftechnify/nostr-fetch/compare/v0.6.0...v0.6.1) (2023-05-31)

### Bug Fixes

* **adapter-nostr-relaypool:** add kernel as dependency ([ae22ff2](https://github.com/jiftechnify/nostr-fetch/commit/ae22ff2bf6ec7e74a111912fda2369eddbc24894))
* **adapter-nostr-relaypool:** configure exports in package.json ([43b02d7](https://github.com/jiftechnify/nostr-fetch/commit/43b02d7aadfe65e42d2398a6906b3c396985dfa7))

# [0.6.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.5.4...v0.6.0) (2023-05-31)

### Bug Fixes

* bug in getRelayIfConnected ([9fc0afb](https://github.com/jiftechnify/nostr-fetch/commit/9fc0afb267ae6d88f35a7fd1485f1c3525a3514e))
* build config for adapter-nostr-relaypool ([3e66a6d](https://github.com/jiftechnify/nostr-fetch/commit/3e66a6d11dead9b717c8f4c20619630957c15d37))
* initiate sub auto abortion timer ([0fce069](https://github.com/jiftechnify/nostr-fetch/commit/0fce06977d376c484b78d753739e542cbb830942))
* make adapter work correctly ([619dbd2](https://github.com/jiftechnify/nostr-fetch/commit/619dbd2fb84cb2a475128756dd414c2a9b052272))

### Features

* **adapter-nostr-tools:** rewrite adapter ([4cc577a](https://github.com/jiftechnify/nostr-fetch/commit/4cc577a82af007dfdb4eb002dde33890487adee8))
* add adapter for nostr-relaypool ([4ac6bca](https://github.com/jiftechnify/nostr-fetch/commit/4ac6bcaf9558d5e78f7d870965623353dbe07245))
* add example for nostr-relaypool interop ([bf09918](https://github.com/jiftechnify/nostr-fetch/commit/bf0991816214d2cff8ae2f56cf74e676f22fc060))
* **nostr-fetch:** reimplement Fetcher based on new abstractions ([97369e6](https://github.com/jiftechnify/nostr-fetch/commit/97369e63704f16d458a12e7ec6ef90f21ed256d7))

## [0.5.4](https://github.com/jiftechnify/nostr-fetch/compare/v0.5.3...v0.5.4) (2023-05-31)

### Bug Fixes

* problem with import from ESM enabled node ([0589d6b](https://github.com/jiftechnify/nostr-fetch/commit/0589d6b3d0af69d21159fb915b186c1f848de884))
* specify files for module/types conditions in exports ([56e14c5](https://github.com/jiftechnify/nostr-fetch/commit/56e14c5386f60b9753abf7be334ca91611279e03))

## [0.5.3](https://github.com/jiftechnify/nostr-fetch/compare/v0.5.2...v0.5.3) (2023-05-18)

### Bug Fixes

* **adapter-nostr-tools:** bug in auto subscription abortion ([d3453b4](https://github.com/jiftechnify/nostr-fetch/commit/d3453b468a0957573d0a99a958fdc7bf56e32c64))

## [0.5.2](https://github.com/jiftechnify/nostr-fetch/compare/v0.5.1...v0.5.2) (2023-05-15)

### Bug Fixes

* **adapter-nostr-tools:** add means to log irregular events for debug to SimplePoolAdapter ([6ba741d](https://github.com/jiftechnify/nostr-fetch/commit/6ba741dfce3e63d73a578943c1f9acc2ed3e8839))
* **adapter-nostr-tools:** minimize nostr-tools version as peer dep ([68ed56f](https://github.com/jiftechnify/nostr-fetch/commit/68ed56fc3f513761088e8da625e9f8fd907e9443))
* **adapter-nostr-tools:** subs from SimplePoolAdatper now support auto abortion ([06e8110](https://github.com/jiftechnify/nostr-fetch/commit/06e8110bd69ae93951b47bbeb533cedfb6155a6f))
* SimplePoolAdapter now respects conenctTimeoutMs ([15034c8](https://github.com/jiftechnify/nostr-fetch/commit/15034c84ec139d6f72a18e1cc884afb53695078e))
