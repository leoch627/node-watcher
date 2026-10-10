// @id: karaokedam
// @name: Karaoke@DAM
// @description: 检测 Karaoke@DAM 解锁状态
// @category: media
// @regions: jp
// @tags: stream, music
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",s="网络",a="failed";function handler(){let o=fetch("http://cds1.clubdam.com/vhls-cds1/site/xbox/sample_1.mp4.m3u8",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});return o?200===o.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:403===o.statusCode?{text:e,background:t,status:a}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${e}(${s})`,background:t,status:a,error:s}}module.exports=handler;
