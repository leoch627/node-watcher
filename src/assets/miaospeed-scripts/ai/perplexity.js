// @id: perplexity
// @name: Perplexity
// @description: 检测 Perplexity AI 在当前地区是否可用
// @category: ai
// @regions: global
// @tags: ai
// @priority: 8
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="142,140,142",e="239,107,115",r="失败",a="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",n="failed",o=["CN","RU","IR","KP","CU","SY"];function handler(){let s=fetch("https://www.perplexity.ai/cdn-cgi/trace",{headers:{"User-Agent":a},retry:3,timeout:5e3});if(!s||200!==s.statusCode)return{text:"N/A",background:t,status:"na"};let i=s.body.match(/loc=([A-Z]{2})/),u=i?i[1]:"",d=!!u&&o.indexOf(u)>-1,c=fetch("https://www.perplexity.ai/",{headers:{"User-Agent":a},retry:3,timeout:5e3});return c?403===c.statusCode?d?{text:`${r}${u?`(${u})`:""}`,background:e,status:n,region:u}:{text:`${r}(WAF)`,background:"253,109,20",status:"warning",region:u}:d?{text:`${r}${u?`(${u})`:""}`,background:e,status:n,region:u}:{text:`解锁${u?`(${u})`:""}`,background:"186,230,126",status:"unlocked",region:u}:{text:"N/A",background:t,status:"na"}}module.exports=handler;
