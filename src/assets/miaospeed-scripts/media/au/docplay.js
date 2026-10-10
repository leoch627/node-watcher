// @id: docplay
// @name: DocPlay
// @description: 检测 DocPlay 解锁状态
// @category: media
// @regions: au
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="186,230,126",e="239,107,115",o="解锁",a="失败",s="网络",r="unlocked",d="failed";function handler(){let n=fetch("https://www.docplay.com/subscribe",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!0,retry:3,timeout:5e3});return n?n.body.indexOf("DocPlay hasn't launched in your part of the world yet.")>-1?{text:a,background:e,status:d}:307===n.statusCode?(n.headers.location||"").indexOf("geoblocked")>-1?{text:a,background:e,status:d}:{text:o,background:t,status:r}:303===n.statusCode||200===n.statusCode?{text:o,background:t,status:r}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${a}(${s})`,background:e,status:d,error:s}}module.exports=handler;
