// @id: zdf
// @name: ZDF
// @description: 检测 ZDF 解锁状态
// @category: media
// @regions: de
// @tags: stream, video, live
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",s="网络",o="failed";function handler(){let a=fetch("https://ssl.zdf.de/geo/de/geo.txt",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:15e3});return a?200===a.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:403===a.statusCode?{text:e,background:t,status:o}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${e}(${s})`,background:t,status:o,error:s}}module.exports=handler;
