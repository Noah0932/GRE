import axios from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('缺少 url 参数');

    try {
        // 1. 获取代理池
        const geoNodeApi = 'https://proxylist.geonode.com/api/proxy-list?protocols=socks5&limit=20&page=1&sort_by=lastChecked&sort_type=desc';
        const proxyListRes = await axios.get(geoNodeApi, { timeout: 3000 });
        const proxies = proxyListRes.data.data;

        if (!proxies || proxies.length === 0) {
            return res.status(500).send('GeoNode API 未返回任何代理');
        }

        const MAX_RETRIES = 2; // 改为尝试 2 次
        let errorLogs = [];

        for (let i = 0; i < MAX_RETRIES; i++) {
            const randomProxy = proxies[Math.floor(Math.random() * proxies.length)];
            const proxyUrl = `socks5://${randomProxy.ip}:${randomProxy.port}`;
            const httpsAgent = new SocksProxyAgent(proxyUrl);

            try {
                // 放宽到 4000 毫秒（4秒），给免费代理一点反应时间
                const googleRes = await axios.get(targetUrl, {
                    httpsAgent,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
                    },
                    timeout: 4000 
                });

                res.setHeader('Content-Type', googleRes.headers['content-type'] || 'text/html');
                return res.status(200).send(googleRes.data);

            } catch (err) {
                // 收集这台代理的具体死因
                errorLogs.push(`[代理 ${randomProxy.ip}:${randomProxy.port}] 失败原因: ${err.message}`);
            }
        }

        // 如果全军覆没，返回包含详细日志的 JSON 供我们排错
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.status(502).send(JSON.stringify({
            message: "节点尝试均告失败",
            logs: errorLogs
        }, null, 2));

    } catch (error) {
        return res.status(500).send('外层抓取代码崩溃: ' + error.message);
    }
}