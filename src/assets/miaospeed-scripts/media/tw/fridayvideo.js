// @id: fridayvideo
// @name: friDay 影音
// @description: 检测 friDay 影音 (video.friday.tw) 解锁状态
// @category: media
// @regions: tw
// @tags: stream, video
// @priority: 33
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",r="网络",n="failed";function handler(){let a=fetch("https://video.friday.tw/api2/streaming/get?streamingId=122581&streamingType=2&contentType=4&contentId=1&clientId=",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});if(!a)return{text:`${t}(${r})`,background:e,status:n,error:r};let o=get(safeParse(a.body),"code","");return"1006"===o?{text:t,background:e,status:n}:"0000"===o?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:"N/A",background:"142,140,142",status:"na"}}module.exports=handler;
