// @id: mxplayer
// @name: MX Player
// @description: 检测 MX Player 解锁状态
// @category: media
// @regions: in
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",r="网络",a="failed";function handler(){let n=fetch("https://www.mxplayer.in/",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});return n?403===n.statusCode?{text:`${e}(WAF)`,background:"253,109,20",status:"warning"}:200===n.statusCode?n.body.indexOf("We are currently not available in your region")>-1?{text:e,background:t,status:a}:{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:e,background:t,status:a}:{text:`${e}(${r})`,background:t,status:a,error:r}}module.exports=handler;
