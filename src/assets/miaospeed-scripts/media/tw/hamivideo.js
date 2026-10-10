// @id: hamivideo
// @name: Hami Video
// @description: 检测 Hami Video 解锁状态
// @category: media
// @regions: tw
// @tags: stream, video, live
// @priority: 33
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",r="网络",o="解析",a="failed";function handler(){let d=fetch("https://hamivideo.hinet.net/api/play.do?id=OTT_VOD_0000249064&freeProduct=1",{method:"GET",headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!1,retry:3,timeout:15e3});if(!d||200!==d.statusCode)return{text:`${t}(${r})`,background:e,status:a,error:r};let n=d.body,s=safeParse(n);return n&&s?"06001-107"===(s.code||"00000-000")?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:t,background:e,status:a}:{text:`${t}(${o})`,background:e,status:a,error:o}}module.exports=handler;
