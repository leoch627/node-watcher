// @id: discoveryplus-us
// @name: Discovery+
// @description: 检测 Discovery+ 美国站解锁状态
// @category: media
// @regions: us
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",r="网络",s="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",o="failed";function handler(){let a=fetch("https://us1-prod-direct.discoveryplus.com/token?deviceId=d1a4a5d25212400d1e6985984604d740&realm=go&shortlived=true",{headers:{"User-Agent":s},retry:3,timeout:5e3});if(!a)return{text:`${e}(${r})`,background:t,status:o,error:r};let d=get(safeParse(a.body),"data.attributes.token","");if(!d)return{text:e,background:t,status:o};let u=fetch("https://us1-prod-direct.discoveryplus.com/users/me",{headers:{"User-Agent":s,Cookie:`st=${d}`},retry:3,timeout:5e3});if(!u)return{text:`${e}(${r})`,background:t,status:o,error:r};let n=get(safeParse(u.body),"data.attributes.currentLocationTerritory","");return"us"===n?{text:"解锁",background:"186,230,126",status:"unlocked"}:n?{text:`${e}(${n})`,background:t,status:o,region:n}:{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;
