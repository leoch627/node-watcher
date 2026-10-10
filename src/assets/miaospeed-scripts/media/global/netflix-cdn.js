// @id: netflix-cdn
// @name: Netflix CDN
// @description: 检测 Netflix CDN 地理位置
// @category: media
// @regions: global
// @tags: stream, video
// @priority: 2
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",n="状态",r="IP阻止",o="failed";function handler(){var a,u,c;let s=fetch("https://api.fast.com/netflix/speedtest/v2?https=true&token=YXNkZmFzZGxmbnNkYWZoYXNkZmhrYWxm&urlCount=5",{method:"GET",headers:{Accept:"*/*;q=0.8,application/signed-exchange;v=b3;q=0.7","Accept-Language":"en-US,en;q=0.9","Sec-CH-UA":'"Google Chrome";v="151", "Chromium";v="151", "Not_A Brand";v="8"',"Sec-CH-UA-Mobile":"?0","Sec-CH-UA-Platform":'"Windows"',"Sec-Fetch-Dest":"document","Sec-Fetch-Mode":"navigate","Sec-Fetch-Site":"none","Sec-Fetch-User":"?1","Upgrade-Insecure-Requests":"1","User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!0,retry:3,timeout:15e3});if(!s)return{text:"N/A",background:"142,140,142",status:"na"};if(403===s.statusCode)return{text:`${t}(${r})`,background:e,status:o,error:r};let l=safeParse(s.body);if(!l)return{text:`${t}(${n})`,background:e,status:o,error:n};let i=null==l||null==(c=l.targets)||null==(u=c[0])||null==(a=u.location)?void 0:a.country;return i?{text:`解锁(${i})`,background:"186,230,126",status:"unlocked",region:i}:{text:"未知",background:"92,207,230",status:"unknown"}}module.exports=handler;
