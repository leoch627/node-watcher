// @id: mewatch
// @name: meWATCH
// @description: 检测 meWATCH 解锁状态
// @category: media
// @regions: sg
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",s="网络",r="failed";function handler(){let a=fetch("https://cdn.mewatch.sg/api/items/97098/videos?delivery=stream%2Cprogressive&ff=idp%2Cldp%2Crpt%2Ccd&lang=en&resolution=External&segments=all",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});return a?200===a.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:403===a.statusCode?{text:t,background:e,status:r}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${t}(${s})`,background:e,status:r,error:s}}module.exports=handler;
