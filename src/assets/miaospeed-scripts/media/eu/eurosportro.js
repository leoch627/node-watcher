// @id: eurosportro
// @name: Eurosport 罗马尼亚
// @description: 检测 Eurosport 罗马尼亚站解锁状态
// @category: media
// @regions: eu
// @tags: stream, live
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="142,140,142",t="239,107,115",r="失败",o="网络",s="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",n="failed";function handler(){let u=`${Date.now()}-device`,a=fetch("https://eu3-prod-direct.eurosport.ro/token?realm=eurosport",{headers:{"User-Agent":s,Origin:"https://www.eurosport.ro",Referer:"https://www.eurosport.ro/","x-device-info":`escom/0.295.1 (unknown/unknown; Windows/10; ${u})`,"x-disco-client":"WEB:UNKNOWN:escom:0.295.1"},retry:3,timeout:5e3});if(!a)return{text:`${r}(${o})`,background:t,status:n,error:o};let d=get(safeParse(a.body),"data.attributes.token","");if(!d)return{text:"N/A",background:e,status:"na"};let i=fetch("https://eu3-prod-direct.eurosport.ro/playback/v2/videoPlaybackInfo/sourceSystemId/eurosport-vid2133403?usePreAuth=true",{headers:{"User-Agent":s,Authorization:`Bearer ${d}`},retry:3,timeout:5e3});return i?i.body.indexOf("access.denied.geoblocked")>-1?{text:r,background:t,status:n}:i.body.indexOf("eurosport-vod")>-1?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:"N/A",background:e,status:"na"}:{text:`${r}(${o})`,background:t,status:n,error:o}}module.exports=handler;
