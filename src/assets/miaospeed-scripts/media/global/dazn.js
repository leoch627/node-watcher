// @id: dazn
// @name: Dazn
// @description: 检测 Dazn 在当前地区是否可用
// @category: media
// @regions: global
// @tags: stream, video
// @priority: 4
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",r="网络",o="响应",a="failed";function handler(){let n=fetch("https://startup.core.indazn.com/misl/v5/Startup",{method:"POST",headers:{"Content-Type":"application/json","User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},body:JSON.stringify({LandingPageKey:"generic",languages:"en-US,en",Platform:"web",PlatformAttributes:{},Manufacturer:"",PromoCode:"",Version:"2"}),noRedir:!1,retry:3,timeout:5e3});if(!n)return{text:`${e}(${r})`,background:t,status:a,error:r};if(403===n.statusCode)return{text:e,background:t,status:a};if(200!==n.statusCode)return{text:`未知(${n.statusCode})`,background:t,status:a};{let r=safeParse(n.body);if(!r)return{text:`${e}(${o})`,background:t,status:a,error:o};let s=r.Region.isAllowed,u=r.Region.GeolocatedCountry.toUpperCase();return s?{text:`解锁(${u})`,background:"186,230,126",status:"unlocked",region:u}:{text:"N/A",background:"142,140,142",status:"na"}}}module.exports=handler;
