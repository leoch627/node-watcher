// @id: dstv
// @name: DSTV
// @description: 检测 DSTV Now 解锁状态
// @category: media
// @regions: africa
// @tags: stream, video, live
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="186,230,126",e="239,107,115",s="解锁",a="失败",o="网络",r="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",u="unlocked",n="failed";function handler(){let d=fetch("https://now.dstv.com/",{headers:{"User-Agent":r},retry:3,timeout:5e3});if(d){if(451===d.statusCode||403===d.statusCode)return{text:a,background:e,status:n};if(200===d.statusCode||404===d.statusCode)return{text:s,background:t,status:u}}let c=fetch("https://authentication.dstv.com/favicon.ico",{headers:{"User-Agent":r},retry:3,timeout:5e3});return c?403===c.statusCode||451===c.statusCode?{text:a,background:e,status:n}:404===c.statusCode?{text:s,background:t,status:u}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${a}(${o})`,background:e,status:n,error:o}}module.exports=handler;
