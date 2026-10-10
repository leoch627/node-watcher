// @id: fxnow
// @name: FX NOW
// @description: 检测 FX NOW 解锁状态
// @category: media
// @regions: us
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",o="网络",r="failed";function handler(){let n=fetch("https://fxnow.fxnetworks.com",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});return n?n.body.indexOf("is not accessible")>-1?{text:t,background:e,status:r}:{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:`${t}(${o})`,background:e,status:r,error:o}}module.exports=handler;
