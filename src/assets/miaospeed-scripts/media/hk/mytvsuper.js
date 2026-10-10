// @id: mytvsuper
// @name: TVB
// @description: 检测 TVB 本地内容 解锁状态
// @category: media
// @regions: hk
// @tags: stream, video
// @priority: 20
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",s="failed";function handler(){let a=fetch("https://www.mytvsuper.com/api/auth/getSession/self/",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!1,retry:3,timeout:5e3});return a?403===a.statusCode?{text:e,background:t,status:s}:200!==a.statusCode?{text:"未知",background:"92,207,230",status:"unknown"}:1===safeParse(a.body).region?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:e,background:t,status:s}:{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;
