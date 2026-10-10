// @id: lemino
// @name: Lemino
// @description: 检测 Lemino (原 docomo anime store) 解锁状态
// @category: media
// @regions: jp
// @tags: stream, video
// @priority: 41
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const t="239,107,115",e="失败",a="网络",l="failed";function handler(){let o=fetch("https://if.lemino.docomo.ne.jp/v1/user/delivery/watch/ready",{method:"POST",body:JSON.stringify({inflow_flows:[null,"crid://plala.iptvf.jp/group/b100ce3"],play_type:1,key_download_only:null,quality:null,groupcast:null,avail_status:"1",terminal_type:3,test_account:0,content_list:[{kind:"main",service_id:null,cid:"00lm78dz30",lid:"a0lsa6kum1",crid:"crid://plala.iptvf.jp/vod/0000000000_00lm78dymn",preview:0,trailer:0,auto_play:0,stop_position:0}]}),headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36","Content-Type":"application/json","x-service-token":"f365771afd91452fa279863f240c233d","x-trace-id":"556db33f-d739-4a82-84df-dd509a8aa179"},retry:3,timeout:5e3});return o?200===o.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:403===o.statusCode?{text:e,background:t,status:l}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${e}(${a})`,background:t,status:l,error:a}}module.exports=handler;
