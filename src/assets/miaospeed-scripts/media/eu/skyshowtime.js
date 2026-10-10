// @id: skyshowtime
// @name: SkyShowtime
// @description: 检测 SkyShowtime 解锁状态
// @category: media
// @regions: eu
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",r="网络",s="failed";function handler(){let a=fetch("https://www.skyshowtime.com/",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!0,retry:3,timeout:5e3});if(!a)return{text:`${e}(${r})`,background:t,status:s,error:r};if(403===a.statusCode)return{text:`${e}(WAF)`,background:"253,109,20",status:"warning"};if(307===a.statusCode){let r=a.headers.location||"";if("https://www.skyshowtime.com/where-can-i-stream"===r)return{text:e,background:t,status:s};let o=r.match(/^https:\/\/www\.skyshowtime\.com\/([a-z]{2})\?/);return o?{text:`解锁(${o[1]})`,background:"186,230,126",status:"unlocked",region:o[1]}:{text:e,background:t,status:s}}return{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;
