// @id: crave
// @name: Crave
// @description: 检测 Crave 解锁状态
// @category: media
// @regions: ca
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",o="网络",a="failed";function handler(){let n=fetch("https://capi.9c9media.com/destinations/se_atexace/platforms/desktop/bond/contents/2205173/contentpackages/4279732/manifest.mpd",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});return n?n.body.indexOf("Geo Constraint Restrictions")>-1||404===n.statusCode?{text:e,background:t,status:a}:n.body.indexOf("video.9c9media.com")>-1?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${e}(${o})`,background:t,status:a,error:o}}module.exports=handler;
