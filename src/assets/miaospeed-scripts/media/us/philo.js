// @id: philo
// @name: Philo
// @description: 检测 Philo 解锁状态
// @category: media
// @regions: us
// @tags: stream, video, live
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",o="网络",r="failed";function handler(){let n=fetch("https://content-us-east-2-fastly-b.www.philo.com/geo",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});return n?n.body.indexOf("SUCCESS")>-1?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:t,background:e,status:r}:{text:`${t}(${o})`,background:e,status:r,error:o}}module.exports=handler;
