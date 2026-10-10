// @id: discoveryplus-uk
// @name: Discovery+ UK
// @description: 检测 Discovery+ 英国站解锁状态
// @category: media
// @regions: uk
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="186,230,126",t="239,107,115",r="解锁",s="失败",a="网络",o="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",u="unlocked",d="failed";function handler(){let i=fetch("https://disco-api.discoveryplus.co.uk/token?realm=questuk&deviceId=61ee588b07c4df08c02861ecc1366a592c4ad02d08e8228ecfee67501d98bf47&shortlived=true",{headers:{"User-Agent":o},retry:3,timeout:5e3});if(!i)return{text:`${s}(${a})`,background:t,status:d,error:a};let c=get(safeParse(i.body),"data.attributes.token","");if(!c)return{text:s,background:t,status:d};let n=fetch("https://disco-api.discoveryplus.co.uk/users/me",{headers:{"User-Agent":o,Cookie:`st=${c}`},retry:3,timeout:5e3});if(!n)return{text:`${s}(${a})`,background:t,status:d,error:a};let l=get(safeParse(n.body),"data.attributes.currentLocationTerritory","");return"gb"===l?{text:r,background:e,status:u,region:l}:l?{text:`${r}(${l})`,background:e,status:u,region:l}:{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;
