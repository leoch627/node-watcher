// @id: wowow
// @name: Wowow
// @description: 检测 Wowow On Demand 解锁状态
// @category: media
// @regions: jp
// @tags: stream, video
// @priority: 41
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",r="网络",a="failed";function handler(){let o=fetch("https://mapi.wowow.co.jp/api/v1/playback/auth",{method:"POST",body:JSON.stringify({meta_id:81174}),headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36","Content-Type":"application/json"},retry:3,timeout:5e3});if(!o)return{text:`${e}(${r})`,background:t,status:a,error:r};if(403===o.statusCode){let r=get(safeParse(o.body),"error.code",0);if(2055===r)return{text:e,background:t,status:a};if(2041===r||2003===r)return{text:"解锁",background:"186,230,126",status:"unlocked"}}return{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;
