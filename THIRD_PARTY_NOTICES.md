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
