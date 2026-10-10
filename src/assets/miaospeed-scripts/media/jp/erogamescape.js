// @id: erogamescape
// @name: ErogameScape
// @description: 检测 ErogameScape(エロゲー批評空間) 年龄验证解锁状态
// @category: media
// @regions: jp
// @tags: stream
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",o="failed";function handler(){let a=fetch("https://erogamescape.org/~ap2/ero/toukei_kaiseki/",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});return a&&200===a.statusCode&&a.body.indexOf("18歳")>-1?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:t,background:e,status:o}}module.exports=handler;
