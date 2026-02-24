import axios from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';

export default async function handler(req, res) {
    // 允许跨域
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('缺少 url 参数');
    }

    try {
        // 1. 获取 GeoNode SOCKS5 代理池
        const geoNodeApi = 'https://proxylist.geonode.com/api/proxy-list?protocols=socks5&limit=50&page=1&sort_by=lastChecked&sort_type=desc';
        const proxyListRes = await axios.get(geoNodeApi);
        const proxies = proxyListRes.data.data;

        if (!proxies || proxies.length === 0) {
            return res.status(500).send('获取代理池失败');
        }

        // 2. 随机抽取一个代理
        const randomProxy = proxies[Math.floor(Math.random() * proxies.length)];
        const proxyUrl = `socks5://${randomProxy.ip}:${randomProxy.port}`;
        
        const httpsAgent = new SocksProxyAgent(proxyUrl);

        // 3. 通过代理向 Google 发起请求
        const googleRes = await axios.get(targetUrl, {
            httpsAgent,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
            },
            // 【关键】Vercel 免费版函数超时限制为 10 秒，需设置更短的超时防止函数崩溃
            timeout: 8500 
        });

        // 4. 返回获取到的 HTML
        res.setHeader('Content-Type', googleRes.headers['content-type'] || 'text/html');
        res.status(200).send(googleRes.data);

    } catch (error) {
        // 如果当前代理失效（常见情况），返回 502 让 Worker 知道
        res.status(502).send('代理请求失败: ' + error.message);
    }
}