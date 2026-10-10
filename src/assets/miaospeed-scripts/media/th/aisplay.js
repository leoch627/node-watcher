// @id: aisplay
// @name: AIS Play
// @description: 检测 AIS Play 解锁状态
// @category: media
// @regions: th
// @tags: stream, video, live
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",r="网络",s="failed";function handler(){let a=fetch("https://49-231-37-237-rewriter.ais-vidnt.com/ais/play/origin/VOD/playlist/ais-yMzNH1-bGUxc/index.m3u8",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});if(!a)return{text:`${e}(${r})`,background:t,status:s,error:r};if(403===a.statusCode||451===a.statusCode)return{text:e,background:t,status:s};if(200===a.statusCode&&a.body.indexOf("X-Geo-Protection-System-Status")>-1){if(a.body.indexOf("ALLOW")>-1)return{text:"解锁",background:"186,230,126",status:"unlocked"};if(a.body.indexOf("BLOCK")>-1)return{text:e,background:t,status:s}}return{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;
