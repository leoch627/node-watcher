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
