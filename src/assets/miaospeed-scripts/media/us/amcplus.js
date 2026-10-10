// @id: amcplus
// @name: AMC+
// @description: 检测 AMC+ 解锁状态
// @category: media
// @regions: us
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="142,140,142",e="186,230,126",r="239,107,115",s="解锁",a="失败",o="网络",u="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",n="unlocked",c="failed";function handler(){let d=fetch("https://www.amcplus.com/",{headers:{"User-Agent":u},noRedir:!0,retry:3,timeout:5e3});if(!d)return{text:`${a}(${o})`,background:r,status:c,error:o};if(302===d.statusCode){let i=d.headers.location||"",l=fetch(i,{headers:{"User-Agent":u},noRedir:!0,retry:3,timeout:5e3});if(!l)return{text:`${a}(${o})`,background:r,status:c,error:o};if(301===l.statusCode){if("https://www.amcplus.com/pages/geographic-restriction"===(l.headers.location||""))return{text:a,background:r,status:c};let t=i.match(/^https:\/\/www\.amcplus\.com\/countries\/(\w{2})/),o=t?t[1]:"";return{text:`${s}${o?`(${o})`:""}`,background:e,status:n,region:o}}return{text:"N/A",background:t,status:"na"}}return 200===d.statusCode?{text:`${s}(US)`,background:e,status:n}:403===d.statusCode?{text:a,background:r,status:c}:{text:"N/A",background:t,status:"na"}}module.exports=handler;
