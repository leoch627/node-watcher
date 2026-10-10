// @id: molotov
// @name: Molotov
// @description: 检测 Molotov 解锁状态
// @category: media
// @regions: fr
// @tags: stream, video, live
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",a="网络",o="failed";function handler(){let r=fetch("https://fapi.molotov.tv/v1/open-europe/is-france",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});return r?502===r.statusCode?{text:`${e}(WAF)`,background:"253,109,20",status:"warning"}:200!==r.statusCode?{text:e,background:t,status:o}:get(safeParse(r.body),"is_france",!1)?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${e}(${a})`,background:t,status:o,error:a}}module.exports=handler;
