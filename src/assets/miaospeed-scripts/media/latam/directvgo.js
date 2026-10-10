// @id: directvgo
// @name: DirecTV GO
// @description: 检测 DirecTV GO(拉美) 解锁状态
// @category: media
// @regions: latam
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",r="网络",s="failed";function handler(){let o=fetch("https://www.directvgo.com/registrarse",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!0,retry:3,timeout:5e3});return o?301===o.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:403===o.statusCode||200===o.statusCode?{text:e,background:t,status:s}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${e}(${r})`,background:t,status:s,error:r}}module.exports=handler;
