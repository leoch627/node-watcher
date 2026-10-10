// @id: myvideo
// @name: MyVideo
// @description: 检测 MyVideo 线上影音 解锁状态
// @category: media
// @regions: tw
// @tags: stream, video, movie, anime
// @priority: 32
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="186,230,126",t="239,107,115",o="解锁",r="失败",n="网络",a="unlocked",d="failed";function handler(){let s=fetch("https://www.myvideo.net.tw/login.do",{method:"GET",headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!1,retry:3,timeout:15e3});if(!s||200!==s.statusCode)return{text:`${r}(${n})`,background:t,status:d,error:n};let i=s.url||"";return i.indexOf("serviceAreaBlock")>-1?{text:r,background:t,status:d}:i.indexOf("goLoginPage")>-1?{text:o,background:e,status:a}:s.body.indexOf("serviceAreaBlock")>-1?{text:r,background:t,status:d}:{text:o,background:e,status:a}}module.exports=handler;
