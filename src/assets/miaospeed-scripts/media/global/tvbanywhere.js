// @id: tvbanywhere
// @name: TVB Anywhere
// @description: 检测 TVB Anywhere 解锁状态
// @category: media
// @regions: global
// @tags: stream, video
// @priority: 8
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
function handler(){let t=fetch("https://uapisfm.tvbanywhere.com.sg/geoip/check/platform/android",{headers:{"User-Agent":"Mozilla/5.0 (Linux; Android 16; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.71 Mobile Safari/537.36"},noRedir:!1,retry:3,timeout:15e3});if(!t)return{text:"N/A",background:"142,140,142",status:"na"};if(200!==t.statusCode)return{text:"未知",background:"92,207,230",status:"unknown"};{let e=safeParse(t.body),r=e.country;return"HK"===r||e.allow_in_this_country?{text:`解锁(${r})`,background:"186,230,126",status:"unlocked",region:r}:{text:`失败(${r})`,background:"239,107,115",status:"failed",region:r}}}module.exports=handler;
