// @id: hotstar
// @name: Hotstar
// @description: 检测 Disney+ Hotstar 在当前地区是否可用
// @category: media
// @regions: global
// @tags: stream, video
// @priority: 40
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",r="网络",s="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",a="failed";function handler(){let o=fetch("https://api.hotstar.com/o/v1/page/1557?offset=0&size=20&tao=0&tas=20",{headers:{"User-Agent":s},retry:3,timeout:5e3});if(!o)return{text:`${e}(${r})`,background:t,status:a,error:r};if(475===o.statusCode)return{text:e,background:t,status:a};if(472===o.statusCode||473===o.statusCode||474===o.statusCode)return{text:`${e}(WAF)`,background:"253,109,20",status:"warning"};if(401===o.statusCode){let o=fetch("https://www.hotstar.com",{headers:{"User-Agent":s},noRedir:!0,retry:3,timeout:5e3});if(!o)return{text:`${e}(${r})`,background:t,status:a,error:r};if(301===o.statusCode)return{text:e,background:t,status:a};let u=(o.headers.location||"").split("/"),n=u.length>3?u[3]:"";return n?{text:`解锁(${n})`,background:"186,230,126",status:"unlocked",region:n}:{text:e,background:t,status:a}}return{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;
