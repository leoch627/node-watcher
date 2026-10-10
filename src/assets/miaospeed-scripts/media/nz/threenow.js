// @id: threenow
// @name: ThreeNow
// @description: 检测 ThreeNow 解锁状态
// @category: media
// @regions: nz
// @tags: stream, video, live
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",s="网络",a="failed";function handler(){let r=fetch("https://bravo-livestream.fullscreen.nz/index.m3u8",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});return r?r.body.indexOf("Access Denied")>-1||403===r.statusCode||451===r.statusCode?{text:t,background:e,status:a}:200===r.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${t}(${s})`,background:e,status:a,error:s}}module.exports=handler;
