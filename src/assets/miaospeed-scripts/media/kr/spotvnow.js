// @id: spotvnow
// @name: SPOTV NOW
// @description: 检测 SPOTV NOW 解锁状态
// @category: media
// @regions: kr
// @tags: stream, video, live
// @priority: 41
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",o="网络",s="failed";function handler(){let a=fetch("https://edge.api.brightcove.com/playback/v1/accounts/5764318566001/videos/6349973203112",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",Accept:"application/json;pk=BCpkADawqM0U3mi_PT566m5lvtapzMq3Uy7ICGGjGB6v4Ske7ZX_ynzj8ePedQJhH36nym_5mbvSYeyyHOOdUsZovyg2XlhV6rRspyYPw_USVNLaR0fB_AAL2HSQlfuetIPiEzbUs1tpNF9NtQxt3BAPvXdOAsvy1ltLPWMVzJHiw9slpLRgI2NUufc",Origin:"https://www.spotvnow.co.kr",Referer:"https://www.spotvnow.co.kr/"},retry:3,timeout:5e3});return a?a.body.indexOf("CLIENT_GEO")>-1||403===a.statusCode?{text:e,background:t,status:s}:200===a.statusCode||404===a.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${e}(${o})`,background:t,status:s,error:o}}module.exports=handler;
