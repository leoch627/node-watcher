// @id: coupangplay
// @name: Coupang Play
// @description: 检测 Coupang Play 解锁状态
// @category: media
// @regions: kr
// @tags: stream, video
// @priority: 41
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",a="网络",o="failed";function handler(){let n=fetch("https://www.coupangplay.com/",{headers:{"User-Agent":"Mozilla/5.0 (Linux; Android 16; SM-S938B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.71 Mobile Safari/537.36"},noRedir:!0,retry:3,timeout:5e3});return n?302===n.statusCode&&"https://www.coupangplay.com/not-available"===n.headers.location?{text:e,background:t,status:o}:200===n.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:403===n.statusCode?{text:`${e}(WAF)`,background:"253,109,20",status:"warning"}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${e}(${a})`,background:t,status:o,error:a}}module.exports=handler;
