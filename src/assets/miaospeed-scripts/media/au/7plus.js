// @id: 7plus
// @name: 7plus
// @description: 检测 7plus 解锁状态
// @category: media
// @regions: au
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",a="网络",r="failed";function handler(){let s=fetch("https://market-cdn.swm.digital/v1/market/ip/?apikey=web",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});if(!s)return{text:`${e}(${a})`,background:t,status:r,error:a};if(403===s.statusCode||451===s.statusCode)return{text:e,background:t,status:r};if(200!==s.statusCode)return{text:"N/A",background:"142,140,142",status:"na"};let n=safeParse(s.body),o=get(n,"_id",0),u=get(n,"place_name","");return 4===o?{text:"解锁(AU)",background:"186,230,126",status:"unlocked"}:{text:`${e}${u?`(${u})`:""}`,background:t,status:r,region:u}}module.exports=handler;
