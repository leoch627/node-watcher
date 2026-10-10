// @id: stan
// @name: Stan
// @description: 检测 Stan 解锁状态
// @category: media
// @regions: au
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",o="网络",s="failed";function handler(){let a=fetch("https://api.stan.com.au/login/v1/sessions/web/account",{method:"POST",body:"{}",headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36","Content-Type":"application/json"},retry:3,timeout:5e3});return a?a.body.indexOf("Access Denied")>-1||404===a.statusCode||451===a.statusCode?{text:e,background:t,status:s}:a.body.indexOf("VPNDetected")>-1?{text:`${e}(VPN)`,background:t,status:s}:400===a.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${e}(${o})`,background:t,status:s,error:o}}module.exports=handler;
