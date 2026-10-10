// @id: videoland
// @name: Videoland
// @description: 检测 Videoland 解锁状态
// @category: media
// @regions: nl
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",o="网络",n="failed";function handler(){let a=fetch("https://api.videoland.com/subscribe/videoland-account/graphql",{method:"POST",body:JSON.stringify({operationName:"IsOnboardingGeoBlocked",variables:{},query:"query IsOnboardingGeoBlocked {\n  isOnboardingGeoBlocked\n}\n"}),headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36","Content-Type":"application/json",Origin:"https://www.videoland.com",Referer:"https://www.videoland.com/"},retry:3,timeout:5e3});if(!a)return{text:`${t}(${o})`,background:e,status:n,error:o};let r=get(safeParse(a.body),"data.isOnboardingGeoBlocked",null);return null===r?{text:"N/A",background:"142,140,142",status:"na"}:r?{text:t,background:e,status:n}:{text:"解锁",background:"186,230,126",status:"unlocked"}}module.exports=handler;
