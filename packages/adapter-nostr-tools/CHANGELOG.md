# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.13.1](https://github.com/jiftechnify/nostr-fetch/compare/v0.13.0...v0.13.1) (2023-10-30)

**Note:** Version bump only for package @nostr-fetch/adapter-nostr-tools

# [0.13.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.12.2...v0.13.0) (2023-09-01)

**Note:** Version bump only for package @nostr-fetch/adapter-nostr-tools

## [0.12.2](https://github.com/jiftechnify/nostr-fetch/compare/v0.12.1...v0.12.2) (2023-07-24)

**Note:** Version bump only for package @nostr-fetch/adapter-nostr-tools

## [0.12.1](https://github.com/jiftechnify/nostr-fetch/compare/v0.12.0...v0.12.1) (2023-07-17)

**Note:** Version bump only for package @nostr-fetch/adapter-nostr-tools

# [0.12.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.11.2...v0.12.0) (2023-07-17)

### Bug Fixes

* change type of NOTICE message, fix broken tests ([09ed97f](https://github.com/jiftechnify/nostr-fetch/commit/09ed97fb145236cb4866aa053f6e7d431c06e01e))
* ignore NOTICE if it doesn't have to do with REQs by fetcher ([08c6545](https://github.com/jiftechnify/nostr-fetch/commit/08c654517eb176d20c5596bb675cd1ca8df8f62e))

### Features

* rename normalizeRelayUrls -> normalizeRelayUrlSet ([f2b5d2a](https://github.com/jiftechnify/nostr-fetch/commit/f2b5d2ae5e14d5ca84bbbec70deedc85a42d1c06))

# [0.11.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.10.1...v0.11.0) (2023-07-09)

### Bug Fixes

* make adapters' fetchTillEose conform to new requirement of interface ([2e9a17e](https://github.com/jiftechnify/nostr-fetch/commit/2e9a17ef2f22209f622c6cda630419f2f0bc978b))

## [0.10.1](https://github.com/jiftechnify/nostr-fetch/compare/v0.10.0...v0.10.1) (2023-07-05)

**Note:** Version bump only for package @nostr-fetch/adapter-nostr-tools

# [0.10.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.9.0...v0.10.0) (2023-07-04)

### Bug Fixes

* bug in subscription auto abortion of SimplePool/NDK adapter ([4fd8879](https://github.com/jiftechnify/nostr-fetch/commit/4fd8879c609bdd9cc7e5abe38b95b7b5d7a672fb))
* close subscription on notice received in SimplePool adapter ([2a26b4f](https://github.com/jiftechnify/nostr-fetch/commit/2a26b4fbaa0ff28bcf108af7c124f72e01695742))
* move "immediate abortion check" after the line that sends REQ etc ([a05e6d4](https://github.com/jiftechnify/nostr-fetch/commit/a05e6d4882642ee2331afe40a96c5e00b8aab460))
* pass subId option correctly in SimplePool adapter ([1a157b0](https://github.com/jiftechnify/nostr-fetch/commit/1a157b080b3f995d5e33c789d7b7ec3532842c23))
* write tests for adapter-nostr-tools ([1a851e9](https://github.com/jiftechnify/nostr-fetch/commit/1a851e9abb50d48698e1ce979ae95b83a8b2ed93))

### Features

* rename NostrFetcherBase to NostrFetcherBackend ([0a36def](https://github.com/jiftechnify/nostr-fetch/commit/0a36def032667b1f92124559271cdc4843aaf6ff))

# [0.9.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.8.0...v0.9.0) (2023-06-16)

**Note:** Version bump only for package @nostr-fetch/adapter-nostr-tools

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

# [0.6.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.5.4...v0.6.0) (2023-05-31)

**Note:** Version bump only for package @nostr-fetch/adapter-nostr-tools

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
* **adapter-nostr-tools:** subs from SimplePoolAdapter now support auto abortion ([06e8110](https://github.com/jiftechnify/nostr-fetch/commit/06e8110bd69ae93951b47bbeb533cedfb6155a6f))
* SimplePoolAdapter now respects connenctTimeoutMs ([15034c8](https://github.com/jiftechnify/nostr-fetch/commit/15034c84ec139d6f72a18e1cc884afb53695078e))

## [0.5.1](https://github.com/jiftechnify/nostr-fetch/compare/v0.5.0...v0.5.1) (2023-05-11)

**Note:** Version bump only for package @nostr-fetch/adapter-nostr-tools
