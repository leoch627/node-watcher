// @id: reddit
// @name: Reddit
// @description: 检测 Reddit 是否可匿名浏览
// @category: social
// @regions: global
// @tags: social
// @priority: 11
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",o="网络",n="限流",r="failed";function handler(){let c=fetch("https://www.reddit.com/",{method:"GET",headers:{Accept:"*/*;q=0.8,application/signed-exchange;v=b3;q=0.7","Accept-Language":"en-US,en;q=0.9","Sec-CH-UA":'"Google Chrome";v="151", "Chromium";v="151", "Not_A Brand";v="8"',"Sec-CH-UA-Mobile":"?0","Sec-CH-UA-Platform":'"Windows"',"Sec-Fetch-Dest":"document","Sec-Fetch-Mode":"navigate","Sec-Fetch-Site":"none","Sec-Fetch-User":"?1","Upgrade-Insecure-Requests":"1","User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!1,retry:3,timeout:15e3});if(!c)return{text:`${t}(${o})`,background:e,status:r,error:o};let a=c.statusCode,d=c.body;return 200===a||302===a?{text:"允许",background:"186,230,126",status:"unlocked"}:403===a&&d.includes("blocked")?{text:t,background:e,status:r}:429===a?{text:`${t}(${n})`,background:e,status:r,error:n}:{text:"未知",background:"92,207,230",status:"unknown"}}module.exports=handler;
