// @id: tving
// @name: Tving
// @description: 检测 Tving 的解锁状态
// @category: media
// @regions: kr
// @tags: stream, ott
// @priority: 50
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",a="网络",o="failed";function handler(){let d=fetch("https://api.tving.com/v2a/media/stream/info?apiKey=1e7952d0917d6aab1f0293a063697610&mediaCode=RV60891248",{method:"GET",headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!1,retry:3,timeout:15e3});return d&&200===d.statusCode?"000"===get(safeParse(d.body),"body.result.code")?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:t,background:e,status:o}:{text:`${t}(${a})`,background:e,status:o,error:a}}module.exports=handler;
