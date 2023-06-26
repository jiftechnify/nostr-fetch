# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

# [0.9.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.8.0...v0.9.0) (2023-06-16)

### Features

* add option for enabling backpressure to allEventsIterator ([ba4c126](https://github.com/jiftechnify/nostr-fetch/commit/ba4c126dc7fa08fcdb8f267d6447d02807b99716))
* relax assertion of args to fetchers ([16ad322](https://github.com/jiftechnify/nostr-fetch/commit/16ad3220b73ddeb4f83dc76670beffe804fd9058))
* separate relay set for each authors ([41b2291](https://github.com/jiftechnify/nostr-fetch/commit/41b2291bab2ab9cbd0601fea9e73a05fea3309d4))

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

* add NDK adapter example ([f8891bb](https://github.com/jiftechnify/nostr-fetch/commit/f8891bbc82739e597b3ef164185c7eececbad10f))
* fetchers now allow only single filters per request ([dbceb8d](https://github.com/jiftechnify/nostr-fetch/commit/dbceb8da3456a3c410b0f97a5d1f50d75fbf6c85))
* improve ergonomics of initializing fetchers ([2a2070e](https://github.com/jiftechnify/nostr-fetch/commit/2a2070e691a08d57eb22d50a3cfb491e414c6a4b))
* rename closeAll -> shutdown ([7c625e3](https://github.com/jiftechnify/nostr-fetch/commit/7c625e3c347977d64368d670e34d885fcf7af9de))

# [0.7.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.6.1...v0.7.0) (2023-06-02)

### Bug Fixes

* move responsibility of relay URL normalization to `ensureRelays` ([c0e747d](https://github.com/jiftechnify/nostr-fetch/commit/c0e747d106425eaf6ba290c683a9a57409a7049c))
* options for fetchLastEvent is now reflected properly ([2009e2a](https://github.com/jiftechnify/nostr-fetch/commit/2009e2aa065f66c0b4c2c616c9e56b6ac7149417))

### Features

* add new fetchers ([32baa5b](https://github.com/jiftechnify/nostr-fetch/commit/32baa5b7e01f94659c3bebf681a40f313cdd181c))
* validate parameters for fetchers and throw if invalid ([ca4e49d](https://github.com/jiftechnify/nostr-fetch/commit/ca4e49df1cf20a64d63c727bfb493aa3e53ef5dd))

# [0.6.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.5.4...v0.6.0) (2023-05-31)

### Bug Fixes

* bug in getRelayIfConnected ([9fc0afb](https://github.com/jiftechnify/nostr-fetch/commit/9fc0afb267ae6d88f35a7fd1485f1c3525a3514e))

### Features

* **adapter-nostr-tools:** rewrite adapter ([4cc577a](https://github.com/jiftechnify/nostr-fetch/commit/4cc577a82af007dfdb4eb002dde33890487adee8))
* **nostr-fetch:** reimplement Fetcher based on new abstractions ([97369e6](https://github.com/jiftechnify/nostr-fetch/commit/97369e63704f16d458a12e7ec6ef90f21ed256d7))

## [0.5.4](https://github.com/jiftechnify/nostr-fetch/compare/v0.5.3...v0.5.4) (2023-05-31)

### Bug Fixes

* problem with import from ESM enabled node ([0589d6b](https://github.com/jiftechnify/nostr-fetch/commit/0589d6b3d0af69d21159fb915b186c1f848de884))
* specify files for module/types conditions in exports ([56e14c5](https://github.com/jiftechnify/nostr-fetch/commit/56e14c5386f60b9753abf7be334ca91611279e03))

## [0.5.2](https://github.com/jiftechnify/nostr-fetch/compare/v0.5.1...v0.5.2) (2023-05-15)

**Note:** Version bump only for package nostr-fetch

## [0.5.1](https://github.com/jiftechnify/nostr-fetch/compare/v0.5.0...v0.5.1) (2023-05-11)

**Note:** Version bump only for package nostr-fetch
