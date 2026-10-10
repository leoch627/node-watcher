// @id: galaxyplay
// @name: Galaxy Play
// @description: 检测 Galaxy Play 解锁状态
// @category: media
// @regions: vn
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",o="网络",a="failed";function handler(){let n=fetch("https://api.glxplay.io/account/device/new",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});return n?404===n.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:400===n.statusCode&&(0===n.body.indexOf("<")||n.body.indexOf('"errorCode": 495')>-1||n.body.indexOf("not available in your region")>-1)?{text:t,background:e,status:a}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${t}(${o})`,background:e,status:a,error:o}}module.exports=handler;
