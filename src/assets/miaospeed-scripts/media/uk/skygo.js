// @id: skygo
// @name: Sky Go
// @description: 检测 Sky Go 英国站解锁状态
// @category: media
// @regions: uk
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",o="网络",s="failed";function handler(){let n=fetch("https://skyid.sky.com/authorise/skygo?response_type=token&client_id=sky&appearance=compact&redirect_uri=skygo://auth",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});return n?n.body.indexOf("Sign in</h3>")>-1||n.body.indexOf("skygoSignin")>-1?{text:"解锁",background:"186,230,126",status:"unlocked"}:n.body.indexOf("You don't have permission to access")>-1||n.body.indexOf("Access Denied")>-1||403===n.statusCode||200===n.statusCode?{text:t,background:e,status:s}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${t}(${o})`,background:e,status:s,error:o}}module.exports=handler;
