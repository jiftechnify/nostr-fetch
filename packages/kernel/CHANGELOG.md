# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.13.1](https://github.com/jiftechnify/nostr-fetch/compare/v0.13.0...v0.13.1) (2023-10-30)

**Note:** Version bump only for package @nostr-fetch/kernel

# [0.13.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.12.2...v0.13.0) (2023-09-01)

### Bug Fixes

* add standardized event kinds (NIP-52) ([34875c2](https://github.com/jiftechnify/nostr-fetch/commit/34875c264ce199356d72c8b2e883c20209cd7594))
* add standardized event kinds (NIP-72) ([e867ba7](https://github.com/jiftechnify/nostr-fetch/commit/e867ba7ecdb6221c0a5b4af3aa9adcb064ceede0))
* type of timeout ID ([1dbebe3](https://github.com/jiftechnify/nostr-fetch/commit/1dbebe3a0730d82f6b2c60206a7feb514123dfdc))

## [0.12.2](https://github.com/jiftechnify/nostr-fetch/compare/v0.12.1...v0.12.2) (2023-07-24)

### Bug Fixes

* update standardized event kinds ([5bf190d](https://github.com/jiftechnify/nostr-fetch/commit/5bf190df0d52f86d9d338d178e5a343522cc561b))

## [0.12.1](https://github.com/jiftechnify/nostr-fetch/compare/v0.12.0...v0.12.1) (2023-07-17)

**Note:** Version bump only for package @nostr-fetch/kernel

# [0.12.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.11.2...v0.12.0) (2023-07-17)

### Bug Fixes

* change type of NOTICE message, fix broken tests ([09ed97f](https://github.com/jiftechnify/nostr-fetch/commit/09ed97fb145236cb4866aa053f6e7d431c06e01e))
* ignore NOTICE if it doesn't have to do with REQs by fetcher ([08c6545](https://github.com/jiftechnify/nostr-fetch/commit/08c654517eb176d20c5596bb675cd1ca8df8f62e))
* use @noble/curves instead of @noble/secp256k1 ([2d64ac8](https://github.com/jiftechnify/nostr-fetch/commit/2d64ac8e3ed8d32bb1f9303e69083b8f2163ca0d))

### Features

* fetchLatestEventsPerKey ([cbc544f](https://github.com/jiftechnify/nostr-fetch/commit/cbc544f35586c3db217ef3e30fd6d46b15942c9a))
* rename normalizeRelayUrls -> normalizeRelayUrlSet ([f2b5d2a](https://github.com/jiftechnify/nostr-fetch/commit/f2b5d2ae5e14d5ca84bbbec70deedc85a42d1c06))

# [0.11.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.10.1...v0.11.0) (2023-07-09)

### Features

* per-relay fetch stats ([fc37872](https://github.com/jiftechnify/nostr-fetch/commit/fc378721868c0c28cc7f45db6ef8dce2b141bd7b))

# [0.10.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.9.0...v0.10.0) (2023-07-04)

### Bug Fixes

* bugs in querying supported NIPs ([4950841](https://github.com/jiftechnify/nostr-fetch/commit/4950841785d4a254d7912993145c370e79f9847c))
* make tag query field optional ([71a56a6](https://github.com/jiftechnify/nostr-fetch/commit/71a56a6fb2c767f71f2660b733374af6c2c3bfe8))

### Features

* add buffered events count to stats ([8093106](https://github.com/jiftechnify/nostr-fetch/commit/80931067b3d13b33ec4265647766fc3547660336))
* add newly standardized event kinds ([68252a4](https://github.com/jiftechnify/nostr-fetch/commit/68252a47f6aca6f7d7f3ec79a33ba4cf79fe5a75))
* add support for search filter ([d145de6](https://github.com/jiftechnify/nostr-fetch/commit/d145de60f332234f7798bb40fee637ac3cc0a301))
* rename NostrFetcherBase to NostrFetcherBackend ([0a36def](https://github.com/jiftechnify/nostr-fetch/commit/0a36def032667b1f92124559271cdc4843aaf6ff))

# [0.9.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.8.0...v0.9.0) (2023-06-16)

### Features

* add backpressure feature to Channel ([1ef5596](https://github.com/jiftechnify/nostr-fetch/commit/1ef5596ff8ac06c1dd8e6b39623329e02e53a7ad))
* add option for enabling backpressure to allEventsIterator ([ba4c126](https://github.com/jiftechnify/nostr-fetch/commit/ba4c126dc7fa08fcdb8f267d6447d02807b99716))
* separate relay set for each authors ([41b2291](https://github.com/jiftechnify/nostr-fetch/commit/41b2291bab2ab9cbd0601fea9e73a05fea3309d4))

# [0.8.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.7.0...v0.8.0) (2023-06-11)

### Bug Fixes

* make format specs available in DebugLogger with prefix ([ff69d0f](https://github.com/jiftechnify/nostr-fetch/commit/ff69d0f3114ec7bb74ebc6f8745c20d455b4b86a))
* reduct CloseEvent being passed to relay event lister ([e214729](https://github.com/jiftechnify/nostr-fetch/commit/e21472983bfe47c5b0bae929e617e01586afaf7d))
* replace all logForDebug with DebugLogger ([807e110](https://github.com/jiftechnify/nostr-fetch/commit/807e11028d5fc082d53623d77642b881b0ad1d23))
* use subloggers for scoped log ([297e8e4](https://github.com/jiftechnify/nostr-fetch/commit/297e8e416d564cc0160835b88202907328fc8a16))

### Features

* add DebugLogger class with minimum log level support ([086b139](https://github.com/jiftechnify/nostr-fetch/commit/086b1399abfc432951cb19e4767ed4a29da3370e))
* fetchers now allow only single filters per request ([dbceb8d](https://github.com/jiftechnify/nostr-fetch/commit/dbceb8da3456a3c410b0f97a5d1f50d75fbf6c85))
* improve ergonomics of initializing fetchers ([2a2070e](https://github.com/jiftechnify/nostr-fetch/commit/2a2070e691a08d57eb22d50a3cfb491e414c6a4b))
* rename closeAll -> shutdown ([7c625e3](https://github.com/jiftechnify/nostr-fetch/commit/7c625e3c347977d64368d670e34d885fcf7af9de))

# [0.7.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.6.1...v0.7.0) (2023-06-02)

### Bug Fixes

* move responsibility of relay URL normalization to `ensureRelays` ([c0e747d](https://github.com/jiftechnify/nostr-fetch/commit/c0e747d106425eaf6ba290c683a9a57409a7049c))

### Features

* add new fetchers ([32baa5b](https://github.com/jiftechnify/nostr-fetch/commit/32baa5b7e01f94659c3bebf681a40f313cdd181c))

# [0.6.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.5.4...v0.6.0) (2023-05-31)

**Note:** Version bump only for package @nostr-fetch/kernel

## [0.5.4](https://github.com/jiftechnify/nostr-fetch/compare/v0.5.3...v0.5.4) (2023-05-31)

**Note:** Version bump only for package @nostr-fetch/kernel
