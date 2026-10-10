// @id: joyn
// @name: Joyn
// @description: 检测 Joyn 解锁状态
// @category: media
// @regions: de
// @tags: stream, video, live
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="142,140,142",t="239,107,115",n="失败",o="网络",a="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",r="failed";function handler(){let s=fetch("https://auth.joyn.de/auth/anonymous",{method:"POST",body:JSON.stringify({client_id:"b74b9f27-a994-4c45-b7eb-5b81b1c856e7",client_name:"web",anon_device_id:"b74b9f27-a994-4c45-b7eb-5b81b1c856e7"}),headers:{"User-Agent":a,"Content-Type":"application/json"},retry:3,timeout:5e3});if(!s)return{text:`${n}(${o})`,background:t,status:r,error:o};let i=get(safeParse(s.body),"access_token","");if(!i)return{text:"N/A",background:e,status:"na"};let d=fetch("https://api.joyn.de/content/entitlement-token",{method:"POST",body:JSON.stringify({content_id:"daserste-de-hd",content_type:"LIVE"}),headers:{"User-Agent":a,"Content-Type":"application/json",Authorization:`Bearer ${i}`,"x-api-key":"36lp1t4wto5uu2i2nk57ywy9on1ns5yg"},retry:3,timeout:5e3});return d?d.body.indexOf("ENT_AssetNotAvailableInCountry")>-1?{text:n,background:t,status:r}:get(safeParse(d.body),"entitlement_token","")?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:"N/A",background:e,status:"na"}:{text:`${n}(${o})`,background:t,status:r,error:o}}module.exports=handler;
