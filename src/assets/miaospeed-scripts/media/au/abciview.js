// @id: abciview
// @name: ABC iview
// @description: 检测 ABC iview 解锁状态
// @category: media
// @regions: au
// @tags: stream, video, live
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",a="网络",s="failed";function handler(){let i=fetch("https://api.iview.abc.net.au/v2/show/abc-kids-live-stream/video/LS1604H001S00?embed=highlightVideo,selectedSeries",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});return i?i.body.indexOf("unavailable outside Australia")>-1||451===i.statusCode?{text:t,background:e,status:s}:200===i.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${t}(${a})`,background:e,status:s,error:a}}module.exports=handler;
