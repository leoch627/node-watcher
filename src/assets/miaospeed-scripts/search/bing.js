// @id: bing
// @name: Bing
// @description: 检测 Bing 是否为国际版
// @category: search
// @regions: global
// @tags: search-engine, ai
// @priority: 6
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",n="网络",o="IP阻止",r="failed";function handler(){let c=fetch("https://www.bing.com/",{method:"GET",headers:{Accept:"*/*;q=0.8,application/signed-exchange;v=b3;q=0.7","Accept-Language":"en-US,en;q=0.9","Sec-CH-UA":'"Google Chrome";v="151", "Chromium";v="151", "Not_A Brand";v="8"',"Sec-CH-UA-Mobile":"?0","Sec-CH-UA-Platform":'"Windows"',"Sec-Fetch-Dest":"document","Sec-Fetch-Mode":"navigate","Sec-Fetch-Site":"none","Sec-Fetch-User":"?1","Upgrade-Insecure-Requests":"1","User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!1,retry:3,timeout:15e3});if(!c)return{text:`${t}(${n})`,background:e,status:r,error:n};let a=c.body||"",s=a.match(/Region:"([^"]*)"/),u=s&&s[1]?s[1]:"";if(200===c.statusCode){if("CN"===u)return{text:`${t}(CN)`,background:e,status:r,region:u};else if(u)return{text:`解锁(${u})`,background:"186,230,126",status:"unlocked",region:u}}return a.indexOf("cn.bing.com")>-1?{text:`${t}(CN)`,background:e,status:r}:403===c.statusCode||451===c.statusCode?{text:`${t}(${o})`,background:e,status:r,error:o}:{text:"未知",background:"92,207,230",status:"unknown"}}module.exports=handler;
