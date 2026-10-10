// @id: zee5
// @name: Zee5
// @description: 检测 Zee5 在当前地区是否可用
// @category: media
// @regions: global
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",r="网络",o="failed";function handler(){let a=fetch("https://www.zee5.com/global",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});if(!a)return{text:`${t}(${r})`,background:e,status:o,error:r};if(403===a.statusCode)return{text:t,background:e,status:o};let n=(a.headers["set-cookie"]||"").match(/country=([A-Z]{2})/);return n?{text:`解锁(${n[1]})`,background:"186,230,126",status:"unlocked",region:n[1]}:{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;
