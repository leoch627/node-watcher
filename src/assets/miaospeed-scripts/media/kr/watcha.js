// @id: watcha
// @name: Watcha
// @description: 检测 Watcha 解锁状态
// @category: media
// @regions: kr
// @tags: stream, video
// @priority: 41
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="186,230,126",e="239,107,115",r="解锁",a="失败",s="网络",o="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36",u="unlocked",n="failed";function handler(){let d=fetch("https://watcha.com/api/aio_browses/tvod/all?size=3",{headers:{"User-Agent":o},retry:3,timeout:5e3});if(!d)return{text:`${a}(${s})`,background:e,status:n,error:s};if(451===d.statusCode)return{text:a,background:e,status:n};let i=fetch("https://watcha.com/browse/theater",{headers:{"User-Agent":o},noRedir:!0,retry:3,timeout:5e3});if(!i)return{text:`${a}(${s})`,background:e,status:n,error:s};if(451===i.statusCode)return{text:a,background:e,status:n};if(403===i.statusCode)return{text:`${a}(WAF)`,background:"253,109,20",status:"warning"};if(200===i.statusCode)return{text:`${r}(KR)`,background:t,status:u};if(302===i.statusCode){let e=i.headers.location||"";if("/ja-JP/browse/theater"===e)return{text:`${r}(JP)`,background:t,status:u};if("/ko-KR/browse/theater"===e)return{text:`${r}(KR)`,background:t,status:u}}return{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;
