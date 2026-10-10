// @id: soop
// @name: SOOP
// @description: 检测 SOOP(原 AfreecaTV) 解锁状态
// @category: media
// @regions: kr
// @tags: stream, video, live
// @priority: 41
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="网络";function handler(){let t=fetch("https://vod.sooplive.co.kr/player/97464151",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});return t?t.statusCode>=200&&t.statusCode<400?{text:"解锁",background:"186,230,126",status:"unlocked"}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`失败(${e})`,background:"239,107,115",status:"failed",error:e}}module.exports=handler;
