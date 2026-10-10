// @id: ofiii
// @name: Ofiii
// @description: 检测 Ofiii(原 CATCHPLAY 旗下线上影音) 解锁状态
// @category: media
// @regions: tw
// @tags: stream, video
// @priority: 33
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",a="网络",d="failed";function handler(){let i=fetch("https://cdi.ofiii.com/ofiii_cdi/video/urls?device_type=pc&device_id=b4e377ac-8870-43a4-957a-07f95549a03d&media_type=comic&asset_id=vod68157-020020M001&project_num=OFWEB00&puid=dcafe020-e335-49fb-b9c7-52bd9a15c305",{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36"},retry:3,timeout:5e3});return i?200===i.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:400===i.statusCode||403===i.statusCode?{text:t,background:e,status:d}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${t}(${a})`,background:e,status:d,error:a}}module.exports=handler;
