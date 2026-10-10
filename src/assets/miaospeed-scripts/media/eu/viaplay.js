// @id: viaplay
// @name: Viaplay
// @description: 检测 Viaplay 解锁状态
// @category: media
// @regions: eu
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="186,230,126",e="239,107,115",r="解锁",a="失败",s="网络",o="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",n="unlocked",u="failed";function handler(){let i=fetch("https://viaplay.pl",{headers:{"User-Agent":o},noRedir:!0,retry:3,timeout:5e3});if(!i)return{text:`${a}(${s})`,background:e,status:u,error:s};if(403===i.statusCode)return{text:`${a}(WAF)`,background:"253,109,20",status:"warning"};let d=i.headers.location||"";if(302===i.statusCode&&"/region-blocked"===d)return{text:a,background:e,status:u};if(302===i.statusCode&&"https://viaplay.pl/pl-pl/"===d){let i=fetch("https://viaplay.com/",{headers:{"User-Agent":o},noRedir:!0,retry:3,timeout:5e3});if(!i)return{text:`${a}(${s})`,background:e,status:u,error:s};if(404===i.statusCode)return{text:a,background:e,status:u};if(302===i.statusCode){let e=i.headers.location||"",a=e.match(/\/([a-z]{2})\//);if(a)return{text:`${r}(${a[1]})`,background:t,status:n,region:a[1]};let s=e.match(/viaplay\.([a-z]{2})/);if(s)return{text:`${r}(${s[1]})`,background:t,status:n,region:s[1]}}}return{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;
