// @id: metaai
// @name: Meta.AI
// @description: 检测 Meta AI 在当前地区是否可用
// @category: ai
// @regions: global
// @tags: ai
// @priority: 9
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="186,230,126",t="239,107,115",o="解锁",r="失败",a="网络",n="unlocked",s="failed",u={Accept:"*/*;q=0.8,application/signed-exchange;v=b3;q=0.7","Accept-Language":"en-US,en;q=0.9","Sec-CH-UA":'"Google Chrome";v="151", "Chromium";v="151", "Not_A Brand";v="8"',"Sec-CH-UA-Mobile":"?0","Sec-CH-UA-Platform":'"Windows"',"Sec-Fetch-Dest":"document","Sec-Fetch-Mode":"navigate","Sec-Fetch-Site":"none","Sec-Fetch-User":"?1","Upgrade-Insecure-Requests":"1","User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"};function i(e){let t=e.match(/"code"\s*:\s*"([^"]*)"/),o=t?t[1]:"";if(!o)return"";if(o.indexOf("_")>-1){let e=o.split("_");return e.length>=2?e[1]:""}return o.length<10?o:""}function handler(){let d=fetch("https://www.meta.ai/ajax",{method:"GET",headers:u,noRedir:!1,retry:3,timeout:5e3});if(!d)return{text:`${r}(${a})`,background:t,status:s,error:a};if(200===d.statusCode)return{text:r,background:t,status:s};if(400===d.statusCode||404===d.statusCode){let t="",r=fetch("https://www.meta.com/legal/",{method:"GET",headers:u,noRedir:!1,retry:2,timeout:5e3});if(r){let e;t=(e=r.url.replace(/^https?:\/\/[^/]+/,"").match(/^\/([a-zA-Z]{2})\/legal/))?e[1].toUpperCase():""}return{text:t?`${o}(${t})`:o,background:e,status:n,region:t}}let c=fetch("https://www.meta.ai/",{method:"GET",headers:u,noRedir:!1,retry:3,timeout:5e3});if(!c)return{text:o,background:e,status:n};if(403===d.statusCode){let t="";return 200===c.statusCode&&(t=i(c.body)),{text:t?`${o}(${t})`:o,background:e,status:n,region:t}}let l=c.body||"";if(l.indexOf("GeoBlockedErrorRoot")>-1)return{text:r,background:t,status:s};if(l.indexOf("AbraHomeRoot.react")>-1||l.indexOf("AbraHomeRootConversationQuery")>-1||l.indexOf("HomeRootQuery")>-1||l.indexOf("AbraRateLimitedErrorRoot")>-1||l.indexOf("KadabraRootContainer")>-1){let t=i(l);return{text:t?`${o}(${t})`:o,background:e,status:n,region:t}}return 200===c.statusCode?{text:o,background:e,status:n}:{text:r,background:t,status:s}}module.exports=handler;
