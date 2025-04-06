// cache/songCache.js
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 60 * 10 }); // 10 minutes TTL

export default cache;
