// @id: grok
// @name: Grok
// @description: 检测 xAI Grok 在当前地区是否可用
// @category: ai
// @regions: global
// @tags: ai
// @priority: 8
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="142,140,142",e="失败",r="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",a=["CN","RU","IR","KP","CU","SY"];function handler(){let o=fetch("https://grok.com/cdn-cgi/trace",{headers:{"User-Agent":r},retry:3,timeout:5e3});if(!o||200!==o.statusCode)return{text:"N/A",background:t,status:"na"};let n=o.body.match(/loc=([A-Z]{2})/),s=n?n[1]:"",u=fetch("https://grok.com/",{headers:{"User-Agent":r},retry:3,timeout:5e3});return u?200===u.statusCode?{text:`解锁${s?`(${s})`:""}`,background:"186,230,126",status:"unlocked",region:s}:403===u.statusCode?s&&-1===a.indexOf(s)?{text:`${e}(WAF)`,background:"253,109,20",status:"warning",region:s}:{text:`${e}${s?`(${s})`:""}`,background:"239,107,115",status:"failed",region:s}:{text:"N/A",background:t,status:"na"}:{text:"N/A",background:t,status:"na"}}module.exports=handler;
