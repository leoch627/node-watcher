// @id: channel9
// @name: Channel 9
// @description: 检测 Channel 9(9Now) 解锁状态
// @category: media
// @regions: au
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",o="网络",n="failed";function handler(){let a=fetch("https://login.nine.com.au",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!0,retry:3,timeout:5e3});return a?a.body.indexOf("Geoblock")>-1||403===a.statusCode?{text:e,background:t,status:n}:a.body.indexOf("Log in to")>-1||302===a.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${e}(${o})`,background:t,status:n,error:o}}module.exports=handler;
