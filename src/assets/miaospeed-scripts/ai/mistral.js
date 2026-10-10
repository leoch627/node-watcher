// @id: mistral
// @name: Mistral AI
// @description: 检测 Mistral AI 在当前地区是否可用
// @category: ai
// @regions: global
// @tags: ai
// @priority: 8
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="142,140,142",e="239,107,115",a="失败",r="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",s="failed",n=["RU","BY","KP","IR","SY","CU","CN","TM"];function handler(){let o=fetch("https://chat.mistral.ai/cdn-cgi/trace",{headers:{"User-Agent":r},retry:3,timeout:5e3});if(!o||200!==o.statusCode)return{text:"N/A",background:t,status:"na"};let d=o.body.match(/loc=([A-Z]{2})/),i=d?d[1]:"",u=fetch("https://chat.mistral.ai/",{headers:{"User-Agent":r},noRedir:!0,retry:3,timeout:5e3});return u?403===u.statusCode?{text:`${a}${i?`(${i})`:""}`,background:e,status:s,region:i}:[200,307,308].indexOf(u.statusCode)>-1?i&&-1!==n.indexOf(i)?{text:`${a}(${i})`,background:e,status:s,region:i}:{text:`解锁${i?`(${i})`:""}`,background:"186,230,126",status:"unlocked",region:i}:{text:"N/A",background:t,status:"na"}:{text:"N/A",background:t,status:"na"}}module.exports=handler;
