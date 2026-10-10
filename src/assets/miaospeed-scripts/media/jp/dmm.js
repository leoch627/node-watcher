// @id: dmm
// @name: DMM TV
// @description: 检测 DMM TV 解锁状态
// @category: media
// @regions: jp
// @tags: stream, video, anime
// @priority: 41
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",n="网络",o="failed";function handler(){let r=fetch("https://api.tv.dmm.com/graphql",{method:"POST",body:JSON.stringify({query:"query FetchClient { client { isForeignAccess } }"}),headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36","Content-Type":"application/json"},retry:3,timeout:5e3});return r?r.body.indexOf('"isForeignAccess":true')>-1?{text:t,background:e,status:o}:r.body.indexOf('"isForeignAccess":false')>-1?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${t}(${n})`,background:e,status:o,error:n}}module.exports=handler;
