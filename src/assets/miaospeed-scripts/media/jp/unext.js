// @id: unext
// @name: U-NEXT
// @description: 检测 U-NEXT 解锁状态
// @category: media
// @regions: jp
// @tags: stream, video
// @priority: 41
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",a="网络",o="failed";function handler(){let r=fetch("https://cc.unext.jp",{method:"POST",body:JSON.stringify({operationName:"cosmo_getPlaylistUrl",variables:{code:"ED00479780",playMode:"caption",bitrateLow:192,bitrateHigh:null,validationOnly:!1},query:"query cosmo_getPlaylistUrl($code: String, $playMode: String, $bitrateLow: Int, $bitrateHigh: Int, $validationOnly: Boolean) { webfront_playlistUrl(code: $code, playMode: $playMode, bitrateLow: $bitrateLow, bitrateHigh: $bitrateHigh, validationOnly: $validationOnly) { resultStatus } }"}),headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36","Content-Type":"application/json"},retry:3,timeout:5e3});if(!r)return{text:`${e}(${a})`,background:t,status:o,error:a};let i=get(safeParse(r.body),"data.webfront_playlistUrl.resultStatus",0);return i?200===i||475===i?{text:"解锁",background:"186,230,126",status:"unlocked"}:467===i?{text:e,background:t,status:o}:{text:"N/A",background:"142,140,142",status:"na"}:{text:e,background:t,status:o}}module.exports=handler;
