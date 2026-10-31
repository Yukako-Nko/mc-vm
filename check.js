process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || "64";

import axios from "axios";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import fs from "fs";
import path from "path";

const CONCURRENCY = 100;
const FETCH_TIMEOUT = 10000;
const CHECK_TIMEOUT = 2500;
const HARD_TIMEOUT = CHECK_TIMEOUT + 500;
const OUTPUT_DIR = "proxy-list";
const CHECK_TARGET = "https://api.ipify.org";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

const SOURCES = [
  {
    name: "ProxyScrape HTTP",
    type: "http",
    url:
      "https://api.proxyscrape.com/v3/free-proxy-list/get?request=displayproxies&proxy_format=protocolipport&format=text&protocol=http&timeout=10000",
  },
  {
    name: "ProxyScrape SOCKS4",
    type: "socks4",
    url:
      "https://api.proxyscrape.com/v3/free-proxy-list/get?request=displayproxies&proxy_format=protocolipport&format=text&protocol=socks4&timeout=10000",
  },
  {
    name: "ProxyScrape SOCKS5",
    type: "socks5",
    url:
      "https://api.proxyscrape.com/v3/free-proxy-list/get?request=displayproxies&proxy_format=protocolipport&format=text&protocol=socks5&timeout=10000",
  },
  {
    name: "GeoNode",
    type: "json",
    url:
      "https://proxylist.geonode.com/api/proxy-list?protocols=http,https,socks4,socks5&limit=500&page=1&sort_by=lastChecked&sort_type=desc",
  },
  {
    name: "HProxy",
    type: "mixed",
    url: "https://hproxy.com/api/proxy-list?format=txt",
  },
  {
    name: "Free Proxy List",
    type: "http",
    url: "https://free-proxy-list.net/",
  },
  {
    name: "SSL Proxies",
    type: "https",
    url: "https://www.sslproxies.org/",
  },
  {
    name: "SOCKS Proxy",
    type: "socks",
    url: "https://www.socks-proxy.net/",
  },
  {
    name: "UK Proxy",
    type: "http",
    url: "https://free-proxy-list.net/uk-proxy.html",
  },
  {
    name: "US Proxy",
    type: "http",
    url: "https://free-proxy-list.net/us-proxy.html",
  },
  ["https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt", "http"],
  ["https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks4.txt", "socks4"],
  ["https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt", "socks5"],
  ["https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt", "http"],
  ["https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt", "http"],
  ["https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/https.txt", "https"],
  ["https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks4.txt", "socks4"],
  ["https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks5.txt", "socks5"],
  ["https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt", "http"],
  ["https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks4.txt", "socks4"],
  ["https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt", "socks5"],
  ["https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-http.txt", "http"],
  ["https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks4.txt", "socks4"],
  ["https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-socks5.txt", "socks5"],
  ["https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt", "https"],
  ["https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS4_RAW.txt", "socks4"],
  ["https://raw.githubusercontent.com/roosterkid/openproxylist/main/SOCKS5_RAW.txt", "socks5"],
  ["https://raw.githubusercontent.com/6yyn/free-proxy-list/main/http.txt", "http"],
  ["https://raw.githubusercontent.com/6yyn/free-proxy-list/main/https.txt", "https"],
  ["https://raw.githubusercontent.com/nguyenduytan/NDT-Proxy-Scraper/refs/heads/main/http.txt", "http"],
  ["https://raw.githubusercontent.com/dinoz0rg/proxy-list/refs/heads/main/checked_proxies/http.txt", "http"],
  ["https://raw.githubusercontent.com/sunny9577/proxy-scraper/refs/heads/master/proxies.txt", "mixed"],
].map((source) => Array.isArray(source)
  ? { name: source[0], type: source[1], url: source[0] }
  : source);

let uncaughtCount = 0;

function isValidIpPort(value) {
  const match = value.match(/^(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})$/);
  if (!match) return false;

  const ipOk = match[1].split(".").every((part) => {
    const n = Number(part);
    return n >= 0 && n <= 255;
  });

  const port = Number(match[2]);
  return ipOk && port >= 1 && port <= 65535;
}

function normalizeProxy(value, fallbackType = "http") {
  let proxy = String(value || "").trim();
  if (!proxy) return null;

  proxy = proxy.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  proxy = proxy.split(/\s+/)[0].replace(/\/+$/, "");

  if (!isValidIpPort(proxy)) return null;

  const protocol =
    fallbackType === "https" ? "https" :
    fallbackType === "socks4" ? "socks4" :
    fallbackType === "socks5" ? "socks5" :
    "http";

  return `${protocol}://${proxy}`;
}

function extractIpPorts(text) {
  const found = new Set();
  const regex = /(\d{1,3}(?:\.\d{1,3}){3})\s*[:\t]\s*(\d{1,5})/g;

  for (const match of text.matchAll(regex)) {
    const candidate = `${match[1]}:${match[2]}`;
    if (isValidIpPort(candidate)) found.add(candidate);
  }

  return [...found];
}

function parseMixedProxySource(text) {
  const proxies = [];
  const lines = String(text).split(/\r?\n/);

  for (const line of lines) {
    const value = line.trim();
    if (!value || value.startsWith("#")) continue;

    const protocolMatch = value.match(
      /^(https?|socks4|socks5|socks4a|socks5h):\/\//i
    );

    if (protocolMatch) {
      const protocol = protocolMatch[1].toLowerCase();
      const type =
        protocol === "socks4a" ? "socks4" :
        protocol === "socks5h" ? "socks5" :
        protocol;

      const candidate = normalizeProxy(value, type);
      if (candidate) proxies.push(candidate);
      continue;
    }

    const ipPortMatch = value.match(
      /(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})/
    );

    if (!ipPortMatch) continue;

    const candidate = `${ipPortMatch[1]}:${ipPortMatch[2]}`;

    for (const type of ["http", "socks4", "socks5"]) {
      const normalized = normalizeProxy(candidate, type);
      if (normalized) proxies.push(normalized);
    }
  }

  return proxies;
}

function parseTextSource(text, type) {
  const proxies = [];

  for (const line of String(text).split(/\r?\n/)) {
    const value = line.trim();
    if (!value || value.startsWith("#")) continue;

    const candidate = normalizeProxy(value, type);
    if (candidate) proxies.push(candidate);
  }

  if (!proxies.length) {
    for (const ipPort of extractIpPorts(text)) {
      const candidate = normalizeProxy(ipPort, type);
      if (candidate) proxies.push(candidate);
    }
  }

  return proxies;
}

async function fetchSource(source) {
  try {
    const response = await axios.get(source.url, {
      timeout: FETCH_TIMEOUT,
      headers: HEADERS,
      responseType: "text",
      validateStatus: () => true,
    });

    if (response.status !== 200 || !response.data) {
      console.warn(`[!] ${source.name}: HTTP ${response.status}`);
      return [];
    }

    if (source.type === "json") {
      let data;
      try {
        data = typeof response.data === "string"
          ? JSON.parse(response.data)
          : response.data;
      } catch {
        return [];
      }

      const result = [];
      for (const item of data?.data || []) {
        const ip = item?.ip;
        const port = item?.port;
        const protocols = Array.isArray(item?.protocols) ? item.protocols : [];
        if (!ip || !port) continue;

        for (const protocol of protocols) {
          const type = String(protocol).toLowerCase();
          if (!["http", "https", "socks4", "socks5"].includes(type)) continue;
          const candidate = normalizeProxy(`${ip}:${port}`, type);
          if (candidate) result.push(candidate);
        }
      }
      return result;
    }

    if (source.type === "mixed") {
      return parseMixedProxySource(response.data);
    }

    return parseTextSource(response.data, source.type);
  } catch (error) {
    console.warn(`[!] ${source.name}: ${error.message}`);
    return [];
  }
}

function createProxyAgent(proxyUrl) {
  const protocol = new URL(proxyUrl).protocol;
  const opts = {
    keepAlive: false,
    maxSockets: 1,
    maxFreeSockets: 0,
    timeout: CHECK_TIMEOUT,
  };

  if (protocol === "socks4:" || protocol === "socks4a:") {
    return new SocksProxyAgent(proxyUrl, opts);
  }

  if (protocol === "socks5:" || protocol === "socks5h:") {
    return new SocksProxyAgent(proxyUrl, opts);
  }

  if (protocol === "https:") {
    return new HttpsProxyAgent(proxyUrl, opts);
  }

  return new HttpProxyAgent(proxyUrl, opts);
}

function destroyAgent(agent) {
  if (!agent) return;
  try {
    if (typeof agent.destroy === "function") agent.destroy();
  } catch {}

  for (const key of ["sockets", "freeSockets", "requests"]) {
    const bucket = agent[key];
    if (!bucket || typeof bucket !== "object") continue;
    for (const k of Object.keys(bucket)) {
      const value = bucket[k];
      if (Array.isArray(value)) {
        for (const sock of value) {
          try { sock.destroy(); } catch {}
        }
      } else if (value && typeof value.destroy === "function") {
        try { value.destroy(); } catch {}
      }
    }
  }
}

function withHardTimeout(promise, ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      }
    );
  });
}

async function testProxy(proxyUrl) {
  let agent = null;

  const work = (async () => {
    try {
      const proxy = new URL(proxyUrl);
      agent = createProxyAgent(proxyUrl);

      const response = await axios.get(CHECK_TARGET, {
        httpAgent: agent,
        httpsAgent: agent,
        proxy: false,
        timeout: CHECK_TIMEOUT,
        responseType: "text",
        validateStatus: () => true,
      });

      const returnedIp = String(response.data || "").trim();
      if (returnedIp === proxy.hostname) return proxyUrl;
    } catch {}
    return null;
  })();

  const result = await withHardTimeout(work, HARD_TIMEOUT);

  destroyAgent(agent);

  return result;
}

async function runWithConcurrency(items, worker, concurrency) {
  const results = [];
  let index = 0;

  async function runner() {
    while (true) {
      const current = index++;
      if (current >= items.length) return;

      try {
        const result = await worker(items[current]);
        if (result) results.push(result);
      } catch {}
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runner()
  );

  await Promise.all(workers);
  return results;
}

async function fetchAllProxies() {
  const all = new Set();

  const results = await Promise.all(
    SOURCES.map(async (source) => {
      const proxies = await fetchSource(source);
      console.log(`[+] ${source.name}: ${proxies.length} candidates`);
      return proxies;
    })
  );

  for (const list of results) {
    for (const proxy of list) {
      all.add(proxy);
    }
  }

  return [...all];
}

function stripProtocol(proxyUrl) {
  return String(proxyUrl).replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
}

function writePool(fileName, proxies) {
  const target = path.join(OUTPUT_DIR, fileName);
  const body = proxies.length
    ? `${proxies.map(stripProtocol).join("\n")}\n`
    : "";
  fs.writeFileSync(target, body, "utf8");
}

async function main() {
  process.on("uncaughtException", () => {
    uncaughtCount++;
  });

  process.on("unhandledRejection", () => {
    uncaughtCount++;
  });

  console.log("==============================================");
  console.log("[PROXY] Fetching proxy lists...");
  console.log("==============================================");

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const proxies = await fetchAllProxies();
  const total = proxies.length;
  console.log(`\n[+] Unique proxy candidates: ${total}`);

  console.log("[PROXY] Checking alive proxies...");

  let checked = 0;
  let aliveCount = 0;
  const startedAt = Date.now();

  const heartbeat = setInterval(() => {
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    console.log(
      `[HEARTBEAT] ${checked}/${total} checked, ${aliveCount} alive, ${elapsed}s elapsed`
    );
  }, 15000);

  const alive = await runWithConcurrency(
    proxies,
    async (proxy) => {
      const result = await testProxy(proxy);
      checked++;
      if (result) {
        aliveCount++;
        if (aliveCount <= 200) console.log(`[ALIVE] ${result}`);
      }
      return result;
    },
    CONCURRENCY
  );

  clearInterval(heartbeat);

  const uniqueAlive = [...new Set(alive)].sort();

  const pools = {
    "http.txt": uniqueAlive.filter((p) => p.startsWith("http://")),
    "https.txt": uniqueAlive.filter((p) => p.startsWith("https://")),
    "socks4.txt": uniqueAlive.filter((p) => p.startsWith("socks4://")),
    "socks5.txt": uniqueAlive.filter((p) => p.startsWith("socks5://")),
  };

  for (const [fileName, list] of Object.entries(pools)) {
    writePool(fileName, list);
  }

  const elapsedTotal = Math.round((Date.now() - startedAt) / 1000);

  console.log("\n==============================================");
  console.log(`[DONE] Alive proxies: ${uniqueAlive.length}`);
  console.log(`       HTTP:   ${pools["http.txt"].length}`);
  console.log(`       HTTPS:  ${pools["https.txt"].length}`);
  console.log(`       SOCKS4: ${pools["socks4.txt"].length}`);
  console.log(`       SOCKS5: ${pools["socks5.txt"].length}`);
  console.log(`       Checked: ${checked}/${total} in ${elapsedTotal}s`);
  console.log(`       Uncaught: ${uncaughtCount}`);
  console.log(`Saved to: ${OUTPUT_DIR}/`);
  console.log("==============================================");
}

main().catch((error) => {
  console.error("[FATAL]", error);
  process.exitCode = 1;
});
