// @id: skych
// @name: Sky CH
// @description: 检测 Sky Switzerland 解锁状态
// @category: media
// @regions: ch
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="186,230,126",e="239,107,115",r="解锁",s="失败",o="网络",a="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",u="unlocked",n="failed";function handler(){let d=fetch("https://gateway.prd.sky.ch/user/customer/create",{headers:{"User-Agent":a},retry:3,timeout:5e3});if(!d)return{text:`${s}(${o})`,background:e,status:n,error:o};if(403===d.statusCode)return'{"message": "", "code": "GEO_BLOCKED"}'===d.body?{text:s,background:e,status:n}:{text:`${s}(WAF)`,background:"253,109,20",status:"warning"};if(405===d.statusCode)return{text:r,background:t,status:u};let i=fetch("https://sky.ch/",{headers:{"User-Agent":a},retry:3,timeout:5e3});return i?i.body.indexOf("out-of-country")>-1||i.body.indexOf("Are you using a VPN")>-1||i.body.indexOf("Are you using a Proxy or similar Anonymizer technics")>-1?{text:s,background:e,status:n}:200===i.statusCode?{text:r,background:t,status:u}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${s}(${o})`,background:e,status:n,error:o}}module.exports=handler;
