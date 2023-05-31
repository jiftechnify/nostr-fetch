# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

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
