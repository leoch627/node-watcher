// @id: paravi
// @name: Paravi
// @description: 检测 Paravi 解锁状态
// @category: media
// @regions: jp
// @tags: stream, video
// @priority: 41
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",a="网络",o="failed";function handler(){let r=fetch("https://api.paravi.jp/api/v1/playback/auth",{method:"POST",body:JSON.stringify({meta_id:17414,vuid:"3b64a775a4e38d90cc43ea4c7214702b",device_code:1,app_id:1}),headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36","Content-Type":"application/json"},retry:3,timeout:5e3});return r?403===r.statusCode?{text:t,background:e,status:o}:"Unauthorized"===get(safeParse(r.body),"error.type","")?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${t}(${a})`,background:e,status:o,error:a}}module.exports=handler;
