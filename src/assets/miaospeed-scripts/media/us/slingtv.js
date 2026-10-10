// @id: slingtv
// @name: Sling TV
// @description: 检测 Sling TV 解锁状态
// @category: media
// @regions: us
// @tags: stream, video, live
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",r="网络",o="failed",a={USA:"US",CAN:"CA",GBR:"GB",MEX:"MX",AUS:"AU",DEU:"DE",FRA:"FR",ITA:"IT",ESP:"ES",JPN:"JP",KOR:"KR",CHN:"CN",IND:"IN",BRA:"BR"};function handler(){let s=fetch("https://p-geo.movetv.com/geo",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});if(!s)return{text:`${t}(${r})`,background:e,status:o,error:r};let n=safeParse(s.body),u=get(n,"ip_restricted",!1),d=get(n,"country",""),c=a[(d||"").toUpperCase()]||d;return d?u?{text:`${t}(${c})`,background:e,status:o,region:c}:{text:`解锁(${c})`,background:"186,230,126",status:"unlocked",region:c}:{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;
