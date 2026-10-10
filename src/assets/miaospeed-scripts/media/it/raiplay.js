// @id: raiplay
// @name: RaiPlay
// @description: 检测 RaiPlay 解锁状态
// @category: media
// @regions: it
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",a="网络",r="failed";function handler(){let s=fetch("https://mediapolisvod.rai.it/relinker/relinkerServlet.htm?cont=VxXwi7UcqjApssSlashbjsAghviAeeqqEEqualeeqqEEqual&output=64",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});return s?403===s.statusCode?{text:`${e}(WAF)`,background:"253,109,20",status:"warning"}:s.body.indexOf("no_available")>-1?{text:e,background:t,status:r}:200===s.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:e,background:t,status:r}:{text:`${e}(${a})`,background:t,status:r,error:a}}module.exports=handler;
