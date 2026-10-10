// @id: linetv
// @name: Line TV
// @description: 检测 Line TV 解锁状态
// @category: media
// @regions: tw
// @tags: stream, video, live
// @priority: 35
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",r="网络",n="failed";function handler(){let s=fetch("https://www.linetv.tw/drama/11829/eps/1",{method:"GET",headers:{"user-agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},noRedir:!1,retry:3,timeout:15e3});if(!s)return{text:`${e}(${r})`,background:t,status:n,error:r};let o=s.body;if(-1===o.indexOf("window.__INITIAL_STATE__"))return{text:e,background:t,status:n};let a=/"eps_info"\s*:\s*\[/.test(o),d=/"durationInMs"\s*:\s*\d+/.test(o);return a&&d?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:e,background:t,status:n}}module.exports=handler;
