# Proxy Checker

Proxy checker berbasis Node.js untuk mengambil dan memvalidasi proxy HTTP, HTTPS, SOCKS4, dan SOCKS5 dari berbagai sumber publik.

## Install

```bash
npm install
```

## Jalankan

```bash
node check.js
```

atau:

```bash
npm start
```

## Penyimpanan Proxy

Proxy yang berhasil melewati pengecekan akan disimpan ke:

```text
./proxy-list/
```

Struktur:

```text
proxy-list/
├── http.txt
├── https.txt
├── socks4.txt
└── socks5.txt
```
