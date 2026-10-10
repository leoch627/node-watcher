// @id: hoytv
// @name: 香港開電視
// @description: 检测 HoyTV / 香港開電視 解锁状态
// @category: media
// @regions: hk
// @tags: stream, video
// @priority: 20
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",o="网络",r="failed";function handler(){let a=fetch("https://hoytv-live-stream.hoy.tv/ch78/index-fhd.m3u8",{method:"GET",headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!1,retry:3,timeout:15e3});return a?403===a.statusCode?{text:e,background:t,status:r}:200===a.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${e}(${o})`,background:t,status:r,error:o}}module.exports=handler;
