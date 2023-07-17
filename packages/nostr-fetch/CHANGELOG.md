# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.12.1](https://github.com/jiftechnify/nostr-fetch/compare/v0.12.0...v0.12.1) (2023-07-17)

**Note:** Version bump only for package nostr-fetch

# [0.12.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.11.2...v0.12.0) (2023-07-17)

### Bug Fixes

* change type of NOTICE message, fix broken tests ([09ed97f](https://github.com/jiftechnify/nostr-fetch/commit/09ed97fb145236cb4866aa053f6e7d431c06e01e))
* ignore NOTICE if it doesn't have to do with REQs by fetcher ([08c6545](https://github.com/jiftechnify/nostr-fetch/commit/08c654517eb176d20c5596bb675cd1ca8df8f62e))

### Features

* fetchLatestEventsPerKey ([cbc544f](https://github.com/jiftechnify/nostr-fetch/commit/cbc544f35586c3db217ef3e30fd6d46b15942c9a))
* rename normalizeRelayUrls -> normalizeRelayUrlSet ([f2b5d2a](https://github.com/jiftechnify/nostr-fetch/commit/f2b5d2ae5e14d5ca84bbbec70deedc85a42d1c06))

# [0.11.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.10.1...v0.11.0) (2023-07-09)

### Bug Fixes

* bug in counting runnigSubs ([1f4185d](https://github.com/jiftechnify/nostr-fetch/commit/1f4185d50f2df3084f299013077879bbfd13c72d))

### Features

* per-relay fetch stats ([fc37872](https://github.com/jiftechnify/nostr-fetch/commit/fc378721868c0c28cc7f45db6ef8dce2b141bd7b))

## [0.10.1](https://github.com/jiftechnify/nostr-fetch/compare/v0.10.0...v0.10.1) (2023-07-05)

### Bug Fixes

* ensure connection to relays every time fetchers open new subscription ([75c230b](https://github.com/jiftechnify/nostr-fetch/commit/75c230beae463fbb3c65c51bd40c44c5b4606b6f))
* respect NIP-01's note on reconnections to relays ([d004560](https://github.com/jiftechnify/nostr-fetch/commit/d0045600837a432d31a5143654086d401ca56591))

# [0.10.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.9.0...v0.10.0) (2023-07-04)

### Bug Fixes

* add tests for default RelayPool ([d5ab10b](https://github.com/jiftechnify/nostr-fetch/commit/d5ab10b9d76038c3e2297dd4bb2feb1969cb5e82))
* add unit tests for default Relay/Subscription ([239964f](https://github.com/jiftechnify/nostr-fetch/commit/239964f3877354aba723c4cdae537f580e8b6958))
* bugs in querying supported NIPs ([4950841](https://github.com/jiftechnify/nostr-fetch/commit/4950841785d4a254d7912993145c370e79f9847c))
* handle error from sub.req/close ([e84a060](https://github.com/jiftechnify/nostr-fetch/commit/e84a0602841e686619cecef946bfa3360d4c6b39))
* mitigate test flakiness ([cedbca2](https://github.com/jiftechnify/nostr-fetch/commit/cedbca284248ef9e2ce984627927364357c9db96))
* move "immediate abortion check" after the line that sends REQ etc ([a05e6d4](https://github.com/jiftechnify/nostr-fetch/commit/a05e6d4882642ee2331afe40a96c5e00b8aab460))
* remove unnecessary codes from RelayPool impl ([b74da61](https://github.com/jiftechnify/nostr-fetch/commit/b74da61411c7d64f0e28b86dbd88ad4d69eaf3dc))
* separate interface of relay capability checking for testing ([2b1ca1f](https://github.com/jiftechnify/nostr-fetch/commit/2b1ca1fb4241c649d75505d3f0ee521182dcf365))
* throw error if time range is invalid ([528268c](https://github.com/jiftechnify/nostr-fetch/commit/528268c483f3509aad576098d9ad4286028991b8))
* write tests for DefaultFetcherBase ([e2f7f19](https://github.com/jiftechnify/nostr-fetch/commit/e2f7f192b9bc76d7cabee91cd6fc8691f30dd3eb))
* write tests for fetcher helpers ([bc67fbf](https://github.com/jiftechnify/nostr-fetch/commit/bc67fbf7d39b4d8c896f31b5475495e35da34433))
* write tests for NostrFetcher based on fakes ([ed06ef6](https://github.com/jiftechnify/nostr-fetch/commit/ed06ef6d602c868f4574ef74fbe879fb4e45be4e))

### Features

* add buffered events count to stats ([8093106](https://github.com/jiftechnify/nostr-fetch/commit/80931067b3d13b33ec4265647766fc3547660336))
* add fetch progress tracking ([9a51bc1](https://github.com/jiftechnify/nostr-fetch/commit/9a51bc13450ed0525a86069baf00a8d14011657e))
* add means to know on which relay an event was seen ([f70042b](https://github.com/jiftechnify/nostr-fetch/commit/f70042b96475a04ebeda336704e4be154f1da1ec))
* add support for search filter ([d145de6](https://github.com/jiftechnify/nostr-fetch/commit/d145de60f332234f7798bb40fee637ac3cc0a301))
* basic fetch statistics ([ccf60b9](https://github.com/jiftechnify/nostr-fetch/commit/ccf60b927c0a55d340415b8fc69a50e83614913d))
* change semantics of fetchers which return an async iterable ([1f08e59](https://github.com/jiftechnify/nostr-fetch/commit/1f08e5965b806ae4a79b588428e777aeb3285949))
* export type `NostrFecthError` from nostr-fetch ([6da4515](https://github.com/jiftechnify/nostr-fetch/commit/6da4515f3400f0ad080be9c6456bcdf3a2bf72a3))
* rename NostrFetcherBase to NostrFetcherBackend ([0a36def](https://github.com/jiftechnify/nostr-fetch/commit/0a36def032667b1f92124559271cdc4843aaf6ff))

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
