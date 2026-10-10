// @id: npostartplus
// @name: NPO Start Plus
// @description: 检测 NPO Start Plus 解锁状态
// @category: media
// @regions: nl
// @tags: stream, video, live
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="142,140,142",e="239,107,115",r="253,109,20",a="失败",n="网络",s="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",o="failed",u="warning";function handler(){let d=fetch("https://npo.nl/start/api/domain/player-token?productId=LI_NL1_4188102",{headers:{"User-Agent":s,Referer:"https://npo.nl/start/live?channel=NPO1"},retry:3,timeout:5e3});if(!d)return{text:`${a}(${n})`,background:e,status:o,error:n};if(403===d.statusCode)return{text:`${a}(WAF)`,background:r,status:u};let l=get(safeParse(d.body),"token","");if(!l)return{text:"N/A",background:t,status:"na"};let i=fetch("https://prod.npoplayer.nl/stream-link",{method:"POST",body:JSON.stringify({profileName:"dash",drmType:"playready",referrerUrl:"https://npo.nl/start/live?channel=NPO1"}),headers:{"User-Agent":s,Authorization:l,Origin:"https://npo.nl",Referer:"https://npo.nl/"},retry:3,timeout:5e3});return i?403===i.statusCode?{text:`${a}(WAF)`,background:r,status:u}:451===i.statusCode||401===i.statusCode?{text:a,background:e,status:o}:200===i.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:"N/A",background:t,status:"na"}:{text:`${a}(${n})`,background:e,status:o,error:n}}module.exports=handler;
