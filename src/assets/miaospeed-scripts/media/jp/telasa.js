// @id: telasa
// @name: Telasa
// @description: 检测 Telasa (KDDI) 解锁状态
// @category: media
// @regions: jp
// @tags: stream, video
// @priority: 41
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",a="网络",o="failed";function handler(){let s=fetch("https://api-videopass-anon.kddi-video.com/v1/playback/system_status",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36","X-Device-ID":"d36f8e6b-e344-4f5e-9a55-90aeb3403799"},retry:3,timeout:5e3});if(!s)return{text:`${t}(${a})`,background:e,status:o,error:a};let r=safeParse(s.body),n=get(r,"Status.Subtype",""),d=get(r,"Status.Type","");return"IPLocationNotAllowed"===n?{text:t,background:e,status:o}:d?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;
