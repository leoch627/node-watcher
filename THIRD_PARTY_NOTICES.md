# Third-party notices

## RegionRestrictionCheck

Parts of `src/services/media.js` are adapted from the service detection logic in
[lmc999/RegionRestrictionCheck](https://github.com/lmc999/RegionRestrictionCheck),
which is licensed under the GNU Affero General Public License v3.0.

The adapted implementation covers Netflix title classification, Disney+ device
availability, YouTube Premium region signals, Prime Video territory signals, and
ChatGPT web/mobile availability. It was rewritten from Bash to JavaScript and
modified to run each check through the Mihomo proxy selected for an individual
node. The upstream `check.sh` revision inspected on 2026-09-01 had SHA-256:

`9c0ec7f81a39743c91df9636924f7b308b96fbc038b84b95040d6eb48f8da8cd`

Copyright remains with the upstream contributors. See `LICENSE` for the license
terms that apply to this combined work.

## xykt/RegionRestrictionCheck

The TikTok and HBO Max checks, the region-specific checks in
`src/services/regionalMedia.js` (Abema, KKTV, Bilibili HK/MO/TW, Viu TV,
Bahamut Anime) and the "native vs DNS unlock" distinction follow the approach of
[xykt/RegionRestrictionCheck](https://github.com/xykt/RegionRestrictionCheck),
licensed under the GNU Affero General Public License v3.0. They were rewritten
in JavaScript. The native/DNS verdict is computed differently: upstream inspects
the local resolver, while this project compares the client IP echoed by each
platform with the node's exit IP, because the relevant resolver is on the proxy
server. The upstream `check.sh` revision consulted on 2026-10-09 had SHA-256:

`a86f9330744ed05cbd110d76d606ddf0aedbcdf6e160f99c28e6ad07fd214359`

## miaospeed

Deep tests (latency, speed, UDP NAT type, topology) run on
[AirportR/miaospeed](https://github.com/AirportR/miaospeed), the maintained fork
of [miaokobot/miaospeed](https://github.com/miaokobot/miaospeed), licensed under
the GNU Affero General Public License v3.0. The Docker image and
`npm run setup:bin` install the unmodified release binary (version pinned in
`Dockerfile` and `scripts/setup-binaries.js`, verified by SHA-256).
`src/miaospeed/protocol.js` implements its websocket protocol (request
signing, the msr-v1 reverse-connection handshake and result decoding) as
described in its source; the default request configuration mirrors its
`preconfigs/network.go`. The public build token in `protocol.js` is the one
the miaospeed README publishes for its release binaries.

## Twemoji

`src/assets/flags.json` contains the country-flag graphics of
[Twemoji](https://github.com/jdecked/twemoji) (© Twitter, Inc and other
contributors), licensed under CC-BY 4.0
(https://creativecommons.org/licenses/by/4.0/), taken from the npm package
`@twemoji/svg` 15.0.0 (MIT, © 2023 Samuel Kopp; tarball integrity
`sha512-ZSPef2B6nBaYnfgdTbAy4jgW95o7pi2xPGwGCU+WMTxo7J6B1lMPTWwSq/wTuiMq+N0khQ90CcvYp1wFoQpo/w==`).
The SVGs were only minified (whitespace) and keyed by ISO 3166 code.

The report layouts follow the result images of the Koipy and
[FullTClash](https://github.com/AirportR/fulltclash) Telegram bots; no code was
taken from either.
