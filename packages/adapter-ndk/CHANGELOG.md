# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.14.1](https://github.com/jiftechnify/nostr-fetch/compare/v0.14.0...v0.14.1) (2023-12-14)

### Bug Fixes

* **adapter-ndk:** bump minimum supported NDK version to 1.0.0 ([1138901](https://github.com/jiftechnify/nostr-fetch/commit/11389019fc32065b6d4663c086f324b8763c0ceb))

# [0.14.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.13.1...v0.14.0) (2023-12-14)

### Bug Fixes

* make adapters aware of the skipFilterMatching option ([461431c](https://github.com/jiftechnify/nostr-fetch/commit/461431cadc173bfbce18448d1121c6d5eb1adc73))

## [0.13.1](https://github.com/jiftechnify/nostr-fetch/compare/v0.13.0...v0.13.1) (2023-10-30)

**Note:** Version bump only for package @nostr-fetch/adapter-ndk

# [0.13.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.12.2...v0.13.0) (2023-09-01)

**Note:** Version bump only for package @nostr-fetch/adapter-ndk

## [0.12.2](https://github.com/jiftechnify/nostr-fetch/compare/v0.12.1...v0.12.2) (2023-07-24)

**Note:** Version bump only for package @nostr-fetch/adapter-ndk

## [0.12.1](https://github.com/jiftechnify/nostr-fetch/compare/v0.12.0...v0.12.1) (2023-07-17)

**Note:** Version bump only for package @nostr-fetch/adapter-ndk

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

**Note:** Version bump only for package @nostr-fetch/adapter-ndk

# [0.10.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.9.0...v0.10.0) (2023-07-04)

### Bug Fixes

* bug in subscription auto abortion of SimplePool/NDK adapter ([4fd8879](https://github.com/jiftechnify/nostr-fetch/commit/4fd8879c609bdd9cc7e5abe38b95b7b5d7a672fb))
* move "immediate abortion check" after the line that sends REQ etc ([a05e6d4](https://github.com/jiftechnify/nostr-fetch/commit/a05e6d4882642ee2331afe40a96c5e00b8aab460))
* write tests for adapter-ndk ([6327ee5](https://github.com/jiftechnify/nostr-fetch/commit/6327ee551df37392ca3d7854deeb18da79b962d6))

### Features

* rename NostrFetcherBase to NostrFetcherBackend ([0a36def](https://github.com/jiftechnify/nostr-fetch/commit/0a36def032667b1f92124559271cdc4843aaf6ff))

# [0.9.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.8.0...v0.9.0) (2023-06-16)

**Note:** Version bump only for package @nostr-fetch/adapter-ndk

# [0.8.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.7.0...v0.8.0) (2023-06-11)

### Features

* add adapter for NDK ([6eaaf82](https://github.com/jiftechnify/nostr-fetch/commit/6eaaf82b2e98d0b5aacae3b4d24ec986f6bccf85))
* add NDK adapter example ([f8891bb](https://github.com/jiftechnify/nostr-fetch/commit/f8891bbc82739e597b3ef164185c7eececbad10f))
