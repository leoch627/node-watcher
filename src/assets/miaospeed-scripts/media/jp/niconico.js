// @id: niconico
// @name: Niconico
// @description: 检测 Niconico 动画/直播 解锁状态
// @category: media
// @regions: jp
// @tags: stream, video, anime
// @priority: 41
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",o="网络",r="failed";function handler(){let n=fetch("https://www.nicovideo.jp/watch/so40278367",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});return n?n.body.indexOf("同じ地域")>-1?{text:t,background:e,status:r}:{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:`${t}(${o})`,background:e,status:r,error:o}}module.exports=handler;
