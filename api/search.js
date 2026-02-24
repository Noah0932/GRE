import axios from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('缺少 url 参数');
    }

    try {
        // 1. 获取代理池 (这里把 limit 改成了 20，减少拉取列表的耗时)
        const geoNodeApi = 'https://proxylist.geonode.com/api/proxy-list?protocols=socks5&limit=20&page=1&sort_by=lastChecked&sort_type=desc';
        const proxyListRes = await axios.get(geoNodeApi, { timeout: 2000 });
        const proxies = proxyListRes.data.data;

        if (!proxies || proxies.length === 0) {
            return res.status(500).send('获取代理池失败');
        }

        // 2. 自动重试逻辑：最多尝试 3 个不同的代理
        const MAX_RETRIES = 3;
        let lastError = '';

        for (let i = 0; i < MAX_RETRIES; i++) {
            // 随机抽取一个节点
            const randomProxy = proxies[Math.floor(Math.random() * proxies.length)];
            const proxyUrl = `socks5://${randomProxy.ip}:${randomProxy.port}`;
            const httpsAgent = new SocksProxyAgent(proxyUrl);

            try {
                // console.log(`[第 ${i+1} 次尝试] 使用代理: ${randomProxy.ip}`);
                
                // 3. 发起请求，强制 2.5 秒超时 (3次尝试 x 2.5秒 = 7.5秒，确保不会触发 Vercel 的 10秒死亡惩罚)
                const googleRes = await axios.get(targetUrl, {
                    httpsAgent,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
                    },
                    timeout: 2500 
                });

                // 只要有一次成功，立刻返回数据并终止后续循环
                res.setHeader('Content-Type', googleRes.headers['content-type'] || 'text/html');
                return res.status(200).send(googleRes.data);

            } catch (err) {
                // 记录当前失败原因，继续下一次循环
                lastError = err.message;
            }
        }

        // 3次尝试全部失败，才返回 502
        return res.status(502).send(`尝试了 ${MAX_RETRIES} 个代理均失败，最后的错误: ${lastError}`);

    } catch (error) {
        return res.status(500).send('服务端代码执行异常: ' + error.message);
    }
}