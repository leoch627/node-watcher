// @id: peacocktv
// @name: Peacock TV
// @description: 检测 Peacock TV 解锁状态
// @category: media
// @regions: us
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",a="网络",o="failed";function handler(){let r=fetch("https://www.peacocktv.com/",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!0,retry:3,timeout:5e3});return r?(r.headers.location||"").indexOf("unavailable")>-1?{text:t,background:e,status:o}:{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:`${t}(${a})`,background:e,status:o,error:a}}module.exports=handler;
