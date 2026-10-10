// @id: kayosports
// @name: Kayo Sports
// @description: 检测 Kayo Sports 解锁状态
// @category: media
// @regions: au
// @tags: stream, live
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
function handler(){let e=fetch("https://kayosports.com.au",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});return!e||(e.headers["set-cookie"]||"").indexOf("geoblocked=true")>-1?{text:"失败",background:"239,107,115",status:"failed"}:200===e.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;
