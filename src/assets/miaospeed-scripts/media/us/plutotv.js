// @id: plutotv
// @name: Pluto TV
// @description: 检测 Pluto TV 解锁状态
// @category: media
// @regions: us
// @tags: stream, video, live
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",r="网络",o="failed";function handler(){let n=fetch("https://pluto.tv/",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});return n?n.body.indexOf("thanks-for-watching")>-1?{text:e,background:t,status:o}:{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:`${e}(${r})`,background:t,status:o,error:r}}module.exports=handler;
