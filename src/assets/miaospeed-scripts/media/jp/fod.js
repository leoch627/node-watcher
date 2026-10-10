// @id: fod
// @name: FOD
// @description: 检测 FOD (Fuji TV On Demand) 解锁状态
// @category: media
// @regions: jp
// @tags: stream, video
// @priority: 41
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",o="网络",r="failed";function handler(){let n=fetch("https://geocontrol1.stream.ne.jp/fod-geo/check.xml?time=1624504256",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});return n?n.body.indexOf("true")>-1?{text:"解锁",background:"186,230,126",status:"unlocked"}:n.body.indexOf("false")>-1?{text:t,background:e,status:r}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${t}(${o})`,background:e,status:r,error:o}}module.exports=handler;
