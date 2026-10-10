// @id: binge
// @name: Binge
// @description: 检测 Binge 解锁状态
// @category: media
// @regions: au
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",a="网络",o="failed";function handler(){let s=fetch("https://auth.streamotion.com.au",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!0,retry:3,timeout:5e3});return s?403===s.statusCode||451===s.statusCode?{text:e,background:t,status:o}:302===s.statusCode||200===s.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${e}(${a})`,background:t,status:o,error:a}}module.exports=handler;
