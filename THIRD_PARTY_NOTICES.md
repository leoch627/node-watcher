# Third-party notices

## miaospeed

Every test (scheduled health checks, unlock checks and the deep tests: latency,
speed, UDP NAT type, topology) runs on
[AirportR/miaospeed](https://github.com/AirportR/miaospeed), the maintained fork
of [miaokobot/miaospeed](https://github.com/miaokobot/miaospeed), licensed under
the GNU Affero General Public License v3.0. miaospeed uses
[mihomo](https://github.com/MetaCubeX/mihomo) (GNU General Public License v3.0)
as its proxy core; Node Watcher does not ship or run a separate mihomo binary.
The Docker image and `npm run setup:bin` install the unmodified release binary
(version pinned in `Dockerfile` and `scripts/setup-binaries.js`, verified by
SHA-256); the one-click installer deploys the unmodified
`airportr/miaospeed` Docker image on probe machines.
`src/miaospeed/protocol.js` implements its websocket protocol (request
signing, the msr-v1 reverse-connection handshake and result decoding) as
described in its source; the default request configuration mirrors its
`preconfigs/network.go`. The public build token in `protocol.js` is the one
the miaospeed README publishes for its release binaries.

## miaospeed-scripts

`src/assets/miaospeed-scripts/` contains the 162 unlock-check scripts (media,
AI, games, network, search, social) and the `index.json` catalogue of
[CloudPassenger/miaospeed-scripts](https://github.com/CloudPassenger/miaospeed-scripts)
release v1.0.0 (© 2026 CloudPassenger), licensed under the GNU Affero General
Public License v3.0 (copy in that directory). They are vendored unmodified:

- `scripts.zip` SHA-256 `0d6812b7c159a652e770194eaa426fedd56ace27e4419423e02d58b7041a32f8` (unpacked there)
- `index.json` SHA-256 `faebf0e16aa05e96831af724f367e42d75b796f8c6fc38c8fb89e6943d828be7`

The scripts are sent to miaospeed and run inside its script sandbox on the
backend, not in Node.js. `src/miaospeed/scripts.js` maps their result colours
to unlock states.

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
