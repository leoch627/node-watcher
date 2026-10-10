// @id: starz
// @name: Starz
// @description: 检测 Starz 解锁状态
// @category: media
// @regions: us
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",r="网络",s="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",a="failed";function handler(){let o=fetch("https://www.starz.com/sapi/header/v1/starz/us/109448574b2147ccbc494b429ff5ef1b",{headers:{"User-Agent":s,Referer:"https://www.starz.com/us/en/"},retry:3,timeout:5e3});if(!o)return{text:`${e}(${r})`,background:t,status:a,error:r};if(403===o.statusCode)return{text:`${e}(WAF)`,background:"253,109,20",status:"warning"};let n=fetch("https://auth.starz.com/api/v4/User/geolocation",{headers:{"User-Agent":s,AuthTokenAuthorization:o.body,BestAvailableToken:"true",Origin:"https://www.starz.com",Referer:"https://www.starz.com/"},retry:3,timeout:5e3});if(!n)return{text:`${e}(${r})`,background:t,status:a,error:r};let u=safeParse(n.body);return get(u,"IsAllowedAccess",!1)&&get(u,"IsAllowedCountry",!1)&&!get(u,"IsKnownProxy",!1)?{text:"解锁",background:"186,230,126",status:"unlocked"}:u?{text:e,background:t,status:a}:{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;
