// @id: viu
// @name: Viu+
// @description: 检测 Viu+ 解锁状态
// @category: media
// @regions: global
// @tags: stream, video
// @priority: 8
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",r="网络",n="failed";function handler(){let o=fetch("https://www.viu.com",{method:"GET",headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!1,retry:3,timeout:15e3});if(!o||200!==o.statusCode)return{text:`${t}(${r})`,background:e,status:n,error:r};let s=o.redirects[0];if(println(o.redirects),s){let r=s.split("/")[4];return"no-service"===r?{text:t,background:e,status:n}:{text:`解锁(${r.toUpperCase()})`,background:"186,230,126",status:"unlocked",region:r}}return{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;
