// @id: itvx
// @name: ITVX
// @description: 检测 ITVX(ITV Hub) 解锁状态
// @category: media
// @regions: uk
// @tags: stream, video, live
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="186,230,126",e="239,107,115",s="解锁",a="失败",o="网络",r="unlocked",u="failed";function handler(){let d=fetch("https://simulcast.itv.com/playlist/itvonline/ITV",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36","x-custom-headers":"true"},retry:3,timeout:5e3});return d?403===d.statusCode?{text:a,background:e,status:u}:404===d.statusCode?{text:s,background:t,status:r}:d.body.indexOf("Outside Of Allowed Geographic Region")>-1?{text:a,background:e,status:u}:d.body.indexOf("Playlist")>-1?{text:s,background:t,status:r}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${a}(${o})`,background:e,status:u,error:o}}module.exports=handler;
