// @id: channel4
// @name: Channel 4
// @description: 检测 Channel 4 解锁状态
// @category: media
// @regions: uk
// @tags: stream, video, live
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",a="网络",s="failed";function handler(){let n=fetch("https://www.channel4.com/simulcast/channels/C4",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});return n?403===n.statusCode?{text:e,background:t,status:s}:200===n.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${e}(${a})`,background:t,status:s,error:a}}module.exports=handler;
