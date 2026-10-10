// @id: litv
// @name: LiTV
// @description: 检测 LiTV 解锁状态
// @category: media
// @regions: tw
// @tags: stream, video, live
// @priority: 36
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",r="网络",o="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",a="failed";function handler(){let n=fetch("https://www.litv.tv/api/generate-device-id",{method:"POST",headers:{"Content-Type":"application/json",Origin:"https://www.litv.tv",Referer:"https://www.litv.tv/","User-Agent":o},retry:3,timeout:15e3});if(!n||200!==n.statusCode)return{text:`${e}(${r})`,background:t,status:a,error:r};let i=safeParse(n.body).deviceId||"";if(!i)return{text:`${e}(${r})`,background:t,status:a,error:r};let s=fetch("https://proxy.svc.litv.tv/cdi/v2/rpc",{method:"POST",body:JSON.stringify({jsonrpc:"2.0",id:0,method:"CCCService.GetProgramInformation",params:{version:"2.0",project_num:"LTWEB02",device_id:i,swver:"LTWEB0210000WEB20190612185813",content_id:"VOD00328856",content_type:"drama"}}),headers:{"Content-Type":"application/json",Origin:"https://www.litv.tv",Referer:"https://www.litv.tv/drama/watch/VOD00328856","User-Agent":o},retry:3,timeout:15e3});if(!s||200!==s.statusCode)return{text:`${e}(${r})`,background:t,status:a,error:r};let d=safeParse(s.body);return d.error?{text:e,background:t,status:a}:get(d,"result.data.content_id")?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:e,background:t,status:a}}module.exports=handler;
