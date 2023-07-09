# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.11.2](https://github.com/jiftechnify/nostr-fetch/compare/v0.11.1...v0.11.2) (2023-07-09)

### Bug Fixes

* tsconfig for examples ([e5e5c92](https://github.com/jiftechnify/nostr-fetch/commit/e5e5c92223328ff6d21e8fe98bc6585a03a6070b))

## [0.11.1](https://github.com/jiftechnify/nostr-fetch/compare/v0.11.0...v0.11.1) (2023-07-09)

### Bug Fixes

* tsconfig for adapter-nostr-relaypool ([be8edbc](https://github.com/jiftechnify/nostr-fetch/commit/be8edbcad549fe67293cd3cb13d2f04cab2fd7ab))

# [0.11.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.10.1...v0.11.0) (2023-07-09)

### Bug Fixes

* bug in counting runnigSubs ([1f4185d](https://github.com/jiftechnify/nostr-fetch/commit/1f4185d50f2df3084f299013077879bbfd13c72d))
* make adapters' fetchTillEose conform to new requirement of interface ([2e9a17e](https://github.com/jiftechnify/nostr-fetch/commit/2e9a17ef2f22209f622c6cda630419f2f0bc978b))

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
* bug in subscription auto abortion of SimplePool/NDK adapter ([4fd8879](https://github.com/jiftechnify/nostr-fetch/commit/4fd8879c609bdd9cc7e5abe38b95b7b5d7a672fb))
* bugs in querying supported NIPs ([4950841](https://github.com/jiftechnify/nostr-fetch/commit/4950841785d4a254d7912993145c370e79f9847c))
* close subscription on notice received in SimplePool adapter ([2a26b4f](https://github.com/jiftechnify/nostr-fetch/commit/2a26b4fbaa0ff28bcf108af7c124f72e01695742))
* handle error from sub.req/close ([e84a060](https://github.com/jiftechnify/nostr-fetch/commit/e84a0602841e686619cecef946bfa3360d4c6b39))
* make tag query field optional ([71a56a6](https://github.com/jiftechnify/nostr-fetch/commit/71a56a6fb2c767f71f2660b733374af6c2c3bfe8))
* mitigate test flakiness ([cedbca2](https://github.com/jiftechnify/nostr-fetch/commit/cedbca284248ef9e2ce984627927364357c9db96))
* move "immediate abortion check" after the line that sends REQ etc ([a05e6d4](https://github.com/jiftechnify/nostr-fetch/commit/a05e6d4882642ee2331afe40a96c5e00b8aab460))
* pass subId option correctly in SimplePool adapter ([1a157b0](https://github.com/jiftechnify/nostr-fetch/commit/1a157b080b3f995d5e33c789d7b7ec3532842c23))
* remove unnecessary codes from RelayPool impl ([b74da61](https://github.com/jiftechnify/nostr-fetch/commit/b74da61411c7d64f0e28b86dbd88ad4d69eaf3dc))
* separate interface of relay capability checking for testing ([2b1ca1f](https://github.com/jiftechnify/nostr-fetch/commit/2b1ca1fb4241c649d75505d3f0ee521182dcf365))
* throw error if time range is invalid ([528268c](https://github.com/jiftechnify/nostr-fetch/commit/528268c483f3509aad576098d9ad4286028991b8))
* write tests for adapter-ndk ([6327ee5](https://github.com/jiftechnify/nostr-fetch/commit/6327ee551df37392ca3d7854deeb18da79b962d6))
* write tests for adapter-nostr-tools ([1a851e9](https://github.com/jiftechnify/nostr-fetch/commit/1a851e9abb50d48698e1ce979ae95b83a8b2ed93))
* write tests for DefaultFetcherBase ([e2f7f19](https://github.com/jiftechnify/nostr-fetch/commit/e2f7f192b9bc76d7cabee91cd6fc8691f30dd3eb))
* write tests for fetcher helpers ([bc67fbf](https://github.com/jiftechnify/nostr-fetch/commit/bc67fbf7d39b4d8c896f31b5475495e35da34433))
* write tests for nostr-relaypool adapter ([b0aae57](https://github.com/jiftechnify/nostr-fetch/commit/b0aae57346f65aa9f4df0b84a7185099f616b497))
* write tests for NostrFetcher based on fakes ([ed06ef6](https://github.com/jiftechnify/nostr-fetch/commit/ed06ef6d602c868f4574ef74fbe879fb4e45be4e))

### Features

* add buffered events count to stats ([8093106](https://github.com/jiftechnify/nostr-fetch/commit/80931067b3d13b33ec4265647766fc3547660336))
* add fetch progress tracking ([9a51bc1](https://github.com/jiftechnify/nostr-fetch/commit/9a51bc13450ed0525a86069baf00a8d14011657e))
* add means to know on which relay an event was seen ([f70042b](https://github.com/jiftechnify/nostr-fetch/commit/f70042b96475a04ebeda336704e4be154f1da1ec))
* add newly standardized event kinds ([68252a4](https://github.com/jiftechnify/nostr-fetch/commit/68252a47f6aca6f7d7f3ec79a33ba4cf79fe5a75))
* add search example ([07b6a7f](https://github.com/jiftechnify/nostr-fetch/commit/07b6a7ffb94110388ab08ac5acd38a2cf6a8bf91))
* add support for search filter ([d145de6](https://github.com/jiftechnify/nostr-fetch/commit/d145de60f332234f7798bb40fee637ac3cc0a301))
* basic fetch statistics ([ccf60b9](https://github.com/jiftechnify/nostr-fetch/commit/ccf60b927c0a55d340415b8fc69a50e83614913d))
* change semantics of fetchers which return an async iterable ([1f08e59](https://github.com/jiftechnify/nostr-fetch/commit/1f08e5965b806ae4a79b588428e777aeb3285949))
* export type `NostrFecthError` from nostr-fetch ([6da4515](https://github.com/jiftechnify/nostr-fetch/commit/6da4515f3400f0ad080be9c6456bcdf3a2bf72a3))
* rename NostrFetcherBase to NostrFetcherBackend ([0a36def](https://github.com/jiftechnify/nostr-fetch/commit/0a36def032667b1f92124559271cdc4843aaf6ff))

# [0.9.0](https://github.com/jiftechnify/nostr-fetch/compare/v0.8.0...v0.9.0) (2023-06-16)

### Features

* add backpressure feature to Channel ([1ef5596](https://github.com/jiftechnify/nostr-fetch/commit/1ef5596ff8ac06c1dd8e6b39623329e02e53a7ad))
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

* add adapter for NDK ([6eaaf82](https://github.com/jiftechnify/nostr-fetch/commit/6eaaf82b2e98d0b5aacae3b4d24ec986f6bccf85))
* add DebugLogger class with minimum log level support ([086b139](https://github.com/jiftechnify/nostr-fetch/commit/086b1399abfc432951cb19e4767ed4a29da3370e))
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
* **adapter-nostr-tools:** subs from SimplePoolAdapter now support auto abortion ([06e8110](https://github.com/jiftechnify/nostr-fetch/commit/06e8110bd69ae93951b47bbeb533cedfb6155a6f))
* SimplePoolAdapter now respects connenctTimeoutMs ([15034c8](https://github.com/jiftechnify/nostr-fetch/commit/15034c84ec139d6f72a18e1cc884afb53695078e))
