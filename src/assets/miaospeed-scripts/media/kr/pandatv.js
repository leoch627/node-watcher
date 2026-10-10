// @id: pandatv
// @name: PandaTV
// @description: 检测 PandaTV(판다TV) 解锁状态
// @category: media
// @regions: kr
// @tags: stream, live
// @priority: 41
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",a="网络",r="failed";function handler(){let o=fetch("https://api.pandalive.co.kr/v1/live/play",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});return o?400===o.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:403===o.statusCode?{text:e,background:t,status:r}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${e}(${a})`,background:t,status:r,error:a}}module.exports=handler;
