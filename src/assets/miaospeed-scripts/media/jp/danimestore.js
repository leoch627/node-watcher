// @id: danimestore
// @name: dアニメストア
// @description: 检测 dアニメストア(d Anime Store) 解锁状态
// @category: media
// @regions: jp
// @tags: stream, video, anime
// @priority: 41
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",o="网络",r="failed";function handler(){let n=fetch("https://animestore.docomo.ne.jp/animestore/reg_pc",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!0,retry:3,timeout:5e3});return n?n.body.indexOf("海外")>-1?{text:t,background:e,status:r}:302===n.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${t}(${o})`,background:e,status:r,error:o}}module.exports=handler;
