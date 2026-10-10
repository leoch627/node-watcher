// @id: radiko
// @name: Radiko
// @description: 检测 Radiko 网络电台解锁状态
// @category: media
// @regions: jp
// @tags: stream, radio
// @priority: 41
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",a="网络",r="failed";function handler(){let o=fetch(`https://radiko.jp/area?_=${Date.now()}`,{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});return o?o.body.indexOf('class="OUT"')>-1?{text:t,background:e,status:r}:o.body.indexOf("JAPAN")>-1?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:t,background:e,status:r}:{text:`${t}(${a})`,background:e,status:r,error:a}}module.exports=handler;
