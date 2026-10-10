// @id: fox
// @name: FOX
// @description: 检测 FOX 直播流解锁状态
// @category: media
// @regions: us
// @tags: stream, video, live
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",s="网络",a="failed";function handler(){let d=fetch("https://x-live-fox-stgec.uplynk.com/ausw/slices/8d1/d8e6eec26bf544f084bad49a7fa2eac5/8d1de292bcc943a6b886d029e6c0dc87/G00000000.ts?pbs=c61e60ee63ce43359679fb9f65d21564&cloud=aws&si=0",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});return d?200===d.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:403===d.statusCode?{text:t,background:e,status:a}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${t}(${s})`,background:e,status:a,error:s}}module.exports=handler;
