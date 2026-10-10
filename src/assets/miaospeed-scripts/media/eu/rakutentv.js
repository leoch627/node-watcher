// @id: rakutentv-eu
// @name: Rakuten TV 欧洲
// @description: 检测 Rakuten TV 欧洲站解锁状态
// @category: media
// @regions: eu
// @tags: stream, video
// @priority: 45
/*!
 * Copyright (C) 2026 CloudPassenger
 * SPDX-License-Identifier: AGPL-3.0-only
 */
const e="239,107,115",t="失败",d="网络",a="failed";function handler(){let i=fetch("https://gizmo.rakuten.tv/v3/me/start?device_identifier=web&device_stream_audio_quality=2.0&device_stream_hdr_type=NONE&device_stream_video_quality=FHD",{method:"POST",body:JSON.stringify({device_identifier:"web",device_metadata:{app_version:"v5.5.22",audio_quality:"2.0",brand:"chrome",firmware:"XX.XX.XX",hdr:!1,model:"GENERIC",os:"Android OS",sdk:"112.0.0",serial_number:"not implemented",trusted_uid:!1,uid:"ab0dd3e8-5cae-4ad2-ba86-97af867e75c3",video_quality:"FHD",year:1970},ifa_id:"b9c55e58-d5d0-41ed-becb-a54499731531"}),headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.76 Safari/537.36","Content-Type":"application/json"},retry:3,timeout:5e3});return i?406===i.statusCode?{text:`${t}(WAF)`,background:"253,109,20",status:"warning"}:200===i.statusCode?{text:"解锁",background:"186,230,126",status:"unlocked"}:i.body.indexOf("forbidden_market")>-1?{text:t,background:e,status:a}:i.body.indexOf("forbidden_vpn")>-1?{text:`${t}(VPN)`,background:e,status:a}:{text:"N/A",background:"142,140,142",status:"na"}:{text:`${t}(${d})`,background:e,status:a,error:d}}module.exports=handler;
