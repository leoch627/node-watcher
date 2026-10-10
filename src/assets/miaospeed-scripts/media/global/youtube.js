// @id: youtube
// @name: YouTube
// @description: 检测 YouTube Premium 在当前地区是否可用
// @category: media
// @regions: global
// @tags: stream, video
// @priority: 4
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",n="网络",o="failed",r=[/id=["']country-code["'][^>]*>\s*([A-Za-z]{2,3})\s*</,/"GL"\s*:\s*"([A-Za-z]{2})"/,/"countryCode"\s*:\s*"([A-Za-z]{2})"/,/"country_code"\s*:\s*"([A-Za-z]{2})"/];function handler(){let u=fetch("https://www.youtube.com/premium?hl=en",{method:"GET",headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!1,retry:3,timeout:15e3});if(!u)return{text:`${t}(${n})`,background:e,status:o,error:n};let i=u.body||"",a=i.toLowerCase();if(a.indexOf("www.google.cn")>-1)return{text:`${t}(CN)`,background:e,status:o};let s=function(e){for(let t=0;t<r.length;t++){let n=e.match(r[t]);if(n&&n[1])return n[1].toUpperCase()}return""}(i);return a.indexOf("youtube premium is not available in your country")>-1||a.indexOf("premium is not available in your country")>-1||a.indexOf("premium is not available in your region")>-1?{text:`${t}${s?`(${s})`:""}`,background:e,status:o,region:s}:200===u.statusCode&&(a.indexOf("youtube premium")>-1||a.indexOf("ad-free")>-1||a.indexOf('"browseid":"spunlimited"')>-1)?{text:`解锁${s?`(${s})`:""}`,background:"186,230,126",status:"unlocked",region:s}:{text:"未知",background:"92,207,230",status:"unknown"}}module.exports=handler;
