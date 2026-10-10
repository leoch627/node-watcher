// @id: tver
// @name: TVer
// @description: 检测 TVer 解锁状态
// @category: media
// @regions: jp
// @tags: stream, video
// @priority: 41
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",s="网络",a="failed";function handler(){let r=fetch("https://playback.api.streaks.jp/v1/projects/tver-simul-ntv/medias/ref:simul-ntv",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36","x-streaks-api-key":"ntv"},retry:3,timeout:5e3});return r?200===r.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:403===r.statusCode?{text:e,background:t,status:a}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${e}(${s})`,background:t,status:a,error:s}}module.exports=handler;
