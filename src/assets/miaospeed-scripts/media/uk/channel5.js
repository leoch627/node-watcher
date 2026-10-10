// @id: channel5
// @name: Channel 5
// @description: 检测 Channel 5 解锁状态
// @category: media
// @regions: uk
// @tags: stream, video, live
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",a="网络",n="failed";function handler(){let s=fetch(`https://cassie.channel5.com/api/v2/live_media/my5desktopng/C5.json?timestamp=${Date.now()}&auth=${encodeURIComponent("0_rZDiY0hp_TNcDyk2uD-Kl40HqDbXs7hOawxyqPnbI")}`,{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});if(!s)return{text:`${t}(${a})`,background:e,status:n,error:a};if(403===s.statusCode)return{text:`${t}(WAF)`,background:"253,109,20",status:"warning"};let r=get(safeParse(s.body),"code","");return"3000"===r||s.body.indexOf("this service is only available in restricted regions")>-1?{text:t,background:e,status:n}:"4003"===r?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;
