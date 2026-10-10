// @id: jcomondemand
// @name: J:COM On Demand
// @description: 检测 J:COM オンデマンド 解锁状态
// @category: media
// @regions: jp
// @tags: stream, video
// @priority: 41
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",o="网络",r="failed";function handler(){let a=fetch("https://linkvod.myjcom.jp/auth/login",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!1,retry:3,timeout:5e3});return a?403===a.statusCode||502===a.statusCode?{text:e,background:t,status:r}:{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:`${e}(${o})`,background:t,status:r,error:o}}module.exports=handler;
