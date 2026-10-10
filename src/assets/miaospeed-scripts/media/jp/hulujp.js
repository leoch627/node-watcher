// @id: hulujp
// @name: Hulu Japan
// @description: 检测 Hulu 日本站 解锁状态
// @category: media
// @regions: jp
// @tags: stream, video
// @priority: 41
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",r="网络",a="failed";function handler(){let o=fetch("https://id.hulu.jp/",{headers:{"User-Agent":"Mozilla/5.0 (Linux; Android 16; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.71 Mobile Safari/537.36"},noRedir:!0,retry:3,timeout:5e3});return o?o.headers.location&&o.headers.location.indexOf("restrict.html")>-1?{text:e,background:t,status:a}:403===o.statusCode?{text:`${e}(WAF)`,background:"253,109,20",status:"warning"}:302===o.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${e}(${r})`,background:t,status:a,error:r}}module.exports=handler;
