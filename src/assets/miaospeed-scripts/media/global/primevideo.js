// @id: primevideo
// @name: Amazon Prime Video
// @description: 检测 Amazon Prime Video 在当前地区是否可用
// @category: media
// @regions: global
// @tags: stream, video
// @priority: 5
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",r="网络",o="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",n="failed";function handler(){let a=fetch("https://www.primevideo.com",{method:"GET",headers:{"User-Agent":o},noRedir:!1,retry:3,timeout:5e3});if(!a)return{text:`${t}(${r})`,background:e,status:n,error:r};let i=a.body||"";if(-1===i.indexOf('"currentTerritory":')){let e=i.match(/https:\/\/www\.amazon\.[a-z.]+\/[^"'\s>]+/g)||[];for(let t=0;t<e.length;t++)if(e[t].indexOf("storefront")>-1){let r=fetch(e[t].replace(/&amp;/g,"&"),{method:"GET",headers:{"User-Agent":o},noRedir:!1,retry:2,timeout:5e3});r&&(i=r.body||"");break}}if(i.indexOf("api-services-support@amazon.com")>-1)return{text:t,background:e,status:n};let d=i.match(/"currentTerritory":"([A-Z]{2})"/),s=d?d[1]:"";return s?{text:`解锁(${s})`,background:"186,230,126",status:"unlocked",region:s}:{text:t,background:e,status:n}}module.exports=handler;
