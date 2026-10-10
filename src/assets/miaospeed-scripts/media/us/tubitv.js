// @id: tubitv
// @name: Tubi TV
// @description: 检测 Tubi TV 解锁状态
// @category: media
// @regions: us
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="186,230,126",e="239,107,115",r="解锁",s="失败",o="网络",u="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",a="unlocked",n="failed";function handler(){let d=fetch("https://tubitv.com",{headers:{"User-Agent":u},noRedir:!0,retry:3,timeout:5e3});if(!d)return{text:`${s}(${o})`,background:e,status:n,error:o};if(503===d.statusCode&&d.body.indexOf("geoblock")>-1)return{text:s,background:e,status:n};if(302===d.statusCode){let d=fetch("https://gdpr.tubi.tv",{headers:{"User-Agent":u},retry:3,timeout:5e3});return d?d.body.indexOf("Unfortunately")>-1?{text:s,background:e,status:n}:{text:r,background:t,status:a}:{text:`${s}(${o})`,background:e,status:n,error:o}}return 403===d.statusCode?{text:s,background:e,status:n}:200===d.statusCode?{text:r,background:t,status:a}:{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;
