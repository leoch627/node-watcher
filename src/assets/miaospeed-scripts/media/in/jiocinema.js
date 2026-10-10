// @id: jiocinema
// @name: JioCinema
// @description: 检测 JioCinema 解锁状态
// @category: media
// @regions: in
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",o="网络",a="failed";function handler(){let s=fetch("https://content-jiovoot.voot.com/psapi/",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});return s?200===s.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:474===s.statusCode?{text:e,background:t,status:a}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${e}(${o})`,background:t,status:a,error:o}}module.exports=handler;
