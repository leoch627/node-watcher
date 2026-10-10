// @id: channel10
// @name: 10 Play
// @description: 检测 10 Play (Channel 10) 解锁状态
// @category: media
// @regions: au
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",r="网络",a="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",o="failed";function handler(){let n=fetch("https://10play.com.au/geo-web",{headers:{"User-Agent":a},retry:3,timeout:5e3});if(!n)return{text:`${e}(${r})`,background:t,status:o,error:r};if(n.body.indexOf("Sorry, 10 play is not available in your region.")>-1)return{text:e,background:t,status:o};let s=fetch("https://e410fasadvz.global.ssl.fastly.net/geo",{headers:{"User-Agent":a},retry:3,timeout:5e3});if(!s)return{text:`${e}(${r})`,background:t,status:o,error:r};if(s.body.indexOf("not available")>-1)return{text:e,background:t,status:o};let u=safeParse(s.body),l=get(u,"allow",!1),i=get(u,"state","");return l?i?{text:`解锁(${i})`,background:"186,230,126",status:"unlocked",region:i}:{text:"N/A",background:"142,140,142",status:"na"}:{text:e,background:t,status:o}}module.exports=handler;
